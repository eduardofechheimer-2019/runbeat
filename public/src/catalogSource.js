// Catálogo RunBeat: seleção própria de ~8 mil músicas com BPM e gênero já
// conhecidos, cada uma já classificada na faixa de cadência certa (BPM ->
// nível de FIXED_PACE_OPTIONS) — cada entrada já traz o ID da faixa no
// Spotify, então não precisa buscar por nome (zero risco de casar com a
// versão errada).
//
// ATENÇÃO: a curadoria tem uma data própria — alguns IDs podem não existir
// mais no catálogo do Spotify (faixa removida/substituída). O app trata
// isso como uma falha normal de reprodução e pula pra próxima candidata,
// não é motivo de erro fatal.
const CATALOG_URL = "data/runbeat-catalog.json";

let cachedCatalog = null;

async function loadFullCatalog() {
  if (cachedCatalog) return cachedCatalog;

  const res = await fetch(CATALOG_URL);
  if (!res.ok) {
    throw new Error(`Falha ao carregar o Catálogo RunBeat (HTTP ${res.status})`);
  }
  const rows = await res.json();
  cachedCatalog = rows.map(([id, name, artist, tempo, durationMs, genre]) => ({
    id,
    name,
    artist,
    uri: `spotify:track:${id}`,
    tempo,
    durationMs,
    genre,
  }));
  return cachedCatalog;
}

// `genreFilter`: lista de gêneros pra restringir o resultado (ex. seleção
// do usuário no dropdown de gêneros). Vazio/omitido devolve o catálogo
// inteiro.
export async function loadCatalogRefs(genreFilter) {
  const all = await loadFullCatalog();
  if (!genreFilter || genreFilter.length === 0) return all;
  const wanted = new Set(genreFilter);
  return all.filter((t) => wanted.has(t.genre));
}

// Lista de gêneros distintos do catálogo, em ordem alfabética — usada pra
// popular o dropdown de gêneros na tela.
export async function loadCatalogGenres() {
  const all = await loadFullCatalog();
  return Array.from(new Set(all.map((t) => t.genre))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
