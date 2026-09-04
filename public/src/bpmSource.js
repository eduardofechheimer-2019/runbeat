// Resolve o BPM (tempo) de cada faixa via ReccoBeats, por ID do Spotify —
// match exato, sem risco de casar com a versão errada de uma música.
//
// ATENÇÃO: os endpoints abaixo (GET /v1/audio-features?ids=... e o formato
// de resposta) foram confirmados por pesquisa/documentação de terceiros, não
// testados ao vivo neste ambiente de desenvolvimento (o proxy de rede daqui
// bloqueia api.reccobeats.com). Se `buildBpmPool` não encontrar BPM pra
// nenhuma faixa, ele devolve uma amostra da resposta bruta em `diagnostic`
// pra ajustar `extractTempo`/`extractSpotifyId` sem precisar de DevTools.
import { RECCOBEATS_BASE, RECCOBEATS_BATCH_SIZE, STORAGE_KEYS } from "./config.js";

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function extractTempo(entry) {
  // A ReccoBeats se descreve como substituta "no formato da Spotify" pro
  // Audio Features descontinuado — assume-se o mesmo nome de campo `tempo`.
  const tempo = entry?.tempo;
  return typeof tempo === "number" && tempo > 0 ? tempo : null;
}

function extractSpotifyId(entry) {
  // O campo `id` da ReccoBeats costuma ser o ID interno DELA, não o do
  // Spotify — por isso extrai primeiro do `href` (que aponta pra
  // open.spotify.com/track/<id>), e só cai pra `spotifyId`/`id` como
  // último recurso.
  const hrefMatch = typeof entry?.href === "string" && entry.href.match(/track\/([A-Za-z0-9]+)/);
  if (hrefMatch) return hrefMatch[1];
  return entry?.spotifyId ?? entry?.id ?? null;
}

// Faz a chamada e devolve tanto o mapa {spotifyId: tempo} quanto uma nota de
// diagnóstico (amostra do que veio, ou do erro) pra debugar sem DevTools.
async function fetchTempoBatch(ids) {
  const url = `${RECCOBEATS_BASE}/audio-features?ids=${ids.join(",")}`;
  let res;
  try {
    res = await fetch(url);
  } catch (networkErr) {
    return { tempos: {}, diagnostic: `Falha de rede/CORS ao chamar ${url}: ${networkErr.message}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { tempos: {}, diagnostic: `HTTP ${res.status} em ${url} — corpo: ${body.slice(0, 300)}` };
  }

  const json = await res.json();
  const list = json.content ?? json.data ?? (Array.isArray(json) ? json : []);
  const byId = {};
  for (const entry of list) {
    const spotifyId = extractSpotifyId(entry);
    const tempo = extractTempo(entry);
    if (spotifyId && tempo) byId[spotifyId] = tempo;
  }

  // Não basta a resposta não vir vazia — os IDs devolvidos precisam bater
  // com os que pedimos. Se não bater nenhum, é sinal de extração errada
  // (ex. pegou o ID interno da ReccoBeats em vez do ID do Spotify).
  const overlap = ids.filter((id) => byId[id]).length;
  const diagnostic =
    overlap === 0
      ? `Resposta OK (${list.length} itens) mas nenhum ID bateu com o solicitado. IDs pedidos: ${ids.slice(0, 3).join(",")}... Amostra da resposta: ${JSON.stringify(list[0] ?? json).slice(0, 400)}`
      : null;

  return { tempos: byId, diagnostic };
}

function loadCache() {
  const raw = localStorage.getItem(STORAGE_KEYS.bpmPool);
  return raw ? JSON.parse(raw) : {};
}

function saveCache(cache) {
  localStorage.setItem(STORAGE_KEYS.bpmPool, JSON.stringify(cache));
}

// Recebe [{id, name, artist, uri}], devolve { tracks, diagnostic }.
// `tracks` só tem as faixas com BPM resolvido; `diagnostic` traz uma amostra
// da última resposta problemática, útil quando `tracks` sai vazio.
export async function buildBpmPool(trackRefs, onProgress) {
  const cache = loadCache();
  const missing = trackRefs.filter((t) => !cache[t.id]);
  const batches = chunk(missing, RECCOBEATS_BATCH_SIZE);

  let done = 0;
  let lastDiagnostic = null;
  for (const batch of batches) {
    const { tempos, diagnostic } = await fetchTempoBatch(batch.map((t) => t.id));
    if (diagnostic) lastDiagnostic = diagnostic;
    for (const track of batch) {
      if (tempos[track.id]) cache[track.id] = tempos[track.id];
    }
    done += batch.length;
    onProgress?.(done, missing.length);
  }
  saveCache(cache);

  const tracks = trackRefs
    .filter((t) => cache[t.id])
    .map((t) => ({ ...t, tempo: cache[t.id] }));

  return { tracks, diagnostic: tracks.length === 0 ? lastDiagnostic : null };
}
