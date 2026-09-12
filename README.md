# RunBeat

App PWA independente que casa, em tempo real, a cadência de passos da sua
corrida/caminhada com o andamento (BPM) das músicas — e troca a faixa
sozinho no Spotify quando o ritmo muda, sem precisar escolher música na mão.

**Status: fase 1 validada em teste real** — login, resolução de BPM, leitura
de cadência e troca automática de faixa testados numa corrida de verdade.

## Primeira vez abrindo o app

Na primeira visita, um tutorial guiado (5 passos) explica o fluxo completo
antes de qualquer coisa — dá pra pular a qualquer momento ("Pular") e
reabrir depois tocando no botão **"?"** no canto superior direito do
cabeçalho. A tela só passa depois disso é essencialmente igual, mas o
layout mudou pra deixar cada etapa mais clara: cada seção principal agora é
um cartão numerado (1. Escolha a fonte de músicas, 2. Corrida), e opções
que dependem de uma escolha anterior (Nível dentro de Ritmo fixo, Gêneros
dentro do Catálogo RunBeat) aparecem visualmente recuadas/indentadas, com
uma barra verde, dentro do controle do qual dependem.

## Como funciona

1. Você loga com sua conta Spotify (Premium — necessário pra controlar
   playback pela API) e escolhe a fonte de faixas: uma ou mais playlists
   específicas (+ "Músicas Curtidas"), o botão **"Analisar toda a minha
   biblioteca"** (junta automaticamente todas as suas playlists e as
   Curtidas de uma vez), e/ou o **"Catálogo RunBeat"** — uma opção extra na
   mesma lista de playlists, com uma seleção própria de ~8 mil músicas com
   BPM e gênero já classificados. Marcando essa opção aparece um segundo
   dropdown pra filtrar por gênero musical (ex. Rock, Pagode, Sertanejo,
   Funk) — nenhum gênero marcado usa o catálogo inteiro. É útil pra quem não
   tem muitas playlists, ou pra preencher faixas de BPM que suas próprias
   músicas não cobrem — cada entrada já vem com o ID real da faixa no
   Spotify (`public/data/runbeat-catalog.json`), sem precisar buscar por
   nome. Como a curadoria tem uma data própria, algumas faixas podem não
   existir mais no catálogo do Spotify — o app trata isso como falha normal
   e pula pra próxima candidata. Em qualquer caso, o pool junta as fontes
   sem repetir faixa que apareça em mais de uma — e o BPM já resolvido fica
   em cache local, então analisar de novo (com mais fontes) não perde o que
   já foi calculado antes.
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
6. Se o Spotify não tiver nenhum dispositivo ativo (app fechado, nada
   tocando ainda), aparece um botão **"▶ Abrir Spotify e começar"** — um
   toque só abre o app Spotify direto na faixa certa e já começa a tocar
   sozinho (link `spotify:track:<id>`, que só precisa de 1 toque porque
   nada mais está tocando ainda). O botão some assim que a próxima troca de
   faixa funcionar normalmente.
7. Enquanto a corrida está ativa, o app pede à tela pra não apagar sozinha
   (Screen Wake Lock). Isso evita que o navegador pare de rodar em segundo
   plano por *timeout* automático de tela. **Limite importante**: isso não
   evita que a tela apague se você apertar o botão físico de bloquear o
   celular — não existe API que intercepte isso; nesse caso a faixa atual
   continua tocando normalmente (é o app Spotify nativo, não a página do
   RunBeat, que toca o áudio), mas a troca automática de faixa só volta a
   acontecer quando você desbloquear e voltar pro RunBeat.
8. Um **pulso sonoro** (checkbox, opt-in) toca um clique curto no navegador
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
    │   └── runbeat-catalog.json # Catálogo RunBeat (~8 mil músicas, BPM + gênero)
    └── src/
        ├── config.js         # client ID do Spotify e parâmetros ajustáveis
        ├── spotifyAuth.js     # login OAuth (Authorization Code + PKCE)
        ├── spotifyApi.js      # playlists, faixas, controle de playback
        ├── bpmSource.js       # resolve BPM via ReccoBeats
        ├── catalogSource.js   # carrega o Catálogo RunBeat (BPM pré-resolvido, filtro por gênero)
        ├── cadence.js         # detecção de passos via acelerômetro
        ├── matcher.js         # escolhe a faixa certa pra cadência atual
        ├── onboarding.js      # tutorial guiado da primeira vez (e botão "?")
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

- Se você clicar em "Iniciar corrida" sem nenhum dispositivo Spotify ativo
  (app fechado, nada tocando), o RunBeat mostra um botão **"▶ Abrir Spotify
  e começar"** — um toque nele abre o app Spotify já tocando a faixa certa,
  sem precisar procurar nada lá dentro (o app não usa o Web Playback SDK, só
  comanda o dispositivo ativo).
- O RunBeat pede pra tela não apagar sozinha enquanto a corrida está ativa
  (Screen Wake Lock), mas isso não segura o botão físico de bloquear o
  celular — bloqueando manualmente, o sensor de passos e a troca automática
  de faixa pausam até você desbloquear e voltar ao app (a faixa que já
  estava tocando continua até o fim normalmente).

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
