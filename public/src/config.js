// Configuração do app — preencha SPOTIFY_CLIENT_ID depois de criar o app em
// https://developer.spotify.com/dashboard (ver README para o passo a passo).
export const SPOTIFY_CLIENT_ID = "323bfd05cb3546aaa12bb96ea702404b";

// Precisa bater exatamente com uma Redirect URI cadastrada no app do
// Spotify. Fixo em "/index.html" (em vez de usar window.location.pathname
// direto) porque o caminho real muda dependendo de como o app é aberto —
// pela URL raiz no navegador vs. pelo ícone instalado na tela de início
// (que sempre abre em "/index.html", conforme o start_url do
// manifest.json) — e o Spotify exige que a URL bata exatamente, gerando o
// erro "redirect_uri: Not matching configuration" quando os dois caminhos
// divergem. Fixando aqui, é sempre a mesma URL não importa a origem.
export const SPOTIFY_REDIRECT_URI = window.location.origin + "/index.html";

export const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
].join(" ");

export const RECCOBEATS_BASE = "https://api.reccobeats.com/v1";
export const RECCOBEATS_BATCH_SIZE = 40; // limite documentado da API por requisição

// Faixa de cadência plausível pra corrida/caminhada (passos/min), usada pra
// descartar leituras ruidosas do acelerômetro.
export const CADENCE_MIN_SPM = 60;
export const CADENCE_MAX_SPM = 220;

// Janela deslizante usada pra calcular passos/min a partir dos picos detectados.
export const CADENCE_WINDOW_MS = 8000;

// Quanto antes do fim da faixa (em ms) o motor escolhe e já manda tocar a
// próxima — baseado na duração conhecida da faixa, sem chamar a API do
// Spotify pra descobrir quanto falta.
export const END_OF_TRACK_LEAD_MS = 2000;

// Se o timer da troca de faixa disparar mais que isso depois da hora, o app
// estava congelado (tela bloqueada/outra tela no iOS): antes de trocar,
// confere com o Spotify o que está tocando (ver resyncWithSpotify em app.js).
export const LATE_TIMER_TOLERANCE_MS = 5000;

// Reserva de faixas escolhidas pelo RunBeat na fila do Spotify ("Próximas
// na fila"), pra tela bloqueada: com a tela bloqueada o iOS congela o app e
// a troca de faixa não acontece, então o Spotify toca essa reserva antes de
// seguir o álbum. Com o app visível fica só 1 na reserva (a fila do Spotify
// não aceita remoção, então manter pouca coisa lá evita faixas "velhas");
// ao bloquear/sair do app, completa até LOCKED_QUEUE_RESERVE com faixas
// escolhidas pela cadência daquele momento (~15 min de música).
export const VISIBLE_QUEUE_RESERVE = 1;
export const LOCKED_QUEUE_RESERVE = 4;

// Duração assumida quando uma faixa não vem com duração conhecida —
// hoje praticamente só um caso residual sem duration_ms na planilha de
// origem do Catálogo/Playlist RunBeat. Usa uma média razoável de música
// (~3min20s) em vez de travar o agendamento ou trocar de faixa cedo
// demais.
export const FALLBACK_TRACK_DURATION_MS = 200000;

// Intervalo de atualização do texto de cadência na tela (só exibição —
// não afeta quando a troca de faixa acontece).
export const CADENCE_DISPLAY_INTERVAL_MS = 1000;

// Se der erro ao tentar tocar a próxima faixa (ex. dispositivo Spotify
// ficou inativo), tenta de novo depois desse tempo.
export const RETRY_AFTER_ERROR_MS = 5000;

// Quando a faixa escolhida não existe mais no Spotify (comum em faixas
// antigas do Catálogo RunBeat, curado numa data própria), o app tenta outra
// na hora, sem esperar RETRY_AFTER_ERROR_MS nem mostrar erro nenhum — pro
// usuário, a troca só "pula" pra uma faixa boa (ver playNextAndSchedule em
// app.js). Esse limite existe só como proteção contra um cenário bem raro
// (pool inteiro com faixas quebradas): depois dele, volta ao comportamento
// normal de mostrar o erro e esperar o intervalo de retry.
export const MAX_TRANSPARENT_TRACK_RETRIES = 5;

// Modo automático: a escolha da próxima faixa sorteia entre todo o pool,
// com peso maior pras faixas mais próximas da cadência medida (curva
// gaussiana, ver matcher.js) — esse valor é o desvio-padrão dessa curva,
// em bpm. Na prática: uma faixa a essa distância da cadência ainda tem uma
// chance razoável de ser escolhida; a duas vezes essa distância, a chance
// já cai bastante. Baixar o valor deixa a escolha mais "rígida" (prioriza
// bem mais as faixas coladas na cadência exata); subir deixa mais solta
// (mais variedade, menos fiel ao BPM exato).
export const CADENCE_MATCH_SIGMA_BPM = 10;

// Peso da relação 1:2 (1 batida a cada 2 passos, BPM efetivo = 2 × tempo da
// faixa) em relação à 1:1 na escolha de faixas (ver matcher.js). Com 0,5,
// quando uma faixa 1:1 e uma 1:2 servem igualmente, a 1:1 tem o dobro de
// chance (2 de cada 3). 0 desliga a 1:2; 1 dá chances iguais.
export const HALF_TIME_WEIGHT = 0.5;

// Quanto tempo esperar sem nenhuma leitura de cadência (modo automático)
// antes de mostrar um aviso incentivando o usuário a começar a se mexer —
// evita deixar a tela parada sem explicação enquanto o acelerômetro ainda
// não detectou nenhum passo.
export const CADENCE_WAIT_HINT_DELAY_MS = 6000;

// Opções do modo "ritmo fixo" — faixa de BPM alvo, independente do passo
// real do usuário. Dentro do intervalo, qualquer faixa do pool serve; sem
// nenhuma no intervalo, cai pra faixa mais próxima do limite. Ajustável aqui.
export const FIXED_PACE_OPTIONS = [
  { id: "easy", label: "Easy Pace", min: CADENCE_MIN_SPM, max: 119 },
  { id: "warming-up", label: "Warming Up", min: 120, max: 149 },
  { id: "taking-off", label: "Taking Off", min: 150, max: 189 },
  { id: "pro", label: "Pro", min: 190, max: CADENCE_MAX_SPM },
];

export const STORAGE_KEYS = {
  spotifyTokens: "runbeat_spotify_tokens",
  pkceVerifier: "runbeat_pkce_verifier",
  bpmPool: "runbeat_bpm_pool",
  onboardingSeen: "runbeat_onboarding_seen",
  lang: "runbeat_lang",
  boostTrack: "runbeat_boost_track",
};
