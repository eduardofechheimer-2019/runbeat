import { getValidAccessToken } from "./spotifyAuth.js";
import { t } from "./i18n.js";

const API_BASE = "https://api.spotify.com/v1";

async function request(path, options = {}) {
  const token = await getValidAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
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

function noActiveDeviceError() {
  const err = new Error(t("noActiveDevice"));
  err.code = "NO_ACTIVE_DEVICE";
  return err;
}

// Retoma o dispositivo ativo de onde parou (sem `uris` no corpo) — diferente
// de playTrackUri, que sempre começa uma faixa do zero. Chamada quando o
// "Play" do RunBeat é apertado de novo depois de um "Pause".
export async function resumePlayback() {
  try {
    await request("/me/player/play", { method: "PUT" });
  } catch (err) {
    if (isNoActiveDeviceError(err)) throw noActiveDeviceError();
    throw err;
  }
}

// Toca uma faixa imediatamente no dispositivo ativo do usuário (o app Spotify
// do celular, por ex.) — chamada automática do motor de matching, sem
// intervenção manual.
export async function playTrackUri(uri) {
  try {
    await request("/me/player/play", {
      method: "PUT",
      body: JSON.stringify({ uris: [uri] }),
    });
  } catch (err) {
    // 404 cobre dois casos bem diferentes: nenhum dispositivo Spotify ativo,
    // ou o ID da faixa não existe mais no catálogo (pode acontecer com
    // faixas do Catálogo RunBeat, que tem uma data de curadoria própria).
    if (isNoActiveDeviceError(err)) throw noActiveDeviceError();
    if (err.status === 404) {
      throw new Error(t("trackNotFound", { uri }));
    }
    throw err;
  }
}

