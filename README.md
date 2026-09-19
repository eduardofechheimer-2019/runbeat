# RunBeat

App PWA independente que casa, em tempo real, a cadência de passos da sua
corrida/caminhada com o andamento (BPM) das músicas — e troca a faixa
sozinho no Spotify quando o ritmo muda, sem precisar escolher música na mão.

**Status: fase 1 validada em teste real** — login, resolução de BPM, leitura
de cadência e troca automática de faixa testados numa corrida de verdade.

## Identidade visual

Fundo com textura marmorizada preta (imagem em `public/img/bg-marble.webp`),
tipografia em itálico bold (Google Fonts "Archivo") no nome "RunBeat" e nos
títulos, e amarelo/dourado como cor de destaque (`--accent` em `style.css`,
com variações de intensidade `--accent-soft`/`--accent-strong`) em vez do
verde do Spotify — usada em botões, ícone do app e nos indicadores numerados
dos cartões. Os cartões (seções) têm fundo semitransparente com desfoque
(`backdrop-filter`), deixando a textura do fundo aparecer sutilmente atrás
do conteúdo. O logo (`icon.svg`) — um círculo com linhas de movimento e uma
nota musical — aparece ao lado do nome "RunBeat" no
cabeçalho, que fica com um respiro extra no topo (`env(safe-area-inset-top)`)
pra não ficar atrás do relógio/notch do celular.

## Abrindo o app

Toda vez que o app abre, aparece por ~1,2s uma tela de splash com o ícone do
RunBeat em fade-in no meio da tela — depois some sozinha, sem precisar de
toque nenhum, revelando o cabeçalho e o cartão 1, já nas posições finais
deles na página (sem nenhuma dança de centralização/recuo do cabeçalho).

Depois disso, os 4 cartões (Conectar, Músicas, Ritmo, Corrida) ficam
empilhados na mesma página, um de cada vez em destaque, sempre com a mesma
sequência de transição: assim que a ação final do passo acontece, o app
mostra um flash de confirmação (✓ verde) — ainda com a aparência normal, em
destaque — por **1,5s**, e **só depois** desse 1,5s o cartão recua "sem
destaque" (cinza, controles desabilitados) e o próximo aparece. Os dois
nunca acontecem ao mesmo tempo — o próximo cartão só é revelado depois que
o anterior termina de recuar, pra sequência ficar clara e perceptível, não
uma trocação instantânea:

1. **Cartão 1 — Conectar ao Spotify.** Só esse botão. Se a conta já estava
   conectada de uma visita anterior, o cartão passa pela mesma sequência
   (check, 1,5s, recuo) mostrando "Conectado ao Spotify" — o usuário sempre
   vê a confirmação, mesmo sem precisar tocar em nada.
2. **Cartão 2 — Escolha as Playlists.** Um multiseletor próprio (não o
   "N Items"/"..." nativo do iOS pra `<select multiple>`, que não dá pra
   estilizar nem traduzir) decide a fonte: campo fechado por padrão
   ("Selecione"), tocar nele abre um **pop-up modal** com a lista de
   marcar/desmarcar (cada linha tem um checkbox próprio ao lado do texto, além
   de destacar a linha inteira com a cor de destaque quando marcada) — fecha
   pelo "✕", tocando fora dele, ou automaticamente ao analisar o BPM. Sempre
   começa em branco (nenhuma opção pré-marcada, nem de uma visita anterior) —
   e o botão "Carregar BPM" só libera depois de uma
   escolha explícita (não existe "nada marcado = tudo incluído" em lugar
   nenhum). As opções: "Todos" (primeira, exclusiva — marcar ela desmarca
   qualquer playlist específica, e vice-versa; junta toda a biblioteca do
   Spotify E a Playlist RunBeat inteira de uma vez), "Playlist RunBeat" (o
   Catálogo, sozinho), e as playlists de propriedade do próprio usuário
   (playlists de outras contas que ele só segue/colabora não aparecem na
   lista, embora continuem incluídas em "Todos") — todas atrás de um botão
   único ("Carregar BPM"). O painel de gêneros do
   Catálogo (dentro desse mesmo cartão, só quando "Playlist RunBeat" está
   marcada sozinha) segue o mesmo formato de pop-up, com sua própria opção
   "Todos" exclusiva — e também exige uma escolha explícita antes de liberar
   o botão. Assim que o pool sai com alguma faixa, esse cartão também recua e
   o cartão 3 assume.
3. **Cartão 3 — Escolha o ritmo.** Último cartão — um botão **"Continuar"**
   recua ele também e revela o cartão de corrida. Nesse momento os cartões
   1, 2 e 3 **condensam** juntos numa linha cada (só o título, sem o
   conteúdo interno) no topo da tela, liberando o resto do espaço pro
   cartão de corrida.
4. **Cartão de corrida.** Mostra a medição de cadência, a faixa tocando
   agora, e os controles: um botão central **▶ Play / ⏸ Pause** com
   **⏮ Anterior** / **⏭ Próxima** ao lado, que só aparecem depois que a
   corrida começa. Antes do primeiro toque, se o "Spotify sync" já tiver
   funcionado, o Play pulsa (brilho ao redor, ver `.play-pause-btn.is-
   attention` no CSS) — o Spotify já pode estar tocando uma faixa de
   aquecimento sozinho nesse momento, então o pulso chama atenção pra
   apertar logo. O primeiro toque em "Play" começa a corrida de verdade
   (sensor de passos, primeira faixa) e o pulso para de vez; depois disso,
   Play/Pause só controla a música — pausa/retoma o Spotify de onde parou,
   sem reiniciar a medição de cadência nem recomeçar a faixa atual do zero
   (ver "Como funciona", item 5).

Tocar no título de qualquer cartão já concluído ou condensado (sem
destaque) reabre ele pra editar (volta ao tamanho normal, com os controles
de volta) — os cartões seguintes recuam/escondem de novo até você concluir
esse de novo. Trocar o ritmo desse jeito com uma corrida já em andamento
aplica a mudança na hora (não reinicia a corrida do zero, ela continua
tocando em segundo plano); trocar as músicas refaz a análise de BPM e passa
de novo pelo cartão de ritmo antes de voltar pra corrida.

Na primeira visita, um tutorial guiado (5 passos) também explica esse fluxo
antes de qualquer coisa — dá pra pular a qualquer momento ("Pular") e
reabrir depois tocando no botão **"?"** no canto superior direito do
cabeçalho. Cartões que dependem de uma escolha anterior (Nível dentro de
Ritmo fixo, Gêneros dentro do Catálogo RunBeat) aparecem visualmente
recuados/indentados, com uma barra de destaque, dentro do controle do qual
dependem.

## Como funciona

1. Você loga com sua conta Spotify (Premium — necessário pra controlar
   playback pela API) e escolhe a fonte de faixas num único multiseletor:
   **"Todos"** (primeira opção — junta automaticamente todas as suas
   playlists, as Curtidas, e a Playlist RunBeat inteira de uma vez; é
   exclusiva, marcar ela desmarca qualquer outra escolha), **"Playlist
   RunBeat"** — uma seleção própria de ~750 músicas com BPM e gênero já
   classificados (marcando essa opção sozinha aparece um segundo painel pra
   filtrar por gênero musical, ex. Rock, Pagode, Samba, Funk, com sua
   própria opção "Todos" — é obrigatório marcar ao menos um gênero, ou
   "Todos", pra liberar a análise), e/ou uma ou mais playlists de
   propriedade do usuário (playlists de outras contas que ele só
   segue/colabora não aparecem na lista, embora continuem entrando em
   "Todos"). A Playlist RunBeat é útil pra quem não tem muitas playlists, ou
   pra preencher faixas de BPM que suas próprias músicas não cobrem — cada
   entrada já vem com o ID real da faixa no Spotify
   (`public/data/runbeat-catalog.json`), sem precisar buscar por nome. Como
   a curadoria tem uma data própria, algumas faixas podem não existir mais
   no catálogo do Spotify — o app trata isso como falha normal e pula pra
   próxima candidata. Em qualquer caso (fora do modo "Todos"), o pool junta
   as fontes sem repetir faixa que apareça em mais de uma — e o BPM já
   resolvido fica em cache local, então analisar de novo (com mais fontes)
   não perde o que já foi calculado antes. Essa seleção de playlists/gêneros
   nunca fica salva entre visitas — o passo 2 sempre abre em branco, e a
   escolha de fonte é feita de novo a cada corrida.
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
5. Os botões **⏮ Anterior** / **⏭ Próxima** (visíveis só com a corrida em
   andamento) deixam pular manualmente pra faixa seguinte do pool (recalcula
   pela cadência atual) ou voltar pra última que já tocou nessa corrida. O
   botão central **Play/Pause**, depois do primeiro toque (que começa a
   corrida de verdade), passa a ser só um controle de música: "Pause" pausa
   o dispositivo ativo do Spotify de verdade (`PUT /me/player/pause`) e
   suspende a troca automática de faixa; "Play" retoma o Spotify de onde
   parou (`PUT /me/player/play` sem corpo, que resume em vez de recomeçar) e
   reagenda a próxima troca pelo tempo que **faltava** na faixa (não a
   duração inteira de novo) — sem reiniciar a medição de cadência nem
   escolher uma faixa nova. O sensor de passos nunca para durante uma pausa,
   só a troca de faixa e o pulso sonoro (se estiver ligado).
6. Antes de apertar "Play" pela primeira vez, o cartão de corrida mostra um
   botão **"Spotify sync (clique aqui)"** — resolve de antemão, sem sair
   da tela do RunBeat, o caso mais comum de não ter nenhum dispositivo
   Spotify ativo. Ele chama `GET /me/player/devices` (lista qualquer app
   Spotify que ainda esteja rodando, mesmo em segundo plano e mesmo sem
   tocar nada) e, achando um, já manda tocar uma faixa direto nele via
   `PUT /me/player/play?device_id=<id>` — o Spotify passa a tocar sozinho,
   em segundo plano, sem precisar abrir o app manualmente nem trocar de
   tela. Antes de tocar, se o dispositivo suportar controle de volume
   (`supports_volume`), o RunBeat guarda o volume atual e zera ele via
   `PUT /me/player/volume` — a faixa de aquecimento toca de verdade (por
   isso mantém o Spotify vivo), mas sem som, já que ela não tem nada a ver
   com a corrida ainda. O volume original volta assim que o usuário aperta
   "Play" de verdade (ver `restoreWarmupVolume()` em app.js). Só não
   funciona (nem o sync, nem o mute) se o Spotify já tiver sido
   suspenso/encerrado pelo sistema (aí nenhum dispositivo aparece na
   lista) — nesse caso o botão
   avisa "Abra o app Spotify primeiro". Antes desse sync funcionar, esse
   botão fica em destaque cheio e o "Play" ao lado fica esmaecido (ainda
   clicável, só visualmente sugerindo sincronizar primeiro); assim que
   funciona ("Spotify ativado em..."), a ênfase inverte — "Play" vira o
   destaque e o botão de sync esmaece. Ele some de vez assim que a corrida
   realmente começa (não é mais necessário depois disso).
7. Se mesmo assim o Spotify não tiver nenhum dispositivo ativo quando uma
   troca de faixa precisar tocar (app já encerrado pelo sistema, ex.
   segundo plano suspenso), aparece um botão **"Spotify sync (clique
   aqui)"** (o mesmo texto do passo anterior) — um toque só abre o app
   Spotify direto na faixa certa e já começa a tocar sozinho (link
   `spotify:track:<id>`, que só precisa de 1 toque porque nada mais está
   tocando ainda). Abrir esse link tira o
   RunBeat de primeiro plano — **nenhum app ou site consegue se trazer de
   volta ao primeiro plano sozinho** (restrição do próprio sistema
   operacional, iOS e Android, não uma limitação do RunBeat ou do
   navegador — nem o app nativo do Spotify conseguiria fazer isso). Quando
   o usuário volta pro RunBeat manualmente, o app detecta e tenta tocar de
   novo na hora (em vez de esperar o intervalo normal de retry), então
   basta voltar que a troca de faixa já retoma sozinha, sem precisar tocar
   em mais nada. O botão some assim que a próxima troca de faixa funcionar
   normalmente.
8. Enquanto a corrida está ativa, o app pede à tela pra não apagar sozinha
   (Screen Wake Lock). Isso evita que o navegador pare de rodar em segundo
   plano por *timeout* automático de tela. **Limite importante**: isso não
   evita que a tela apague se você apertar o botão físico de bloquear o
   celular — não existe API que intercepte isso; nesse caso a faixa atual
   continua tocando normalmente (é o app Spotify nativo, não a página do
   RunBeat, que toca o áudio), mas a troca automática de faixa só volta a
   acontecer quando você desbloquear e voltar pro RunBeat.
9. Um **"Marca-Passo Sonoro"** (checkbox, opt-in) toca um clique curto no navegador
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
    ├── img/
    │   └── bg-marble.webp    # textura de fundo
    ├── data/
    │   └── runbeat-catalog.json # Catálogo RunBeat (~750 músicas, BPM + gênero)
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

- Antes de "▶ Play", o botão **"Spotify sync (clique aqui)"** tenta
  resolver o caso de nenhum dispositivo ativo sem sair do RunBeat — só
  funciona se o Spotify ainda estiver rodando em segundo plano (`GET
  /me/player/devices` não vem vazio); sem nenhum, avisa "Abra o app
  Spotify primeiro".
- Se mesmo assim você tocar em "▶ Play" sem nenhum dispositivo Spotify
  ativo (app já encerrado pelo sistema), o RunBeat mostra o mesmo botão
  **"Spotify sync (clique aqui)"** como link — um toque nele abre o app
  Spotify já tocando a faixa certa, sem precisar procurar nada lá dentro
  (o app não usa o Web Playback SDK, só comanda o dispositivo ativo).
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
