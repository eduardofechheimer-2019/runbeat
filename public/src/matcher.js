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

// Modo "ritmo fixo": em vez de um número exato, o alvo é uma faixa de BPM
// (ex. "Warming Up" = 120-149). Qualquer faixa do pool dentro do intervalo
// serve igualmente — escolhe uma ao acaso entre elas, pra variar. Sem
// nenhuma faixa dentro do intervalo, cai pra a mais próxima do limite mais
// perto (ex. 118 BPM é o mais próximo de um intervalo 120-149).
export function pickTrackForRange(pool, range, playedIds) {
  if (pool.length === 0 || !range) return null;

  const unplayed = pool.filter((t) => !playedIds.has(t.id));
  const candidates = unplayed.length > 0 ? unplayed : pool;

  const inRange = candidates.filter((t) => t.tempo >= range.min && t.tempo <= range.max);
  if (inRange.length > 0) {
    const pick = inRange[Math.floor(Math.random() * inRange.length)];
    return { ...pick, effectiveBpm: pick.tempo };
  }

  let best = null;
  let bestDiff = Infinity;
  for (const track of candidates) {
    const diff = track.tempo < range.min ? range.min - track.tempo : track.tempo - range.max;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = track;
    }
  }
  return best ? { ...best, effectiveBpm: best.tempo } : null;
}
