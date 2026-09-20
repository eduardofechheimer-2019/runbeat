// Escolhe, dentro do pool de faixas com BPM conhecido, a candidata pra
// cadência/ritmo atual.
import { CADENCE_MATCH_STEP_BPM } from "./config.js";

// Sorteia entre as faixas do pool que caem dentro de `range`, sem repetir
// nenhuma antes de esgotar todas as outras do MESMO intervalo — o controle
// de "já tocada" é calculado aqui, só sobre esse subconjunto, não sobre o
// pool inteiro. Isso evita um bug sutil: se o controle fosse global, faixas
// de fora do intervalo (nunca escolhidas) ficariam "pendentes" pra sempre,
// fazendo o app achar erroneamente que ainda não esgotou as opções e cair
// no fallback de "mais próxima do limite" mesmo havendo faixas do
// intervalo certo prontas pra repetir. Devolve null quando NENHUMA faixa
// do pool inteiro cai no intervalo (nem repetida) — quem chama decide o
// que fazer nesse caso (ver pickTrackForCadence/pickTrackForRange abaixo).
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

// Modo automático: prioriza as faixas mais próximas da cadência medida —
// começa numa janela estreita de ±10 bpm ao redor dela (CADENCE_MATCH_STEP_
// BPM) e sorteia entre as que caem ali dentro. Só quando essa janela não
// tem NENHUMA faixa no pool inteiro (não é questão de repetição, é questão
// de não existir faixa com esse BPM) é que abre mais 10 bpm pra cada lado
// e tenta de novo — repete até achar alguma. Isso garante letra "faixas
// dentro de ±10 bpm têm prioridade" sem nunca ficar sem faixa pra tocar.
export function pickTrackForCadence(pool, cadence, playedIds) {
  if (pool.length === 0) return null;

  // O laço sempre termina antes de `widen` estourar qualquer BPM real de
  // faixa (nenhuma música tem um BPM de milhares) — o limite aqui é só uma
  // rede de segurança contra loop infinito num pool vazio de verdade, já
  // descartado acima.
  for (let widen = CADENCE_MATCH_STEP_BPM; widen <= 1000; widen += CADENCE_MATCH_STEP_BPM) {
    const picked = pickFromRange(pool, { min: cadence - widen, max: cadence + widen }, playedIds);
    if (picked) return picked;
  }
  return pickNearestToRange(pool, { min: cadence, max: cadence }, playedIds);
}

// Modo "ritmo fixo": o alvo é uma faixa de BPM (ex. "Warming Up" =
// 120-149) escolhida à mão pelo usuário, em vez de derivada da cadência
// real — usa o intervalo inteiro direto, sem prioridade por proximidade.
export function pickTrackForRange(pool, range, playedIds) {
  if (pool.length === 0 || !range) return null;
  return pickFromRange(pool, range, playedIds) ?? pickNearestToRange(pool, range, playedIds);
}
