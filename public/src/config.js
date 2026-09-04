// Configuração do app — preencha SPOTIFY_CLIENT_ID depois de criar o app em
// https://developer.spotify.com/dashboard (ver README para o passo a passo).
export const SPOTIFY_CLIENT_ID = "323bfd05cb3546aaa12bb96ea702404b";

// Precisa bater exatamente com uma Redirect URI cadastrada no app do Spotify.
export const SPOTIFY_REDIRECT_URI = window.location.origin + window.location.pathname;

export const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
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

// Duração assumida quando uma faixa não vier com `duration_ms` (não deveria
// acontecer, mas evita travar o agendamento nesse caso).
export const FALLBACK_TRACK_DURATION_MS = 30000;

// Intervalo de atualização do texto de cadência na tela (só exibição —
// não afeta quando a troca de faixa acontece).
export const CADENCE_DISPLAY_INTERVAL_MS = 1000;

// Se der erro ao tentar tocar a próxima faixa (ex. dispositivo Spotify
// ficou inativo), tenta de novo depois desse tempo.
export const RETRY_AFTER_ERROR_MS = 5000;

// Opções do modo "ritmo fixo" — cadência alvo constante, independente do
// passo real do usuário. Valores em passos/min (SPM), ajustáveis aqui.
export const FIXED_PACE_OPTIONS = [
  { id: "slow", label: "Lento", spm: 130 },
  { id: "medium", label: "Médio", spm: 160 },
  { id: "fast", label: "Rápido", spm: 180 },
];

export const STORAGE_KEYS = {
  spotifyTokens: "runbeat_spotify_tokens",
  pkceVerifier: "runbeat_pkce_verifier",
  sourcePlaylist: "runbeat_source_playlist",
  bpmPool: "runbeat_bpm_pool",
};
