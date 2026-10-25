import { getValidAccessToken } from "./spotifyAuth.js";
import { t } from "./i18n.js";

const API_BASE = "https://api.spotify.com/v1";

// A API do Spotify devolve 5xx (principalmente 503) de forma intermitente —
// visto no diagnóstico com GET /me/playlists voltando 503 e, minutos depois,
// a mesma chamada voltando 200. Leituras (GET) são seguras de repetir, então
// tentam de novo sozinhas com uma espera crescente antes de mostrar erro.
// Comandos (PUT/POST) não são repetidos aqui: o motor de troca de faixa já
// tem o próprio retry (RETRY_AFTER_ERROR_MS em config.js).
const READ_RETRY_DELAYS_MS = [1000, 3000];
const MAX_RETRY_AFTER_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

function retryDelayMs(res, attempt) {
  const retryAfter = Number(res.headers.get("Retry-After"));
  if (res.status === 429 && retryAfter > 0) return Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS);
  return READ_RETRY_DELAYS_MS[attempt];
}

async function request(path, options = {}) {
  const isRead = !options.method || options.method === "GET";
  let res;
  for (let attempt = 0; ; attempt++) {
    const token = await getValidAccessToken();
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    if (!isRead || !isRetryableStatus(res.status) || attempt >= READ_RETRY_DELAYS_MS.length) break;
    await sleep(retryDelayMs(res, attempt));
  }
  if (res.status === 204) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(
      t("spotifyApiFailed", { method: options.method || "GET", path, status: res.status, detail })
    );
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Resposta com HTTP de sucesso mas corpo que não é JSON válido — já visto
    // no retomar (PUT /me/player/play sem corpo), que às vezes volta 200 com
    // um corpo que não é JSON (em vez do 204 de costume). Nenhuma chamada
    // depende do valor de volta nesse caso, então ignora em silêncio em vez
    // de estourar o erro cru do JSON.parse pra tela (que não indica nenhum
    // problema real — o comando em si já foi aceito, daí o HTTP de sucesso).
    return null;
  }
}

export async function getCurrentUserId() {
  const me = await request("/me");
  return me.id;
}

export async function getMyPlaylists() {
  const items = [];
  let url = "/me/playlists?limit=50";
  while (url) {
    const page = await request(url);
    items.push(...page.items);
    url = page.next ? page.next.replace(API_BASE, "") : null;
  }
  // Algumas playlists (ex. geradas automaticamente pelo Spotify) vêm com
  // campos ausentes/nulos no item — filtra essas e não deixa quebrar o resto.
  return items
    .filter((p) => p && p.id)
    .map((p) => ({
      id: p.id,
      name: p.name,
      ownerId: p.owner?.id ?? null,
      ownerName: p.owner?.display_name ?? p.owner?.id ?? t("unknownOwner"),
    }));
}

export async function getPlaylistTrackRefs(playlistId) {
  const refs = [];
  // Endpoint antigo /playlists/{id}/tracks foi descontinuado pelo Spotify
  // (retorna 403) — a substituta é /playlists/{id}/items. Sem `fields`: a
  // documentação/relatos de terceiros divergem sobre o nome do campo de
  // cada item nessa versão (`track` ou `item`) — filtrar por um nome
  // errado faz o Spotify devolver objetos vazios sem erro nenhum. Pedindo
  // tudo e filtrando no cliente (abaixo) evita depender de acertar o nome.
  let url = `/playlists/${playlistId}/items?limit=100`;
  while (url) {
    const page = await request(url);
    for (const entry of page.items) {
      // A documentação e relatos de terceiros divergem sobre o nome do
      // campo do item nessa versão do endpoint (`track` ou `item`) — aceita
      // os dois pra não quebrar dependendo de qual for o real.
      const track = entry.track ?? entry.item;
      if (track?.id) {
        refs.push({
          id: track.id,
          name: track.name,
          uri: track.uri,
          artist: track.artists?.[0]?.name ?? "",
          durationMs: track.duration_ms,
        });
      }
    }
    url = page.next ? page.next.replace(API_BASE, "") : null;
  }
  return refs;
}

// Busca uma faixa específica pelo ID — usado pra resolver a "Faixa Bônus"
// que o usuário cola como link (ver app.js), já que essa faixa não vem de
// nenhuma playlist/catálogo já carregado.
export async function getTrack(id) {
  const track = await request(`/tracks/${id}`);
  return {
    id: track.id,
    name: track.name,
    uri: track.uri,
    artist: track.artists?.[0]?.name ?? "",
    durationMs: track.duration_ms,
  };
}

export async function getLikedSongRefs() {
  const refs = [];
  let url = "/me/tracks?limit=50";
  while (url) {
    const page = await request(url);
    for (const item of page.items) {
      if (item.track?.id) {
        refs.push({
          id: item.track.id,
          name: item.track.name,
          uri: item.track.uri,
          artist: item.track.artists?.[0]?.name ?? "",
          durationMs: item.track.duration_ms,
        });
      }
    }
    url = page.next ? page.next.replace(API_BASE, "") : null;
  }
  return refs;
}

export async function getPlaybackState() {
  return request("/me/player");
}

// Pausa o dispositivo ativo do usuário — chamada quando o "Pause" do
// RunBeat é apertado.
export async function pausePlayback() {
  playbackCommandSeq++;
  try {
    await request("/me/player/pause", { method: "PUT" });
  } catch (err) {
    // Sem dispositivo ativo = nada tocando pra pausar mesmo; ignora.
    if (err.status === 404) return;
    throw err;
  }
}

// 404 com "device" na mensagem = nenhum dispositivo Spotify ativo — o
// mesmo caso vale tanto pra tocar uma faixa nova quanto pra retomar.
function isNoActiveDeviceError(err) {
  return err.status === 404 && /device/i.test(err.message);
}

function noActiveDeviceError(messageKey = "noActiveDevice") {
  const err = new Error(t(messageKey));
  err.code = "NO_ACTIVE_DEVICE";
  return err;
}

// O Spotify às vezes responde 204 (comando aceito) ao PUT /me/player/play e
// mesmo assim nada toca — visto no diagnóstico com o iPhone listado como
// "ativo", mas pausado e sem faixa logo depois do 204. Acontece quando o app
// do Spotify no celular está em segundo plano/suspenso. Por isso, depois do
// 204, confere o estado real algumas vezes; se não estiver tocando, trata
// como "sem dispositivo ativo", o que leva ao fallback já testado de abrir o
// Spotify pelo link (ver showNoDeviceLink em app.js).
const PLAYBACK_CHECK_DELAYS_MS = [700, 1000, 1500];

async function confirmPlaybackStarted() {
  for (const delay of PLAYBACK_CHECK_DELAYS_MS) {
    await sleep(delay);
    let state;
    try {
      state = await request("/me/player");
    } catch (err) {
      // Não conseguir ler o estado não prova que falhou — não bloqueia a
      // corrida por causa da conferência em si.
      console.warn("Não deu pra conferir se o Spotify começou a tocar:", err.message);
      return;
    }
    if (state?.is_playing && state.item) return;
  }
  throw noActiveDeviceError("playbackNotStarted");
}

// Cada comando de reprodução (tocar faixa, retomar, pausar) ganha um número.
// A conferência/correção de um play só age enquanto ele ainda é o comando
// mais recente — se o usuário pausar ou trocar de faixa no meio, ela para em
// silêncio, sem retomar nem repetir nada por cima da ação do usuário.
let playbackCommandSeq = 0;

const isRequestedTrack = (item, uri) => !!item && (item.uri === uri || item.linked_from?.uri === uri);

// Lê o estado algumas vezes até ver a faixa pedida tocando. Resultado:
//   "ok"         — a faixa pedida está tocando;
//   "unknown"    — não deu pra ler o estado (não prova falha, não bloqueia);
//   "superseded" — outro comando de reprodução veio depois deste;
//   "other"      — está tocando, mas outra faixa (ex. a de aquecimento);
//   "stopped"    — pausado / sem faixa.
async function waitForRequestedTrack(uri, seq, delays) {
  let state = null;
  for (const delay of delays) {
    await sleep(delay);
    if (seq !== playbackCommandSeq) return "superseded";
    try {
      state = await request("/me/player");
    } catch (err) {
      console.warn("Não deu pra conferir se o Spotify começou a tocar:", err.message);
      return "unknown";
    }
    if (seq !== playbackCommandSeq) return "superseded";
    if (state?.is_playing && isRequestedTrack(state.item, uri)) return "ok";
  }
  return state?.is_playing ? "other" : "stopped";
}

// Confere se a faixa pedida começou. Se ficou pausada (ex. o usuário tinha
// pausado), retoma uma vez; se nada der certo, cai no fallback já existente
// (erro + botão pra abrir o Spotify, ver app.js).
const SETTLED = ["ok", "unknown", "superseded"];

async function confirmRequestedTrack(uri, seq) {
  let result = await waitForRequestedTrack(uri, seq, [700, 1000, 1500]);
  if (SETTLED.includes(result)) return;
  if (result === "stopped") {
    if (seq !== playbackCommandSeq) return;
    await request("/me/player/play", { method: "PUT" }).catch((err) => console.warn("Falha ao retomar no Spotify:", err.message));
    result = await waitForRequestedTrack(uri, seq, [800, 1200]);
    if (SETTLED.includes(result)) return;
  }
  throw noActiveDeviceError("playbackNotStarted");
}

function trackNotFoundError(uri) {
  // `code` deixa o chamador (ver playNextAndSchedule em app.js) tratar
  // esse caso específico de forma transparente pro usuário — escolhendo
  // outra faixa na hora, em vez de mostrar esse erro na tela.
  const err = new Error(t("trackNotFound", { uri }));
  err.code = "TRACK_NOT_FOUND";
  return err;
}

// Álbum de cada faixa já tocada (uri da faixa → uri do álbum), pra não
// buscar de novo quando ela volta (ex. "voltar faixa").
const albumByTrackUri = new Map();

async function albumUriFor(uri) {
  if (albumByTrackUri.has(uri)) return albumByTrackUri.get(uri);
  let track;
  try {
    track = await request(`/tracks/${uri.split(":").pop()}`);
  } catch (err) {
    // A faixa não existe mais no catálogo (pode acontecer com faixas do
    // Catálogo RunBeat, que tem uma data de curadoria própria).
    if (err.status === 404 || err.status === 400) throw trackNotFoundError(uri);
    throw err;
  }
  const album = track?.album?.uri;
  if (!album) throw trackNotFoundError(uri);
  albumByTrackUri.set(uri, album);
  return album;
}

// Retoma o dispositivo ativo de onde parou (sem `uris` no corpo) — diferente
// de playTrackUri, que sempre começa uma faixa do zero. Chamada quando o
// "Play" do RunBeat é apertado de novo depois de um "Pause".
export async function resumePlayback() {
  playbackCommandSeq++;
  try {
    await request("/me/player/play", { method: "PUT" });
  } catch (err) {
    if (isNoActiveDeviceError(err)) throw noActiveDeviceError();
    throw err;
  }
  await confirmPlaybackStarted();
}

// Toca uma faixa imediatamente no dispositivo ativo do usuário (o app Spotify
// do celular, por ex.) — chamada automática do motor de matching, sem
// intervenção manual.
//
// Toca o álbum da faixa começando nela (context_uri + offset). Visto no
// teste de troca de faixa do diagnóstico (25/10/2026 23:26, iPhone com o
// Spotify em segundo plano), é o único caminho que trocou de faixa:
//   - PUT /me/player/play com `uris`: volta 204 e deixa o Spotify "pausado,
//     sem faixa" (nem retomar recupera);
//   - fila + próxima: a faixa entra atrás das que o próprio Spotify põe na
//     fila (Autoplay), e o "próxima" toca uma dessas;
//   - álbum a partir da faixa: trocou em ~1 s.
// O álbum continuar depois da faixa não importa: o RunBeat troca de faixa
// antes do fim de cada uma.
export async function playTrackUri(uri) {
  const seq = ++playbackCommandSeq;
  const album = await albumUriFor(uri);
  if (seq !== playbackCommandSeq) return;
  try {
    await request("/me/player/play", {
      method: "PUT",
      body: JSON.stringify({ context_uri: album, offset: { uri } }),
    });
  } catch (err) {
    // 404 cobre dois casos bem diferentes: nenhum dispositivo Spotify ativo,
    // ou a faixa não está mais no álbum/catálogo.
    if (isNoActiveDeviceError(err)) throw noActiveDeviceError();
    if (err.status === 404 || err.status === 400) throw trackNotFoundError(uri);
    throw err;
  }
  await confirmRequestedTrack(uri, seq);
}

