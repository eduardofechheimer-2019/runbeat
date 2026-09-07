// Escolhe, dentro do pool de faixas com BPM conhecido, a melhor candidata
// pra cadência atual — relação fixa 1:1 (1 passo = 1 batida da música).
// Mais direto de perceber e sincronizar do que aceitar metade/dobro do BPM.

export function pickTrackForCadence(pool, cadence, playedIds) {
  if (pool.length === 0) return null;

  const unplayed = pool.filter((t) => !playedIds.has(t.id));
  const candidates = unplayed.length > 0 ? unplayed : pool; // esgotou o pool: recomeça

  let best = null;
  let bestDiff = Infinity;
  for (const track of candidates) {
    const diff = Math.abs(track.tempo - cadence);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = track;
    }
  }
  // `effectiveBpm` é o BPM usado pro metrônomo visual/sonoro — com a
  // relação 1:1, é sempre igual ao `tempo` bruto da faixa.
  return best ? { ...best, effectiveBpm: best.tempo } : null;
}
