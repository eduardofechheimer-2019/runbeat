// Configuração do app — preencha SPOTIFY_CLIENT_ID depois de criar o app em
// https://developer.spotify.com/dashboard (ver README para o passo a passo).
export const SPOTIFY_CLIENT_ID = "COLOQUE_AQUI_O_CLIENT_ID";

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

// De quanto em quanto tempo o motor de matching reavalia se a faixa atual
// ainda é a melhor opção pra cadência atual.
export const REMATCH_INTERVAL_MS = 6000;

// Variação mínima de cadência (SPM) pra justificar trocar de faixa — evita
// ficar pulando música a cada pequena oscilação de passo.
export const CADENCE_CHANGE_THRESHOLD_SPM = 6;

export const STORAGE_KEYS = {
  spotifyTokens: "runbeat_spotify_tokens",
  pkceVerifier: "runbeat_pkce_verifier",
  sourcePlaylist: "runbeat_source_playlist",
  bpmPool: "runbeat_bpm_pool",
};
