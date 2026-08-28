/**
 * ================================================================
 *  VisionAid — app.js
 *  Assistente visual para pessoas com deficiência visual.
 *  TCC — Acessibilidade com IA no navegador.
 *
 *  Fluxo principal:
 *  1. Usuário toca "Iniciar câmera"
 *  2. getUserMedia abre a câmera traseira
 *  3. COCO-SSD é carregado (pesos via CDN / cache do SW)
 *  4. Loop de detecção: captura frame → detecta → desenha → fala
 *  5. Áudio só é repetido quando a cena muda (intervalo configurável)
 * ================================================================
 */

'use strict';

/* ----------------------------------------------------------------
   CONFIGURAÇÕES GLOBAIS (ajustáveis para o TCC)
---------------------------------------------------------------- */
const CONFIG = {
  /** Intervalo mínimo (ms) entre anúncios de voz para a MESMA cena */
  INTERVALO_ANUNCIO_MS: 3000,

  /** Confiança mínima para aceitar uma detecção (0–1) */
  CONFIANCA_MINIMA: 0.55,

  /** Máximo de objetos exibidos na descrição de voz */
  MAX_OBJETOS_ANUNCIO: 4,

  /** Taxa de quadros alvo para o loop de detecção (fps) */
  FPS_ALVO: 10,

  /** Cor das caixas de detecção no canvas */
  COR_BOX: '#FFD700',

  /** Cor do texto das labels no canvas */
  COR_TEXTO_BOX: '#000000',

  /** Tamanho da fonte das labels (canvas) */
  FONTE_BOX: 'bold 14px Arial',
};

/* ----------------------------------------------------------------
   TRADUÇÃO DAS CATEGORIAS DO COCO-SSD PARA PORTUGUÊS
   Apenas as categorias mais relevantes para uso cotidiano são
   incluídas. Itens não mapeados usam o nome original em inglês.
---------------------------------------------------------------- */
const TRADUCAO = {
  person:           'pessoa',
  bicycle:          'bicicleta',
  car:              'carro',
  motorcycle:       'moto',
  bus:              'ônibus',
  truck:            'caminhão',
  traffic_light:    'semáforo',
  stop_sign:        'placa de pare',
  bench:            'banco',
  backpack:         'mochila',
  umbrella:         'guarda-chuva',
  handbag:          'bolsa',
  bottle:           'garrafa',
  cup:              'copo',
  fork:             'garfo',
  knife:            'faca',
  spoon:            'colher',
  bowl:             'tigela',
  chair:            'cadeira',
  couch:            'sofá',
  potted_plant:     'vaso de planta',
  bed:              'cama',
  dining_table:     'mesa',
  toilet:           'vaso sanitário',
  tv:               'televisão',
  laptop:           'computador',
  mouse:            'mouse',
  keyboard:         'teclado',
  cell_phone:       'celular',
  microwave:        'micro-ondas',
  oven:             'forno',
  refrigerator:     'geladeira',
  book:             'livro',
  clock:            'relógio',
  vase:             'vaso',
  scissors:         'tesoura',
  door:             'porta',
  window:           'janela',
  stairs:           'escada',
  dog:              'cachorro',
  cat:              'gato',
  bird:             'pássaro',
  horse:            'cavalo',
};

/* ----------------------------------------------------------------
   ESTADO DA APLICAÇÃO
---------------------------------------------------------------- */
const estado = {
  modeloCarregado:    false,  // COCO-SSD foi carregado?
  cameraAtiva:        false,  // stream de câmera está rodando?
  audioAtivo:         true,   // síntese de voz habilitada?
  modoVR:             false,  // modo VR Box ativado?
  detectando:         false,  // loop de detecção em execução?
  streamAtual:        null,   // MediaStream ativo
  ultimaDescricao:    '',     // última frase anunciada
  ultimoAnuncio:      0,      // timestamp do último anúncio
  ultimaFala:         null,   // SpeechSynthesisUtterance atual
  animFrameId:        null,   // ID do requestAnimationFrame
  modelo:             null,   // referência ao modelo cocoSsd
  ultimoFrame:        0,      // timestamp do último frame processado
};

/* ----------------------------------------------------------------
   REFERÊNCIAS AOS ELEMENTOS DO DOM
---------------------------------------------------------------- */
const el = {
  // Telas
  telaBV:         document.getElementById('tela-boas-vindas'),
  telaCamera:     document.getElementById('tela-camera'),

  // Tela de boas-vindas
  statusBadge:    document.getElementById('status-badge'),
  btnIniciar:     document.getElementById('btn-iniciar'),
  msgErro:        document.getElementById('mensagem-erro'),

  // Câmera
  video:          document.getElementById('video'),
  canvas:         document.getElementById('canvas'),
  canvasVR:       document.getElementById('canvas-vr'),
  vrContainer:    document.getElementById('vr-container'),
  olhoDireito:    document.getElementById('olho-direito'),

  // Controles
  statusCamera:   document.getElementById('status-camera'),
  btnParar:       document.getElementById('btn-parar'),
  btnAudio:       document.getElementById('btn-audio'),
  btnVR:          document.getElementById('btn-vr'),
  btnRepetir:     document.getElementById('btn-repetir'),
  btnFullscreen:  document.getElementById('btn-fullscreen'),
  ultimaDeteccao: document.getElementById('ultima-deteccao'),
};

/* ================================================================
   INICIALIZAÇÃO
   Registra o Service Worker e conecta os eventos dos botões.
================================================================ */
function inicializar() {
  // Registrar PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(() => console.log('[SW] Service Worker registrado com sucesso.'))
      .catch(err => console.warn('[SW] Falha ao registrar Service Worker:', err));
  }

  // Botão principal da tela de boas-vindas
  el.btnIniciar.addEventListener('click', solicitarCameraEIniciar);

  // Botões da tela da câmera
  el.btnParar.addEventListener('click',      pararCamera);
  el.btnAudio.addEventListener('click',      alternarAudio);
  el.btnVR.addEventListener('click',         alternarModoVR);
  el.btnRepetir.addEventListener('click',    repetirUltimaDescricao);
  el.btnFullscreen.addEventListener('click', alternarTelaCheia);

  // Atualiza botão de fullscreen quando o estado muda externamente
  document.addEventListener('fullscreenchange',       atualizarBotaoFullscreen);
  document.addEventListener('webkitfullscreenchange', atualizarBotaoFullscreen);
}

/* ================================================================
   CÂMERA — solicitar permissão e iniciar stream
================================================================ */
async function solicitarCameraEIniciar() {
  atualizarStatus('aguardando', '⏳ Aguardando permissão da câmera...');
  el.btnIniciar.disabled = true;
  ocultarErro();

  try {
    // Solicita acesso à câmera TRASEIRA (facingMode: environment)
    // Esta chamada aciona o pop-up de permissão do navegador.
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' }, // câmera traseira
        width:      { ideal: 1280 },
        height:     { ideal: 720 },
      },
      audio: false, // nenhum áudio da câmera é capturado
    });

    estado.streamAtual = stream;
    estado.cameraAtiva = true;

    // Conecta o stream ao elemento <video>
    el.video.srcObject = stream;

    // Aguarda o vídeo estar pronto para reprodução
    await new Promise((resolve, reject) => {
      el.video.onloadedmetadata = resolve;
      el.video.onerror = reject;
    });

    await el.video.play();

    // Troca de tela
    el.telaBV.hidden    = true;
    el.telaCamera.hidden = false;

    // Adiciona indicador visual de câmera ativa (ponto vermelho)
    adicionarIndicadorCamera();

    // Atualiza status
    atualizarStatusCamera('carregando', '🔄 Reconhecimento carregando...');
    el.ultimaDeteccao.textContent = 'Carregando modelo de IA...';

    // Fala aviso inicial
    falar('Câmera iniciada. Carregando reconhecimento de objetos.');

    // Carrega o modelo COCO-SSD (baixado do CDN na 1ª vez)
    await carregarModelo();

    // Ajusta o canvas ao tamanho do vídeo
    ajustarCanvas();
    window.addEventListener('resize', ajustarCanvas);

    // Inicia o loop de detecção
    iniciarLoopDeteccao();

  } catch (err) {
    tratarErroCamara(err);
    el.btnIniciar.disabled = false;
  }
}

/* ================================================================
   MODELO — carrega o COCO-SSD
================================================================ */
async function carregarModelo() {
  try {
    console.log('[IA] Carregando modelo COCO-SSD...');

    // cocoSsd é exposto globalmente pelo script da CDN
    estado.modelo = await cocoSsd.load({
      base: 'lite_mobilenet_v2', // modelo leve — ideal para celulares
    });

    estado.modeloCarregado = true;
    console.log('[IA] Modelo COCO-SSD carregado.');
    atualizarStatusCamera('ativo', '✅ Reconhecimento ativo');
    el.ultimaDeteccao.textContent = 'Procurando objetos...';
    falar('Reconhecimento ativo. Apontando câmera para o ambiente.');

  } catch (err) {
    console.error('[IA] Erro ao carregar modelo:', err);
    atualizarStatusCamera('erro', '❌ Erro ao carregar modelo de IA');
    exibirErroNaTela('Não foi possível carregar o modelo de inteligência artificial. Verifique sua conexão e recarregue a página.');
    falar('Erro ao carregar o modelo de inteligência artificial. Verifique sua conexão.');
  }
}

/* ================================================================
   LOOP DE DETECÇÃO
   Usa requestAnimationFrame com limitador de FPS para não
   sobrecarregar o processador do celular.
================================================================ */
function iniciarLoopDeteccao() {
  estado.detectando = true;

  async function frame(agora) {
    if (!estado.detectando) return;

    // Limita a taxa de processamento ao FPS_ALVO configurado
    const intervaloFrame = 1000 / CONFIG.FPS_ALVO;
    if (agora - estado.ultimoFrame >= intervaloFrame) {
      estado.ultimoFrame = agora;

      if (estado.modeloCarregado && estado.cameraAtiva) {
        await processarFrame();
      }
    }

    estado.animFrameId = requestAnimationFrame(frame);
  }

  estado.animFrameId = requestAnimationFrame(frame);
}

/* ================================================================
   PROCESSAMENTO DE FRAME
   Captura o frame atual do vídeo, executa a detecção e
   desenha os resultados no canvas.
================================================================ */
async function processarFrame() {
  const video  = el.video;
  const canvas = el.canvas;
  const ctx    = canvas.getContext('2d');

  // Verifica se o vídeo tem dados válidos
  if (video.readyState < 2) return;

  // Limpa o canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Desenha o frame do vídeo no canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  try {
    // Executa a detecção de objetos no frame atual
    // A inferência ocorre LOCALMENTE no navegador — nenhum dado é enviado
    const deteccoes = await estado.modelo.detect(video);

    // Filtra pelo nível mínimo de confiança
    const validas = deteccoes.filter(d => d.score >= CONFIG.CONFIANCA_MINIMA);

    // Desenha as caixas delimitadoras (bounding boxes) no canvas
    desenharBoundingBoxes(ctx, validas);

    // Copia o canvas principal para o canvas do VR (olho direito)
    if (estado.modoVR) {
      copiarCanvasVR();
    }

    // Gera e anuncia a descrição da cena atual
    const descricao = gerarDescricao(validas);
    if (descricao) {
      exibirDescricao(descricao);
      anunciarSeNecessario(descricao);
    }

  } catch (err) {
    // Erros de inferência são silenciosos para não travar o loop
    console.warn('[IA] Erro na detecção:', err.message);
  }
}

/* ================================================================
   BOUNDING BOXES — desenha as caixas e labels no canvas
================================================================ */
function desenharBoundingBoxes(ctx, deteccoes) {
  deteccoes.forEach(det => {
    const [x, y, largura, altura] = det.bbox;
    const label = traduzir(det.class);
    const confianca = Math.round(det.score * 100);

    // Caixa delimitadora
    ctx.strokeStyle = CONFIG.COR_BOX;
    ctx.lineWidth   = 3;
    ctx.strokeRect(x, y, largura, altura);

    // Fundo da label (retângulo semitransparente)
    ctx.font = CONFIG.FONTE_BOX;
    const textoLabel = `${label} ${confianca}%`;
    const larguraTexto = ctx.measureText(textoLabel).width;
    const alturaFonte  = 18;
    const paddingLabel = 4;

    ctx.fillStyle = CONFIG.COR_BOX;
    ctx.fillRect(
      x,
      y - alturaFonte - paddingLabel * 2,
      larguraTexto + paddingLabel * 2,
      alturaFonte + paddingLabel * 2
    );

    // Texto da label
    ctx.fillStyle = CONFIG.COR_TEXTO_BOX;
    ctx.fillText(textoLabel, x + paddingLabel, y - paddingLabel - 2);
  });
}

/* ================================================================
   CANVAS VR — copia o canvas principal para o canvas do olho direito
================================================================ */
function copiarCanvasVR() {
  const ctxVR = el.canvasVR.getContext('2d');
  ctxVR.drawImage(el.canvas, 0, 0, el.canvasVR.width, el.canvasVR.height);
}

/* ================================================================
   GERAÇÃO DE DESCRIÇÃO DE VOZ
   Converte as detecções em frases naturais em português.
================================================================ */
function gerarDescricao(deteccoes) {
  if (!deteccoes || deteccoes.length === 0) return '';

  // Conta quantas vezes cada categoria aparece
  const contagem = {};
  deteccoes.forEach(det => {
    const categoria = traduzir(det.class);
    contagem[categoria] = (contagem[categoria] || 0) + 1;
  });

  // Ordena por quantidade (decrescente) e limita ao máximo configurado
  const categorias = Object.entries(contagem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, CONFIG.MAX_OBJETOS_ANUNCIO);

  const partes = categorias.map(([nome, qtd]) => {
    if (nome === 'pessoa') {
      // Concordância nominal especial para "pessoa/pessoas"
      return qtd === 1 ? 'uma pessoa à frente' : `${numPorExtenso(qtd)} pessoas à frente`;
    }
    return qtd === 1 ? `${nome} detectado` : `${numPorExtenso(qtd)} ${nome}s detectados`;
  });

  if (partes.length === 1) return capitalize(partes[0]) + '.';
  if (partes.length === 2) return capitalize(partes[0]) + ' e ' + partes[1] + '.';

  // Mais de 2 itens: lista com vírgulas
  const ultimo = partes.pop();
  return capitalize(partes.join(', ') + ' e ' + ultimo) + '.';
}

/* ================================================================
   ANÚNCIO POR VOZ
   Anuncia a descrição apenas quando a cena mudou ou quando
   passou o intervalo mínimo configurado.
================================================================ */
function anunciarSeNecessario(descricao) {
  if (!estado.audioAtivo) return;

  const agora = Date.now();
  const passouIntervalo = (agora - estado.ultimoAnuncio) >= CONFIG.INTERVALO_ANUNCIO_MS;
  const cenaAlterou    = descricao !== estado.ultimaDescricao;

  if (cenaAlterou || passouIntervalo) {
    estado.ultimaDescricao = descricao;
    estado.ultimoAnuncio   = agora;
    falar(descricao);
  }
}

/* ================================================================
   SÍNTESE DE VOZ — Web Speech API
   Usa speechSynthesis para converter texto em áudio em PT-BR.
   Nenhum áudio é enviado para servidores — tudo ocorre localmente.
================================================================ */
function falar(texto) {
  if (!estado.audioAtivo) return;
  if (!('speechSynthesis' in window)) {
    console.warn('[Voz] Web Speech API não suportada neste navegador.');
    return;
  }

  // Cancela qualquer fala em andamento para evitar sobreposição
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(texto);
  utterance.lang  = 'pt-BR';    // Português do Brasil
  utterance.rate  = 1.0;        // Velocidade normal
  utterance.pitch = 1.0;        // Tom normal
  utterance.volume = 1.0;       // Volume máximo

  // Tenta selecionar uma voz em português, se disponível
  const vozes = window.speechSynthesis.getVoices();
  const vozPT = vozes.find(v =>
    v.lang.startsWith('pt') &&
    (v.lang.includes('BR') || v.lang.includes('br'))
  ) || vozes.find(v => v.lang.startsWith('pt'));

  if (vozPT) utterance.voice = vozPT;

  estado.ultimaFala = utterance;
  window.speechSynthesis.speak(utterance);
}

/* ================================================================
   CONTROLES — handlers dos botões
================================================================ */

/** Para a câmera e volta à tela inicial */
function pararCamera() {
  estado.detectando = false;
  estado.cameraAtiva = false;

  // Cancela o loop de animação
  if (estado.animFrameId) {
    cancelAnimationFrame(estado.animFrameId);
    estado.animFrameId = null;
  }

  // Para o stream de vídeo e libera a câmera (luz do LED apaga)
  if (estado.streamAtual) {
    estado.streamAtual.getTracks().forEach(track => track.stop());
    estado.streamAtual = null;
  }

  el.video.srcObject = null;

  // Cancela fala atual
  window.speechSynthesis?.cancel();

  // Remove indicador de câmera ativa
  removerIndicadorCamera();

  // Sai do fullscreen se necessário
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  }

  // Remove modo VR se estava ativo
  if (estado.modoVR) {
    estado.modoVR = false;
    el.telaCamera.classList.remove('modo-vr');
  }

  // Volta para a tela de boas-vindas
  el.telaCamera.hidden  = true;
  el.telaBV.hidden      = false;
  el.btnIniciar.disabled = false;

  atualizarStatus('aguardando', '⏳ Aguardando permissão da câmera');
  falar('Câmera desativada.');
}

/** Ativa ou desativa a saída de voz */
function alternarAudio() {
  estado.audioAtivo = !estado.audioAtivo;
  const ativo = estado.audioAtivo;

  el.btnAudio.setAttribute('aria-pressed', String(ativo));
  el.btnAudio.setAttribute('aria-label', ativo ? 'Desativar áudio' : 'Ativar áudio');
  el.btnAudio.classList.toggle('btn-ativo', ativo);
  el.btnAudio.querySelector('.btn-label').textContent = ativo ? 'Áudio' : 'Mudo';
  el.btnAudio.querySelector('span:first-child') || (el.btnAudio.childNodes[0].textContent = ativo ? '🔊' : '🔇');

  // Usa o emoji diretamente pelo innerHTML para garantir atualização
  el.btnAudio.innerHTML = ativo
    ? `🔊<span class="btn-label">Áudio</span>`
    : `🔇<span class="btn-label">Mudo</span>`;

  if (!ativo) window.speechSynthesis?.cancel();

  // Confirma o novo estado por voz (se áudio foi ligado)
  if (ativo) falar('Áudio ativado.');
}

/** Ativa ou desativa o modo VR Box */
function alternarModoVR() {
  estado.modoVR = !estado.modoVR;
  const ativo = estado.modoVR;

  el.telaCamera.classList.toggle('modo-vr', ativo);
  el.btnVR.setAttribute('aria-pressed', String(ativo));
  el.btnVR.setAttribute('aria-label', ativo ? 'Desativar modo VR Box' : 'Ativar modo VR Box');
  el.btnVR.classList.toggle('btn-ativo', ativo);

  if (ativo) {
    // Sincroniza tamanho do canvas VR com o principal
    el.canvasVR.width  = el.canvas.width;
    el.canvasVR.height = el.canvas.height;
    falar('Modo VR ativado. Coloque o celular no óculos.');
  } else {
    falar('Modo VR desativado.');
  }
}

/** Repete a última descrição em voz */
function repetirUltimaDescricao() {
  if (estado.ultimaDescricao) {
    falar(estado.ultimaDescricao);
  } else {
    falar('Nenhuma detecção registrada ainda.');
  }
}

/** Alterna entre tela cheia e modo normal */
function alternarTelaCheia() {
  if (!document.fullscreenElement) {
    // Tenta entrar em fullscreen — funciona em HTTPS ou localhost
    (document.documentElement.requestFullscreen ||
     document.documentElement.webkitRequestFullscreen ||
     document.documentElement.mozRequestFullScreen)
      ?.call(document.documentElement)
      .catch(err => console.warn('[FS] Tela cheia não disponível:', err));
  } else {
    (document.exitFullscreen ||
     document.webkitExitFullscreen ||
     document.mozCancelFullScreen)
      ?.call(document);
  }
}

/** Atualiza o ícone do botão de fullscreen conforme o estado atual */
function atualizarBotaoFullscreen() {
  const emFS = !!document.fullscreenElement;
  el.btnFullscreen.innerHTML = emFS
    ? `⛶<span class="btn-label">Sair</span>`
    : `⛶<span class="btn-label">Tela cheia</span>`;
  el.btnFullscreen.setAttribute('aria-label', emFS ? 'Sair da tela cheia' : 'Ativar tela cheia');
}

/* ================================================================
   AJUSTE DO CANVAS
   Sincroniza o tamanho do canvas com o vídeo para que os
   bounding boxes fiquem alinhados corretamente.
================================================================ */
function ajustarCanvas() {
  const video = el.video;

  // Usa o tamanho real do vídeo capturado
  const largura = video.videoWidth  || video.clientWidth  || 640;
  const altura  = video.videoHeight || video.clientHeight || 480;

  el.canvas.width  = largura;
  el.canvas.height = altura;

  if (estado.modoVR) {
    el.canvasVR.width  = largura;
    el.canvasVR.height = altura;
  }

  console.log(`[Canvas] Ajustado para ${largura}x${altura}`);
}

/* ================================================================
   INDICADOR VISUAL DE CÂMERA ATIVA
   Ponto vermelho piscante para indicar que a câmera está em uso.
   Importante para transparência com o usuário.
================================================================ */
function adicionarIndicadorCamera() {
  if (document.getElementById('indicador-camera')) return;
  const indicador = document.createElement('div');
  indicador.id = 'indicador-camera';
  indicador.className = 'indicador-camera-ativa';
  indicador.setAttribute('role', 'img');
  indicador.setAttribute('aria-label', 'Câmera ativa');
  indicador.title = 'Câmera ativa';
  el.telaCamera.appendChild(indicador);
}

function removerIndicadorCamera() {
  document.getElementById('indicador-camera')?.remove();
}

/* ================================================================
   ATUALIZAÇÃO DE STATUS (tela de boas-vindas)
================================================================ */
function atualizarStatus(tipo, texto) {
  const badge = el.statusBadge;
  badge.textContent = texto;
  badge.className = 'status-badge';

  const mapa = {
    aguardando: 'status-aguardando',
    ativo:      'status-ativo',
    erro:       'status-erro',
    carregando: 'status-carregando',
  };

  if (mapa[tipo]) badge.classList.add(mapa[tipo]);
}

/* ================================================================
   ATUALIZAÇÃO DE STATUS (tela da câmera)
================================================================ */
function atualizarStatusCamera(tipo, texto) {
  el.statusCamera.textContent = texto;
}

/* ================================================================
   EXIBIÇÃO DE DESCRIÇÃO NA TELA
================================================================ */
function exibirDescricao(descricao) {
  el.ultimaDeteccao.textContent = descricao;
}

/* ================================================================
   TRATAMENTO DE ERROS DE CÂMERA
================================================================ */
function tratarErroCamara(err) {
  console.error('[Câmera] Erro:', err.name, err.message);

  let mensagem = '';
  let statusTipo = 'erro';

  switch (err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      mensagem = '🚫 Permissão negada. Você recusou o acesso à câmera. Para usar o aplicativo, autorize o acesso nas configurações do navegador e recarregue a página.';
      atualizarStatus('erro', '🚫 Permissão negada');
      falar('Permissão da câmera negada. Autorize nas configurações do navegador.');
      break;

    case 'NotFoundError':
    case 'DevicesNotFoundError':
      mensagem = '📵 Câmera indisponível. Nenhuma câmera foi encontrada neste dispositivo.';
      atualizarStatus('erro', '📵 Câmera indisponível');
      falar('Nenhuma câmera encontrada no dispositivo.');
      break;

    case 'NotReadableError':
    case 'TrackStartError':
      mensagem = '⚠️ A câmera está sendo usada por outro aplicativo. Feche outros apps que usam a câmera e tente novamente.';
      atualizarStatus('erro', '⚠️ Câmera ocupada');
      falar('A câmera está em uso por outro aplicativo.');
      break;

    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      mensagem = '⚠️ Não foi possível usar a câmera traseira. Tentando câmera frontal...';
      atualizarStatus('aviso', '⚠️ Ajustando câmera');
      // Tenta fallback sem restrição de facingMode
      tentarFallbackCamera();
      return;

    case 'SecurityError':
      mensagem = '🔒 Erro de segurança. O acesso à câmera requer HTTPS. Certifique-se de que o site está servido via HTTPS.';
      atualizarStatus('erro', '🔒 Erro de segurança (HTTPS necessário)');
      break;

    default:
      mensagem = `❌ Erro desconhecido ao acessar a câmera: ${err.message}. Recarregue a página e tente novamente.`;
      atualizarStatus('erro', '❌ Erro ao acessar câmera');
      break;
  }

  exibirErroNaTela(mensagem);
}

/** Fallback: tenta abrir câmera sem restrição de lado */
async function tentarFallbackCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    estado.streamAtual = stream;
    // Continua o fluxo normal (simplificado)
    el.video.srcObject = stream;
    await el.video.play();
    el.telaBV.hidden    = true;
    el.telaCamera.hidden = false;
    adicionarIndicadorCamera();
    atualizarStatusCamera('carregando', '🔄 Reconhecimento carregando...');
    await carregarModelo();
    ajustarCanvas();
    iniciarLoopDeteccao();
  } catch (err2) {
    exibirErroNaTela('❌ Não foi possível acessar nenhuma câmera. Verifique as permissões e recarregue a página.');
    atualizarStatus('erro', '❌ Câmera indisponível');
  }
}

/* ================================================================
   UTILITÁRIOS
================================================================ */

/** Traduz um nome de categoria COCO para português */
function traduzir(classe) {
  return TRADUCAO[classe] || TRADUCAO[classe.replace(/ /g, '_')] || classe;
}

/** Converte número para string por extenso (1–20) */
function numPorExtenso(n) {
  const extenso = [
    '', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete',
    'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze',
    'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte',
  ];
  return extenso[n] || String(n);
}

/** Capitaliza a primeira letra de uma string */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Exibe mensagem de erro na tela de boas-vindas */
function exibirErroNaTela(mensagem) {
  el.msgErro.textContent = mensagem;
  el.msgErro.hidden = false;
}

/** Oculta a mensagem de erro */
function ocultarErro() {
  el.msgErro.hidden = true;
  el.msgErro.textContent = '';
}

/* ================================================================
   VOZES — força o carregamento da lista de vozes no Android/Chrome
   O Chrome carrega as vozes de forma assíncrona.
================================================================ */
function preCarregarVozes() {
  if (!('speechSynthesis' in window)) return;

  // Tenta obter as vozes imediatamente
  let vozes = window.speechSynthesis.getVoices();

  // Se não houver vozes ainda, aguarda o evento onvoiceschanged
  if (vozes.length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      vozes = window.speechSynthesis.getVoices();
      console.log(`[Voz] ${vozes.length} vozes carregadas.`);
    };
  } else {
    console.log(`[Voz] ${vozes.length} vozes disponíveis.`);
  }
}

/* ================================================================
   ENTRY POINT — inicia quando o DOM estiver pronto
================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  preCarregarVozes();
  inicializar();
  console.log('[VisionAid] Aplicação inicializada. Aguardando ação do usuário.');
});
