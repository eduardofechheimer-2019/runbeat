// Escolhe, dentro do pool de faixas com BPM conhecido, a candidata pra
// cadência/ritmo atual. Os dois modos (automático e fixo) resolvem primeiro
// um INTERVALO de BPM alvo (ver rangeForCadence) e sorteiam ao acaso entre
// as faixas do pool inteiro que caem nesse intervalo — nunca repetindo uma
// faixa antes de esgotar todas as outras do MESMO intervalo. Só quando o
// intervalo não tem nenhuma faixa (nem repetida) é que cai pro fallback de
// "mais próxima do limite", usando o pool inteiro.
import { FIXED_PACE_OPTIONS } from "./config.js";

// Sorteia entre as faixas do pool que caem dentro de `range`, sem repetir
// nenhuma antes de esgotar todas as outras desse MESMO intervalo — o
// controle de "já tocada" é calculado aqui, só sobre esse subconjunto, não
// sobre o pool inteiro. Isso evita um bug sutil: se o controle fosse
// global, faixas de fora do intervalo (nunca escolhidas) ficariam
// "pendentes" pra sempre, fazendo o app achar erroneamente que ainda não
// esgotou as opções e cair no fallback de "mais próxima do limite" mesmo
// havendo faixas do intervalo certo prontas pra repetir.
function pickFromRange(pool, range, playedIds) {
  const inRange = pool.filter((t) => t.tempo >= range.min && t.tempo <= range.max);
  if (inRange.length === 0) return null;

  const unplayed = inRange.filter((t) => !playedIds.has(t.id));
  const candidates = unplayed.length > 0 ? unplayed : inRange; // esgotou esse intervalo: recomeça só nele

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  // `effectiveBpm` é o BPM usado pro metrônomo visual/sonoro — sempre igual
  // ao `tempo` bruto da faixa (relação 1:1, sem aceitar metade/dobro do BPM).
  return { ...pick, effectiveBpm: pick.tempo };
}

// Fallback quando NENHUMA faixa do pool inteiro cai no intervalo pedido —
// cai pra faixa mais próxima do limite mais perto (ex. 118 bpm é o mais
// próximo de um intervalo 120–149), com o controle de "já tocada" agora
// sim sobre o pool inteiro (não tem intervalo pra restringir a nada).
function pickNearestToRange(pool, range, playedIds) {
  const unplayed = pool.filter((t) => !playedIds.has(t.id));
  const candidates = unplayed.length > 0 ? unplayed : pool; // esgotou o pool inteiro: recomeça

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

// Modo automático: a cadência atual (passos/min) determina qual dos 4
// níveis de ritmo fixo (Easy Pace, Warming Up, Taking Off, Pro — ver
// FIXED_PACE_OPTIONS em config.js) ela cai dentro, e a escolha usa o MESMO
// intervalo daquele nível — mesma lógica de sorteio/repetição do modo
// "Ritmo fixo", só que o intervalo muda sozinho conforme a cadência real
// muda ao longo da corrida.
export function pickTrackForCadence(pool, cadence, playedIds) {
  if (pool.length === 0) return null;
  return pickTrackForRange(pool, rangeForCadence(cadence), playedIds);
}

function rangeForCadence(cadence) {
  const bucket = FIXED_PACE_OPTIONS.find((o) => cadence >= o.min && cadence <= o.max);
  if (bucket) return bucket;
  // Cadência fora de todos os níveis (ex. 0, antes da 1ª leitura válida) —
  // cai pro nível mais próximo (o primeiro ou o último) em vez de não achar
  // nada.
  return cadence < FIXED_PACE_OPTIONS[0].min
    ? FIXED_PACE_OPTIONS[0]
    : FIXED_PACE_OPTIONS[FIXED_PACE_OPTIONS.length - 1];
}

// Modo "ritmo fixo": o alvo é uma faixa de BPM (ex. "Warming Up" =
// 120-149) escolhida à mão pelo usuário, em vez de derivada da cadência
// real.
export function pickTrackForRange(pool, range, playedIds) {
  if (pool.length === 0 || !range) return null;
  return pickFromRange(pool, range, playedIds) ?? pickNearestToRange(pool, range, playedIds);
}
