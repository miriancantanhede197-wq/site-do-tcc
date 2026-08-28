/**
 * ================================================================
 *  VisionAid — service-worker.js
 *  Progressive Web App (PWA) Service Worker
 *
 *  Estratégia de cache:
 *  - Cache-first para os arquivos do app (HTML, CSS, JS).
 *  - Stale-while-revalidate para as bibliotecas externas (CDN).
 *  - Network-first para a detecção (não há chamadas de rede).
 *
 *  Após o primeiro carregamento com internet, o app funciona
 *  completamente offline (exceto o carregamento inicial dos pesos
 *  do modelo COCO-SSD, que também é cacheado na 1ª vez).
 * ================================================================
 */

'use strict';

/* ----------------------------------------------------------------
   VERSÃO DO CACHE
   Incremente CACHE_VERSAO sempre que alterar os arquivos do app
   para forçar a atualização nos dispositivos dos usuários.
---------------------------------------------------------------- */
const CACHE_VERSAO   = 'visionaid-v1';
const CACHE_CDN      = 'visionaid-cdn-v1';

/* ----------------------------------------------------------------
   ARQUIVOS DO APP — armazenados no cache local
---------------------------------------------------------------- */
const ARQUIVOS_APP = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

/* ----------------------------------------------------------------
   ORIGENS DA CDN — cacheadas separadamente
---------------------------------------------------------------- */
const ORIGENS_CDN = [
  'cdn.jsdelivr.net',
];

/* ================================================================
   EVENTO: install
   Executado uma vez ao registrar ou atualizar o Service Worker.
   Pré-carrega os arquivos essenciais do app no cache.
================================================================ */
self.addEventListener('install', evento => {
  console.log('[SW] Instalando Service Worker...');

  evento.waitUntil(
    caches.open(CACHE_VERSAO)
      .then(cache => {
        console.log('[SW] Cacheando arquivos do app...');
        return cache.addAll(ARQUIVOS_APP);
      })
      .then(() => {
        // Ativa o novo SW imediatamente sem esperar a aba fechar
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Erro no cache durante install:', err);
      })
  );
});

/* ================================================================
   EVENTO: activate
   Remove caches antigos quando uma nova versão do SW é ativada.
================================================================ */
self.addEventListener('activate', evento => {
  console.log('[SW] Ativando Service Worker versão:', CACHE_VERSAO);

  evento.waitUntil(
    caches.keys()
      .then(chaves => {
        return Promise.all(
          chaves
            .filter(chave => chave !== CACHE_VERSAO && chave !== CACHE_CDN)
            .map(chave => {
              console.log('[SW] Removendo cache antigo:', chave);
              return caches.delete(chave);
            })
        );
      })
      .then(() => {
        // Garante que o SW controle todas as abas imediatamente
        return self.clients.claim();
      })
  );
});

/* ================================================================
   EVENTO: fetch
   Intercepta todas as requisições de rede.
   Aplica estratégias diferentes conforme a origem.
================================================================ */
self.addEventListener('fetch', evento => {
  const url = new URL(evento.request.url);

  // Ignora requisições não-GET (POST, PUT etc.)
  if (evento.request.method !== 'GET') return;

  // Ignora URLs de extensões do navegador
  if (url.protocol === 'chrome-extension:') return;

  /* ----------------------------------------------------------
     Estratégia para CDN (TensorFlow.js, COCO-SSD):
     Stale-while-revalidate — serve do cache imediatamente
     e atualiza em segundo plano.
  ---------------------------------------------------------- */
  if (ORIGENS_CDN.some(origem => url.hostname.includes(origem))) {
    evento.respondWith(estrategiaCDN(evento.request));
    return;
  }

  /* ----------------------------------------------------------
     Estratégia para arquivos locais do app:
     Cache-first — serve do cache; se não encontrar, busca na rede.
  ---------------------------------------------------------- */
  evento.respondWith(estrategiaAppLocal(evento.request));
});

/* ================================================================
   ESTRATÉGIA: Cache-first para arquivos locais
================================================================ */
async function estrategiaAppLocal(requisicao) {
  const cache    = await caches.open(CACHE_VERSAO);
  const cacheado = await cache.match(requisicao);

  if (cacheado) {
    return cacheado;
  }

  try {
    const resposta = await fetch(requisicao);
    // Só cacheia respostas válidas
    if (resposta && resposta.status === 200) {
      cache.put(requisicao, resposta.clone());
    }
    return resposta;
  } catch (err) {
    console.warn('[SW] Recurso não disponível offline:', requisicao.url);
    // Retorna página de fallback se offline e recurso não cacheado
    const fallback = await cache.match('/index.html');
    return fallback || new Response('App offline. Recarregue com conexão para o primeiro uso.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/* ================================================================
   ESTRATÉGIA: Stale-while-revalidate para CDN
================================================================ */
async function estrategiaCDN(requisicao) {
  const cache    = await caches.open(CACHE_CDN);
  const cacheado = await cache.match(requisicao);

  // Inicia atualização em segundo plano (sem await)
  const promessaRede = fetch(requisicao)
    .then(resposta => {
      if (resposta && resposta.status === 200) {
        cache.put(requisicao, resposta.clone());
      }
      return resposta;
    })
    .catch(err => {
      console.warn('[SW] CDN offline, usando cache:', requisicao.url);
    });

  // Retorna o cache imediatamente se disponível
  return cacheado || promessaRede;
}
