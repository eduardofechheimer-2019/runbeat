// Resolve o BPM (tempo) de cada faixa via ReccoBeats, por ID do Spotify —
// match exato, sem risco de casar com a versão errada de uma música.
//
// ATENÇÃO: os endpoints abaixo (GET /v1/audio-features?ids=... e o formato
// de resposta) foram confirmados por pesquisa/documentação de terceiros, não
// testados ao vivo neste ambiente de desenvolvimento (o proxy de rede daqui
// bloqueia api.reccobeats.com). Teste no navegador real antes de confiar 100%
// — se o formato de campo divergir, ajuste `extractTempo` abaixo.
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

async function fetchTempoBatch(ids) {
  const url = `${RECCOBEATS_BASE}/audio-features?ids=${ids.join(",")}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`ReccoBeats audio-features falhou (HTTP ${res.status}) pro lote:`, ids);
    return {};
  }
  const json = await res.json();
  const list = json.content ?? json.data ?? json ?? [];
  const byId = {};
  for (const entry of list) {
    const spotifyId = entry.id ?? entry.spotifyId ?? entry.href?.split("/").pop();
    const tempo = extractTempo(entry);
    if (spotifyId && tempo) byId[spotifyId] = tempo;
  }
  return byId;
}

function loadCache() {
  const raw = localStorage.getItem(STORAGE_KEYS.bpmPool);
  return raw ? JSON.parse(raw) : {};
}

function saveCache(cache) {
  localStorage.setItem(STORAGE_KEYS.bpmPool, JSON.stringify(cache));
}

// Recebe [{id, name, artist, uri}], devolve [{id, name, artist, uri, tempo}]
// só com as faixas que tiveram BPM resolvido. Usa cache local pra não
// reconsultar faixas já conhecidas.
export async function buildBpmPool(trackRefs, onProgress) {
  const cache = loadCache();
  const missing = trackRefs.filter((t) => !cache[t.id]);
  const batches = chunk(missing, RECCOBEATS_BATCH_SIZE);

  let done = 0;
  for (const batch of batches) {
    const tempos = await fetchTempoBatch(batch.map((t) => t.id));
    for (const track of batch) {
      if (tempos[track.id]) cache[track.id] = tempos[track.id];
    }
    done += batch.length;
    onProgress?.(done, missing.length);
  }
  saveCache(cache);

  return trackRefs
    .filter((t) => cache[t.id])
    .map((t) => ({ ...t, tempo: cache[t.id] }));
}
