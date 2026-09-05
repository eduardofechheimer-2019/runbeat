// Escolhe, dentro do pool de faixas com BPM conhecido, a melhor candidata
// pra cadência atual — considerando o BPM da faixa tocado no ritmo normal,
// na metade (passo a cada 2 batidas) ou no dobro (2 passos por batida).

function bestMultiple(tempo, cadence) {
  const candidates = [tempo, tempo / 2, tempo * 2];
  return candidates.reduce((best, c) =>
    Math.abs(c - cadence) < Math.abs(best - cadence) ? c : best
  );
}

export function pickTrackForCadence(pool, cadence, playedIds) {
  if (pool.length === 0) return null;

  const unplayed = pool.filter((t) => !playedIds.has(t.id));
  const candidates = unplayed.length > 0 ? unplayed : pool; // esgotou o pool: recomeça

  let best = null;
  let bestDiff = Infinity;
  let bestEffectiveBpm = null;
  for (const track of candidates) {
    const matched = bestMultiple(track.tempo, cadence);
    const diff = Math.abs(matched - cadence);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = track;
      bestEffectiveBpm = matched;
    }
  }
  // `effectiveBpm` é o BPM real usado no casamento (pode ser o tempo da
  // faixa, metade ou o dobro) — é o valor certo pra sincronizar um
  // metrônomo visual, não o `tempo` bruto da faixa.
  return best ? { ...best, effectiveBpm: bestEffectiveBpm } : null;
}
