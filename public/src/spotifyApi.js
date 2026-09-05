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
  return text ? JSON.parse(text) : null;
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
      trackCount: p.tracks?.total ?? 0,
      ownerId: p.owner?.id ?? null,
      ownerName: p.owner?.display_name ?? p.owner?.id ?? "desconhecido",
    }));
}

export async function getPlaylistTrackRefs(playlistId) {
  const refs = [];
  // Endpoint antigo /playlists/{id}/tracks foi descontinuado pelo Spotify
  // (retorna 403) — a substituta é /playlists/{id}/items.
  let url = `/playlists/${playlistId}/items?fields=next,items(track(id,name,uri,duration_ms,artists(name)))&limit=100`;
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
    if (err.status === 404) {
      throw new Error(
        "Nenhum dispositivo Spotify ativo. Abra o Spotify no celular e toque play em qualquer música antes de iniciar a corrida."
      );
    }
    throw err;
  }
}
