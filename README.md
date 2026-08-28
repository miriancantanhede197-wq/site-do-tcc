# VisionAid — Assistente Visual para Deficientes Visuais

> **Projeto de TCC** — Acessibilidade com Inteligência Artificial no Navegador  
> Uso em smartphone com óculos VR Box para reconhecimento de objetos e pessoas em tempo real.

---

## Sumário

1. [Visão geral](#visão-geral)
2. [Como funciona](#como-funciona)
3. [Estrutura do projeto](#estrutura-do-projeto)
4. [Como testar no celular](#como-testar-no-celular)
5. [Como publicar com HTTPS](#como-publicar-com-https)
6. [Limitações do protótipo](#limitações-do-protótipo)
7. [Privacidade e segurança](#privacidade-e-segurança)
8. [Dependências externas](#dependências-externas)

---

## Visão geral

O **VisionAid** é uma Progressive Web App (PWA) que usa:

- A **câmera traseira** do celular para capturar o ambiente em tempo real
- **TensorFlow.js + COCO-SSD** para detectar objetos e pessoas localmente no dispositivo
- A **Web Speech API** para narrar as detecções em voz alta em português do Brasil
- Um **modo VR** que divide a tela ao meio para uso com óculos VR Box

Todo o processamento ocorre **dentro do navegador**. Nenhuma imagem, vídeo ou dado pessoal é enviado a servidores externos.

---

## Como funciona

### 1. Acesso à câmera

```
Usuário toca "Iniciar câmera"
        ↓
navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        ↓
Navegador exibe pop-up de permissão
        ↓
Stream de vídeo → elemento <video> (invisível)
        ↓
Canvas desenhado por cima com os bounding boxes
```

A câmera só é solicitada **após o toque** do usuário, respeitando as políticas de permissão dos navegadores modernos. O atributo `facingMode: "environment"` seleciona a câmera traseira.

### 2. Reconhecimento de objetos

```
Frame do <video>
        ↓
cocoSsd.detect(videoElement)  ← inferência local, sem servidor
        ↓
Array de detecções: [ { class, score, bbox }, ... ]
        ↓
Filtro por confiança mínima (≥ 55%)
        ↓
Desenho de bounding boxes no <canvas>
        ↓
Geração de descrição em português
```

O modelo **COCO-SSD Lite MobileNet v2** reconhece 80 categorias de objetos. Para pessoas, apenas registra "pessoa" — sem reconhecimento facial ou identificação individual.

### 3. Síntese de voz

```
Descrição textual ("Uma pessoa à frente. Cadeira detectada.")
        ↓
SpeechSynthesisUtterance(texto)
utterance.lang = 'pt-BR'
        ↓
window.speechSynthesis.speak(utterance)
        ↓
Saída de áudio no alto-falante do celular
```

O anúncio só é repetido quando **a cena muda** ou após o **intervalo mínimo** de 3 segundos, evitando repetição excessiva.

---

## Estrutura do projeto

```
tcc-visionaid/
├── index.html          ← Estrutura HTML: tela de boas-vindas + tela de câmera
├── styles.css          ← Estilos: alto contraste, responsivo, acessível
├── app.js              ← Lógica principal: câmera, detecção, voz, controles
├── manifest.json       ← Manifesto PWA para instalação no Android
├── service-worker.js   ← Cache offline e estratégia de rede
├── icons/              ← Ícones do app (necessários para o PWA)
│   ├── icon-72.png
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-144.png
│   ├── icon-152.png
│   ├── icon-192.png    ← Ícone principal
│   ├── icon-384.png
│   └── icon-512.png    ← Ícone para splash screen
└── README.md           ← Esta documentação
```

> **Ícones:** Para gerar os ícones, crie uma imagem base de 512×512 px com fundo preto e um olho dourado centralizado e utilize um gerador como [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator) ou [RealFaviconGenerator](https://realfavicongenerator.net/).

---

## Como testar no celular

### Opção A — Servidor local via USB (recomendado para desenvolvimento)

1. Instale o [Node.js](https://nodejs.org/) no computador.
2. No terminal, dentro da pasta do projeto:

```bash
npx serve . --ssl-cert cert.pem --ssl-key key.pem
```

ou, para HTTP simples na rede local:

```bash
npx serve -l 3000
```

3. Conecte o celular Android ao mesmo Wi-Fi.
4. Descubra o IP do computador (`ipconfig` no Windows).
5. No celular, abra o Chrome e acesse `http://192.168.x.x:3000`.

> **Atenção:** HTTP sem HTTPS só funciona se o celular estiver em `localhost` ou via USB forwarding. Para rede local, use HTTPS (veja abaixo).

### Opção B — USB Forwarding com Android Debug Bridge (ADB)

1. Ative **Depuração USB** no Android (Configurações → Opções do desenvolvedor).
2. Conecte o celular ao computador por USB.
3. Execute no terminal do computador:

```bash
adb reverse tcp:3000 tcp:3000
npx serve -l 3000
```

4. No celular, acesse `http://localhost:3000` no Chrome.
5. O acesso à câmera funciona em `localhost` mesmo sem HTTPS.

### Opção C — Ngrok (HTTPS automático, sem servidor)

1. Baixe o [Ngrok](https://ngrok.com/) e autentique.
2. No terminal:

```bash
npx serve -l 3000
ngrok http 3000
```

3. Ngrok fornece uma URL HTTPS como `https://abc123.ngrok.io`.
4. Acesse essa URL no celular — câmera funcionará imediatamente.

---

## Como publicar com HTTPS

O acesso à câmera via `getUserMedia` **requer HTTPS** em produção (exceto localhost). Opções recomendadas:

### Vercel (recomendado — gratuito e instantâneo)

```bash
npm install -g vercel
cd tcc-visionaid
vercel deploy
```

O Vercel provisiona HTTPS automaticamente com certificado Let's Encrypt.

### Netlify (drag & drop)

1. Acesse [netlify.com](https://netlify.com).
2. Arraste a pasta `tcc-visionaid` para a área de deploy.
3. O site estará disponível em `https://seu-app.netlify.app`.

### GitHub Pages

```bash
git init
git add .
git commit -m "VisionAid TCC"
git remote add origin https://github.com/seu-usuario/visionaid.git
git push -u origin main
```

Ative o GitHub Pages nas configurações do repositório (branch `main`, pasta raiz). O site ficará em `https://seu-usuario.github.io/visionaid`.

### Servidor próprio com Nginx + Certbot

```nginx
server {
    listen 443 ssl;
    server_name seu-dominio.com;
    
    ssl_certificate     /etc/letsencrypt/live/seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com/privkey.pem;
    
    root /var/www/visionaid;
    index index.html;
}
```

```bash
sudo certbot --nginx -d seu-dominio.com
```

---

## Limitações do protótipo

| Limitação | Descrição |
|-----------|-----------|
| **Desempenho do celular** | A inferência do COCO-SSD consome CPU/GPU. Celulares com processadores fracos (menos de 4 núcleos ou sem GPU dedicada) podem exibir taxa de frames baixa (< 5 fps). O modelo `lite_mobilenet_v2` minimiza esse impacto. |
| **Iluminação** | Ambientes com pouca luz reduzem drasticamente a precisão. O modelo foi treinado com imagens bem iluminadas. Em locais escuros, o número de falsas negativas aumenta. |
| **Precisão do modelo** | O COCO-SSD detecta 80 categorias pré-definidas. Objetos fora dessas categorias (ex: torneira, parede, degrau de escada) não são detectados. A confiança pode ser baixa para objetos parcialmente visíveis ou em ângulos incomuns. |
| **Reconhecimento facial** | Intencionalmente ausente. O sistema identifica apenas que existe uma pessoa, sem nome, rosto ou identidade. Isso é uma decisão de projeto por privacidade. |
| **Compatibilidade de navegadores** | Chrome para Android é o mais compatível. Firefox Mobile tem suporte limitado à Web Speech API. Safari/iOS pode ter restrições no acesso à câmera e no speechSynthesis. |
| **Primeiro carregamento** | Requer conexão à internet para baixar os pesos do modelo (~5-6 MB via CDN). Após isso, o Service Worker faz cache e o app funciona offline. |
| **Modo VR e orientação** | O VR Box funciona melhor em orientação paisagem. Em retrato, cada olho recebe uma faixa estreita. O aplicativo não força orientação para não bloquear o uso normal. |
| **Latência de áudio** | A Web Speech API pode ter latência variável entre dispositivos (100ms a 500ms). Em alguns Androids, a voz sintetizada soa mecânica dependendo das vozes instaladas. |
| **Distância de detecção** | Objetos muito distantes (> 5 metros) ou muito pequenos no frame tendem a não ser detectados de forma confiável. |

---

## Privacidade e segurança

- ✅ **Sem coleta de dados:** nenhuma imagem, frame de vídeo ou dado pessoal é enviado a servidores.
- ✅ **Processamento local:** toda a inferência ocorre no navegador usando WebGL/WASM.
- ✅ **Consentimento explícito:** a câmera só é ativada após o toque no botão e a aceitação do pop-up do navegador.
- ✅ **Indicador de câmera ativa:** ponto vermelho piscante visível enquanto a câmera estiver em uso.
- ✅ **Sem reconhecimento facial:** o sistema detecta apenas a presença de pessoas, sem identificação.
- ✅ **Código aberto e auditável:** todo o processamento está visível no `app.js`.

---

## Dependências externas

| Biblioteca | Versão | Origem | Uso |
|------------|--------|--------|-----|
| TensorFlow.js | 4.17.0 | CDN jsDelivr | Motor de inferência ML no navegador |
| COCO-SSD | 2.2.3 | CDN jsDelivr | Modelo de detecção de objetos |

Ambas são licenciadas sob **Apache 2.0** e carregadas de `cdn.jsdelivr.net`. O Service Worker faz cache delas após o primeiro carregamento, permitindo uso offline.

---

*Desenvolvido como protótipo acadêmico para TCC — Acessibilidade e Inteligência Artificial.*
