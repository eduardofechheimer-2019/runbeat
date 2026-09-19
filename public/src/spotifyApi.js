import { getValidAccessToken } from "./spotifyAuth.js";

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
    const err = new Error(`Spotify API ${options.method || "GET"} ${path} falhou (HTTP ${res.status}): ${detail}`);
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

// Busca faixas por texto — usada só pra achar uma faixa "silenciosa" real
// (ver findSilentWarmupTrack em app.js), já que nem todo dispositivo Spotify
// aceita comando de volume remoto (`supports_volume: false`, comum em
// celulares) pra silenciar a faixa de aquecimento do "Spotify sync" por
// software.
export async function searchTracks(query, limit = 10) {
  const params = new URLSearchParams({ q: query, type: "track", limit: String(limit) });
  const data = await request(`/search?${params.toString()}`);
  return data?.tracks?.items ?? [];
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
      ownerName: p.owner?.display_name ?? p.owner?.id ?? "desconhecido",
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

// Lista os dispositivos Spotify Connect disponíveis pra essa conta — inclui
// qualquer app Spotify que ainda esteja "vivo" (conectado nos servidores do
// Spotify), mesmo em segundo plano e mesmo que não esteja tocando nada no
// momento (`is_active: false`). Um dispositivo só aparece aqui enquanto o
// app Spotify continuar rodando; se o iOS já suspendeu/encerrou o processo,
// ele some da lista e não tem como reativar sem abrir o app manualmente.
export async function getAvailableDevices() {
  const data = await request("/me/player/devices");
  return data?.devices ?? [];
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
  const err = new Error(
    "Nenhum dispositivo Spotify ativo. Toque no botão abaixo pra abrir o Spotify e começar."
  );
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
      throw new Error(`Faixa não encontrada no Spotify (pode ter sido removida do catálogo): ${uri}`);
    }
    throw err;
  }
}

// "Aquece" o Spotify sem precisar abrir o app manualmente: toca uma faixa
// direto num dispositivo específico (por ID, vindo de getAvailableDevices),
// mesmo que ele não esteja ativo no momento — diferente de playTrackUri, que
// depende de já existir um dispositivo ativo escolhido pelo próprio Spotify.
// Só funciona enquanto o dispositivo ainda aparecer na lista (app Spotify
// ainda rodando em segundo plano); se ele já tiver sido encerrado pelo
// sistema nesse meio tempo, cai no mesmo 404 de sempre.
export async function playTrackUriOnDevice(uri, deviceId) {
  try {
    await request(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      method: "PUT",
      body: JSON.stringify({ uris: [uri] }),
    });
  } catch (err) {
    if (isNoActiveDeviceError(err)) throw noActiveDeviceError();
    throw err;
  }
}

// Ajusta o volume do Spotify Connect num dispositivo específico — usado pra
// silenciar a faixa de aquecimento do "Spotify sync" (toca de verdade, mas
// sem som) e devolver o volume original assim que o usuário aperta Play de
// verdade. É o volume do PRÓPRIO Spotify (Connect), não o volume físico do
// aparelho.
export async function setVolume(volumePercent, deviceId) {
  await request(
    `/me/player/volume?volume_percent=${volumePercent}&device_id=${encodeURIComponent(deviceId)}`,
    { method: "PUT" }
  );
}
