// Escolhe, dentro do pool de faixas com BPM conhecido, a candidata pra
// cadência/ritmo atual.
import { CADENCE_MATCH_SIGMA_BPM } from "./config.js";

// Sorteia entre as faixas do pool que caem dentro de `range`, sem repetir
// nenhuma antes de esgotar todas as outras do MESMO intervalo — o controle
// de "já tocada" é calculado aqui, só sobre esse subconjunto, não sobre o
// pool inteiro. Isso evita um bug sutil: se o controle fosse global, faixas
// de fora do intervalo (nunca escolhidas) ficariam "pendentes" pra sempre,
// fazendo o app achar erroneamente que ainda não esgotou as opções e cair
// no fallback de "mais próxima do limite" mesmo havendo faixas do
// intervalo certo prontas pra repetir. Devolve null quando NENHUMA faixa
// do pool inteiro cai no intervalo (nem repetida) — quem chama decide o
// que fazer nesse caso (ver pickTrackForRange abaixo). Usado só pelo modo
// "Ritmo fixo" — o Automático usa sorteio ponderado (ver mais abaixo), sem
// intervalo rígido nenhum.
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

// Sorteio ponderado: cada candidata recebe um peso e a escolhida é sorteada
// proporcionalmente a ele (peso maior = mais chance, nunca 100% garantido
// pra nenhuma) — o mesmo princípio usado em sistemas de recomendação pra
// equilibrar relevância (favorecer as melhores candidatas) com variedade
// (as outras continuam podendo aparecer, só com menos frequência).
function weightedRandomPick(candidates, weightOf) {
  const weights = candidates.map(weightOf);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return candidates[Math.floor(Math.random() * candidates.length)];

  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1]; // rede de segurança contra arredondamento de ponto flutuante
}

// Modo automático: em vez de um corte rígido (só entra quem está dentro de
// uma janela de BPM, ninguém fora dela) ou de sempre travar na faixa
// matematicamente mais próxima (sem variedade nenhuma), sorteia entre TODO
// o pool com peso decrescente conforme a distância da cadência medida —
// uma curva gaussiana centrada na cadência atual. Faixas coladas na
// cadência têm bem mais chance de tocar; faixas mais distantes ainda podem
// aparecer, só que raramente. CADENCE_MATCH_SIGMA_BPM controla o quão
// "rigoroso" isso é: a ~1 desvio-padrão de distância (ex. 10 bpm de
// diferença, com o valor padrão) a chance já caiu bastante; a ~2 desvios
// fica bem rara. Sem intervalo fixo, então nunca existe o caso de "nenhuma
// faixa dentro do alvo" — sempre há pelo menos uma candidata (a mais
// próxima disponível), só que com prioridade mais baixa quanto mais longe.
export function pickTrackForCadence(pool, cadence, playedIds) {
  if (pool.length === 0) return null;

  const unplayed = pool.filter((t) => !playedIds.has(t.id));
  const candidates = unplayed.length > 0 ? unplayed : pool; // esgotou o pool inteiro: recomeça

  const pick = weightedRandomPick(candidates, (track) => {
    const diff = track.tempo - cadence;
    return Math.exp(-(diff * diff) / (2 * CADENCE_MATCH_SIGMA_BPM * CADENCE_MATCH_SIGMA_BPM));
  });
  return { ...pick, effectiveBpm: pick.tempo };
}

// Modo "ritmo fixo": o alvo é uma faixa de BPM (ex. "Warming Up" =
// 120-149) escolhida à mão pelo usuário, em vez de derivada da cadência
// real — qualquer faixa dentro desse intervalo serve igualmente (sem
// prioridade por proximidade), já que a escolha do nível já é a forma do
// usuário dizer "esse intervalo inteiro está bom pra mim".
export function pickTrackForRange(pool, range, playedIds) {
  if (pool.length === 0 || !range) return null;
  return pickFromRange(pool, range, playedIds) ?? pickNearestToRange(pool, range, playedIds);
}
