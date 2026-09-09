// Catálogo de referência: ~89 mil músicas com BPM já conhecido, vindo de um
// dataset público (CC0/domínio público) baseado em dados do Spotify —
// https://github.com/sai-chaitanya-reddy/spotify-tracks-dataset — cada
// entrada já traz o ID da faixa no Spotify, então não precisa buscar por
// nome (zero risco de casar com a versão errada).
//
// ATENÇÃO: o dataset tem uma data de captura própria — alguns IDs podem não
// existir mais no catálogo do Spotify (faixa removida/substituída). O app
// trata isso como uma falha normal de reprodução e pula pra próxima
// candidata, não é motivo de erro fatal.
const CATALOG_URL = "data/songs-bpm.json";

let cachedCatalog = null;

export async function loadCatalogRefs() {
  if (cachedCatalog) return cachedCatalog;

  const res = await fetch(CATALOG_URL);
  if (!res.ok) {
    throw new Error(`Falha ao carregar o catálogo de referência (HTTP ${res.status})`);
  }
  const rows = await res.json();
  cachedCatalog = rows.map(([id, name, artist, tempo, durationMs, genres]) => ({
    id,
    name,
    artist,
    uri: `spotify:track:${id}`,
    tempo,
    durationMs,
    genres,
  }));
  return cachedCatalog;
}
