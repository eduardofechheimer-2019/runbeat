# RunBeat

App PWA independente que casa, em tempo real, a cadência de passos da sua
corrida/caminhada com o andamento (BPM) das músicas — e troca a faixa
sozinho no Spotify quando o ritmo muda, sem precisar escolher música na mão.

**Status: fase 1 validada em teste real** — login, resolução de BPM, leitura
de cadência e troca automática de faixa testados numa corrida de verdade.

## Como funciona

1. Você loga com sua conta Spotify (Premium — necessário pra controlar
   playback pela API) e escolhe a fonte de faixas: uma ou mais playlists
   específicas (+ "Músicas Curtidas"), o botão **"Analisar toda a minha
   biblioteca"** (junta automaticamente todas as suas playlists e as
   Curtidas de uma vez), e/ou o **"Catálogo de referência"** — uma opção
   extra na mesma lista de playlists, com ~89 mil músicas de BPM já
   conhecido (dataset público CC0/domínio público, baseado em dados do
   Spotify: [maharshipandya/spotify-tracks-dataset](https://huggingface.co/datasets/maharshipandya/spotify-tracks-dataset)).
   É útil pra quem não tem muitas playlists, ou pra preencher faixas de BPM
   que suas próprias músicas não cobrem — cada entrada já vem com o ID real
   da faixa no Spotify (`public/data/songs-bpm.json`), sem precisar buscar
   por nome. Como o dataset tem uma data de captura própria, algumas faixas
   podem não existir mais no catálogo do Spotify — o app trata isso como
   falha normal e pula pra próxima candidata. Em qualquer caso, o pool junta
   as fontes sem repetir faixa que apareça em mais de uma — e o BPM já
   resolvido fica em cache local, então analisar de novo (com mais fontes)
   não perde o que já foi calculado antes.
2. O app resolve o BPM de cada faixa dessa fonte via [ReccoBeats](https://reccobeats.com/)
   (API gratuita, sem chave, que aceita o ID da faixa do Spotify diretamente
   — sem risco de casar com a versão errada de uma música).
3. Você escolhe o modo de ritmo, e pode **trocar a qualquer momento durante
   a corrida** (a troca vale na hora, sem precisar parar e reiniciar):
   - **Automático**: o acelerômetro do celular (`DeviceMotion`) mede sua
     cadência (passos/min) em tempo real.
   - **Ritmo fixo**: você escolhe uma faixa de BPM (nível), definida em
     `FIXED_PACE_OPTIONS` em `config.js`:
     | Nível | BPM |
     |---|---|
     | Easy Pace | 60–119 |
     | Warming Up | 120–149 |
     | Taking Off | 150–189 |
     | Pro | 190–220 |

     Qualquer faixa do pool dentro desse intervalo serve (escolhida ao
     acaso entre as candidatas); sem nenhuma no intervalo, cai pra mais
     próxima do limite. O sensor de passos continua rodando em segundo
     plano mesmo em ritmo fixo, então voltar pro automático depois também
     funciona sem reiniciar.
4. Cada faixa toca **até quase o fim** — pouco antes de acabar (por padrão,
   2 segundos antes, ajustável em `END_OF_TRACK_LEAD_MS`), o motor de
   matching escolhe a próxima faixa do pool com o BPM **mais próximo da
   cadência atual, numa relação fixa 1:1** (1 passo = 1 batida) e já manda o
   Spotify tocá-la — sem nunca interromper uma música no meio. Esse momento
   é calculado localmente a partir da duração da faixa (que já conhecemos),
   sem precisar perguntar ao Spotify "quanto falta".
5. Os botões **⏮ Anterior** / **⏭ Próxima** deixam pular manualmente pra
   faixa seguinte do pool (recalcula pela cadência atual) ou voltar pra
   última que já tocou nessa corrida.
6. Um **pulso sonoro** (checkbox, opt-in) toca um clique curto no navegador
   a cada batida do BPM-alvo, pra ajudar a sincronizar o passo com a
   batida. Não é sincronizado com o áudio real da faixa (a API do Spotify
   não expõe posição/fase de batida) — é um guia de ritmo constante a
   partir do momento em que a faixa começa a tocar, não a batida exata da
   música. Também não tem garantia de tocar junto com o Spotify sem
   interferir — por isso é opt-in. (A versão anterior tinha um metrônomo
   visual — removido após teste real, não ajudou o suficiente a perceber a
   batida.)

## Instalando como app no celular

O RunBeat é um PWA — dá pra instalar um ícone na tela de início, sem passar
pela App Store/Play Store:

- **iPhone (Safari)**: abra o link do app, toque no ícone de compartilhar
  (quadrado com seta pra cima) e escolha **"Adicionar à Tela de Início"**.
- **Android (Chrome)**: menu (⋮) → **"Adicionar à tela inicial"** / "Instalar
  app".

Depois disso abre em tela cheia, com o ícone do RunBeat, como qualquer app
instalado.

## Estrutura

```
runbeat/
└── public/                  # tudo publicado no host estático (Netlify, etc.)
    ├── index.html
    ├── manifest.json         # manifesto PWA
    ├── sw.js                 # service worker (cache do app shell)
    ├── icon.svg
    ├── css/style.css
    ├── data/
    │   └── songs-bpm.json     # catálogo de referência (~89 mil músicas, CC0)
    └── src/
        ├── config.js         # client ID do Spotify e parâmetros ajustáveis
        ├── spotifyAuth.js     # login OAuth (Authorization Code + PKCE)
        ├── spotifyApi.js      # playlists, faixas, controle de playback
        ├── bpmSource.js       # resolve BPM via ReccoBeats
        ├── catalogSource.js   # carrega o catálogo de referência (BPM pré-resolvido)
        ├── cadence.js         # detecção de passos via acelerômetro
        ├── matcher.js         # escolhe a faixa certa pra cadência atual
        └── app.js             # orquestra a UI e o loop de matching
```

Sem build step — é só HTML/CSS/JS puro (ES modules), pronto pra subir a
pasta `public/` direto num host estático.

## Configuração necessária antes de usar

### 1. App no Spotify Developer Dashboard

1. Crie um app em https://developer.spotify.com/dashboard.
2. Em "Redirect URIs", cadastre a URL onde o app vai rodar — por exemplo
   `http://localhost:5173/` pra testar local, e a URL de produção depois do
   deploy (ex. `https://runbeat.netlify.app/`). Pode cadastrar várias.
3. Copie o **Client ID** e cole em `public/src/config.js`, na constante
   `SPOTIFY_CLIENT_ID`.
4. Sua conta Spotify precisa ser **Premium** — a API de controle de
   playback (`/me/player/play`) não funciona em conta gratuita.

### 2. Rodando local

Qualquer servidor estático simples serve, por exemplo:

```
cd public && python3 -m http.server 5173 --bind 127.0.0.1
```

Abra `http://127.0.0.1:5173/index.html` (precisa ser esse endereço exato —
Spotify não aceita mais `localhost` puro como Redirect URI, só `127.0.0.1`
ou HTTPS — batendo com o que foi cadastrado no app).

### 3. Durante o uso

- Abra o app Spotify no celular e comece a tocar qualquer coisa antes de
  clicar em "Iniciar corrida" — a API só consegue trocar de faixa se já
  houver um dispositivo Spotify ativo (o app não usa o Web Playback SDK, só
  comanda o dispositivo já tocando).
- No iPhone, mantenha a tela ligada durante a corrida — o sensor de
  movimento para de disparar com a tela bloqueada/app em segundo plano.

## Limitações conhecidas desta primeira versão (fase 1)

- **BPM via ReccoBeats: validado em teste real** — em torno de 78% das
  faixas de uma playlist de teste (Músicas Curtidas) tiveram BPM resolvido.
  Faixas sem BPM na ReccoBeats simplesmente ficam fora do pool.
- **Sem fallback de fonte de BPM** ainda (GetSongBPM, por título/artista) —
  faixas sem BPM na ReccoBeats simplesmente ficam fora do pool. Fica como
  próximo passo se a cobertura da ReccoBeats se mostrar insuficiente.
- **Detecção de passo** é um algoritmo simples de pico no acelerômetro —
  pode precisar de calibração (limiar `PEAK_THRESHOLD_G` em `cadence.js`)
  conforme onde o celular fica (mão, braço, bolso).
- **Web Bluetooth / monitor de frequência cardíaca**: não incluído nesta
  fase — o foco é cadência de passos.
