import {
  STORAGE_KEYS,
  END_OF_TRACK_LEAD_MS,
  FALLBACK_TRACK_DURATION_MS,
  CADENCE_DISPLAY_INTERVAL_MS,
  RETRY_AFTER_ERROR_MS,
  CADENCE_WAIT_HINT_DELAY_MS,
  FIXED_PACE_OPTIONS,
} from "./config.js";
import * as auth from "./spotifyAuth.js";
import * as api from "./spotifyApi.js";
import { buildBpmPool } from "./bpmSource.js";
import { loadCatalogRefs, loadCatalogGenres } from "./catalogSource.js";
import { CadenceTracker, requestMotionPermission } from "./cadence.js";
import { pickTrackForCadence, pickTrackForRange } from "./matcher.js";
import { initOnboarding } from "./onboarding.js";
import { t, getLang, setLang, onLanguageChange, initI18n } from "./i18n.js";

const el = {
  splashScreen: document.getElementById("splash-screen"),
  status: document.getElementById("status"),
  connectBtn: document.getElementById("connect-btn"),
  disconnectBtn: document.getElementById("disconnect-btn"),
  cardConnect: document.getElementById("card-connect"),
  cardLibrary: document.getElementById("card-library"),
  cardPace: document.getElementById("card-pace"),
  cardRun: document.getElementById("card-run"),
  playlistSelect: document.getElementById("playlist-select"),
  playlistSummaryBtn: document.getElementById("playlist-summary-btn"),
  catalogGenreGroup: document.getElementById("catalog-genre-group"),
  catalogGenreSelect: document.getElementById("catalog-genre-select"),
  catalogGenreSummaryBtn: document.getElementById("catalog-genre-summary-btn"),
  multiselectModal: document.getElementById("multiselect-modal"),
  multiselectModalTitle: document.getElementById("multiselect-modal-title"),
  multiselectModalPanel: document.getElementById("multiselect-modal-panel"),
  multiselectModalClose: document.getElementById("multiselect-modal-close"),
  buildPoolBtn: document.getElementById("build-pool-btn"),
  poolProgress: document.getElementById("pool-progress"),
  modeSelect: document.getElementById("mode-select"),
  paceGroup: document.getElementById("pace-group"),
  paceSelect: document.getElementById("pace-select"),
  confirmPaceBtn: document.getElementById("confirm-pace-btn"),
  playPauseBtn: document.getElementById("play-pause-btn"),
  playPauseLabel: document.getElementById("play-pause-label"),
  iconPlay: document.querySelector("#play-pause-btn .icon-play"),
  iconPause: document.querySelector("#play-pause-btn .icon-pause"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  cadenceLastLabel: document.getElementById("cadence-last-label"),
  cadenceLastValue: document.getElementById("cadence-last-value"),
  cadenceLiveValue: document.getElementById("cadence-live-value"),
  trackNameValue: document.getElementById("track-name-value"),
  trackSourceValue: document.getElementById("track-source-value"),
  trackGenreRow: document.getElementById("track-genre-row"),
  trackGenreValue: document.getElementById("track-genre-value"),
  beatBpmValue: document.getElementById("beat-bpm-value"),
  runError: document.getElementById("run-error"),
  connectSummary: document.getElementById("connect-summary"),
  librarySummary: document.getElementById("library-summary"),
  paceSummary: document.getElementById("pace-summary"),
  openSpotifyLink: document.getElementById("open-spotify-link"),
  warmupRow: document.getElementById("warmup-row"),
  warmupBtn: document.getElementById("warmup-btn"),
  warmupHint: document.getElementById("warmup-hint"),
  warmupStatus: document.getElementById("warmup-status"),
  beatVisual: document.getElementById("beat-visual"),
  audiblePulseToggle: document.getElementById("audible-pulse-toggle"),
  audioStatus: document.getElementById("audio-status"),
  cadenceWaitHint: document.getElementById("cadence-wait-hint"),
  langPtBtn: document.getElementById("lang-pt-btn"),
  langEnBtn: document.getElementById("lang-en-btn"),
  boostConfigure: document.getElementById("boost-configure"),
  boostTrackInput: document.getElementById("boost-track-input"),
  boostSaveBtn: document.getElementById("boost-save-btn"),
  boostConfigured: document.getElementById("boost-configured"),
  boostTrackName: document.getElementById("boost-track-name"),
  boostBtn: document.getElementById("boost-btn"),
  boostChangeBtn: document.getElementById("boost-change-btn"),
  boostError: document.getElementById("boost-error"),
};

// Os 4 cartões ficam todos montados na página, mas durante os passos 1-3
// (Conectar, Playlists, Ritmo) só um fica visível por vez — uma tela por
// passo, os já concluídos somem em vez de empilhar (ver revealStep). Só ao
// alcançar o cartão de corrida (passo 4) os 3 primeiros voltam a aparecer
// juntos, "condensados" numa linha cada, resumindo a jornada acima dos
// controles da corrida.
const STEP_ORDER = ["connect", "library", "pace", "run"];
const STEP_CARDS = {
  connect: el.cardConnect,
  library: el.cardLibrary,
  pace: el.cardPace,
  run: el.cardRun,
};

function setStepControlsDisabled(card, disabled) {
  for (const ctrl of card.querySelectorAll("button, select, input")) {
    ctrl.disabled = disabled;
  }
}

// Cartão ativo no momento — precisa disso pra saber qual cartão está
// "terminando agora" (o único que merece a espera + o check antes de
// recuar) quando advanceTo() é chamado.
let activeStep = STEP_ORDER[0];

// Avança (ou recua, no caso de reabrir um cartão já concluído) pro cartão
// `stepKey`. Se algum cartão estiver "terminando agora" (ficando pra trás
// do novo alvo), o novo cartão só aparece DEPOIS da espera + check do
// anterior (ver finishStep) — nunca ao mesmo tempo, senão os dois surgem
// juntos e a sequência fica confusa/imperceptível.
// `preDelayMs`/`extraHoldMs`: usados só na conexão do Spotify (ver
// refreshAuthedUi) — atraso antes do check aparecer, e tempo extra
// segurando ele antes de revelar o próximo cartão.
function advanceTo(stepKey, { preDelayMs = 0, extraHoldMs = 0 } = {}) {
  const idx = STEP_ORDER.indexOf(stepKey);
  const finishingStep = activeStep;
  const finishingIdx = STEP_ORDER.indexOf(finishingStep);
  activeStep = stepKey;

  if (finishingIdx >= 0 && finishingIdx < idx) {
    finishStep(STEP_CARDS[finishingStep], () => revealStep(stepKey, idx), { preDelayMs, extraHoldMs });
  } else {
    revealStep(stepKey, idx);
  }
}

// Mostra o cartão `stepKey` em destaque. Durante os passos 1-3 (Conectar,
// Playlists, Ritmo), só o cartão da vez fica visível — uma tela por passo,
// sem empilhar os já concluídos. Só ao alcançar o cartão de corrida (depois
// de "Continuar" no passo 3) os 3 primeiros aparecem juntos, "condensados"
// (resumidos numa linha só, ver CSS), liberando o resto da tela pros
// controles da corrida. Tudo depois do alvo ainda nem foi alcançado, então
// fica escondido.
function revealStep(stepKey, idx) {
  STEP_ORDER.forEach((key, i) => {
    const card = STEP_CARDS[key];
    if (i < idx) {
      card.hidden = stepKey !== "run";
      if (stepKey === "run") card.dataset.state = "condensed";
    } else if (i === idx) {
      card.hidden = false;
      card.dataset.state = "active";
      setStepControlsDisabled(card, false);
      // "Carregar BPM" tem uma regra própria de habilitado/desabilitado
      // (só libera com uma seleção válida) — a linha acima reabilita todos
      // os controles do cartão de forma genérica, então precisa reaplicar
      // essa regra específica na hora, senão o botão reabre sempre
      // clicável mesmo sem nada selecionado.
      if (key === "library") updateBuildPoolAvailability();
    } else {
      card.hidden = true;
    }
  });
  STEP_CARDS[stepKey].scrollIntoView({ behavior: "smooth", block: "start" });
}

// Quanto tempo o sinal verde de passo concluído fica visível antes do
// cartão recuar pra "sem destaque" (ver .step-card[data-state="completed"]
// no CSS) e só ENTÃO chamar `onDone` (que revela o próximo cartão).
const STEP_CHECK_HOLD_MS = 1500;

function finishStep(card, onDone, { preDelayMs = 0, extraHoldMs = 0 } = {}) {
  const check = card.querySelector(".step-check");
  setTimeout(() => {
    if (check) check.hidden = false;
    setTimeout(() => {
      if (check) check.hidden = true;
      card.dataset.state = "completed";
      setStepControlsDisabled(card, true);
      onDone();
    }, STEP_CHECK_HOLD_MS + extraHoldMs);
  }, preDelayMs);
}

// Tocar no título de um cartão já concluído (sem destaque) reabre ele pra
// edição — esconde de novo tudo que vinha depois, já que essas escolhas
// dependiam do que está sendo mudado agora. O gatilho fica só no <h2>, não
// no cartão inteiro: um clique em qualquer botão/select lá dentro (ex.
// "Continuar") já muda o cartão pra "completed" na hora, e como esse clique
// também borbulha até o cartão, um listener no cartão inteiro acabaria
// reabrindo o próprio cartão que acabou de avançar.
// O cartão de corrida não tem título (nem nunca fica "completed"/"condensed"
// como os 3 primeiros, já que é sempre o último passo) — não entra nesse
// comportamento de reabrir ao tocar no <h2>.
for (const key of STEP_ORDER) {
  if (key === "run") continue;
  STEP_CARDS[key].querySelector("h2").addEventListener("click", () => {
    const state = STEP_CARDS[key].dataset.state;
    if (state === "completed" || state === "condensed") advanceTo(key);
  });
}

let bpmPool = [];
let tracker = null;
let displayTimer = null;
let bootstrapTimer = null;
let endOfTrackTimer = null;
let currentTrackId = null;
let activeMode = "auto"; // "auto" (cadência real) | "fixed" (faixa de BPM fixa)
let fixedRange = null; // {min, max} quando activeMode === "fixed"
// Cadência (passos/min) usada pra escolher a faixa que está tocando agora
// (modo automático) — congelada no momento da troca, diferente da leitura
// "tempo real" que segue atualizando (ver updateCadenceDisplay). Mostra o
// "porquê" dessa faixa mesmo que a cadência real já tenha mudado desde
// então.
let lastMatchCadence = 0;
let runActive = false; // true desde o primeiro "Play" até fechar/recarregar a página
// true enquanto pausado (Spotify pausado + troca automática de faixa
// suspensa) — não confundir com runActive=false, que é o estado inicial
// antes de qualquer "Play". Ver pauseRun()/resumeRun().
let runPaused = false;
// Quanto tempo (ms) falta pra faixa atual acabar, contado a partir de
// trackSegmentStartedAt — usado pra retomar o agendamento de troca de
// faixa no ponto certo depois de um pause, em vez de recomeçar a
// contagem do zero. Atualizado em pauseRun() (desconta o tempo já
// tocado) e lido em resumeRun() (reagenda com o que sobrou).
let trackRemainingMs = null;
let trackSegmentStartedAt = null;
// true quando a última tentativa de tocar falhou por falta de dispositivo
// ativo e está esperando RETRY_AFTER_ERROR_MS pra tentar de novo sozinha —
// usado pra pular direto pra essa nova tentativa assim que o usuário volta
// pro RunBeat (ver visibilitychange), sem esperar o intervalo inteiro.
let noDeviceRetryPending = false;
// true logo depois de abrir o Spotify pelo "Spotify sync" — usado pra
// esconder a dica "Voltar é só tocar..." e o status "Abrindo o Spotify..."
// assim que o usuário volta pro RunBeat (pela pílula do iOS ou trocando de
// app manualmente), já que nenhum dos dois faz mais sentido depois disso
// (ver visibilitychange).
let warmupPending = false;
// Timer do aviso "Pode começar a correr!" (ver waitForFirstCadence) —
// guardado à parte do bootstrapTimer pra poder cancelar/escondê-lo de forma
// independente sempre que a espera pela primeira cadência for interrompida
// (pause, troca pro modo fixo, faixa começou a tocar).
let cadenceWaitHintTimer = null;
// Guardado só pra poder recalcular o resumo do passo 2 ("(N Items)") na
// língua nova quando o idioma muda — ver refreshDynamicTexts().
let lastLibraryItemCount = null;
let playRequestSeq = 0; // invalida trocas de faixa que ficaram pra trás no tempo
let history = []; // faixas já tocadas nesta corrida, em ordem — pra "Anterior"
const playedIds = new Set();

// "Faixa Bônus" — faixa fixa escolhida pelo próprio usuário (link colado,
// não vem do pool) que toca por cima da faixa atual quando o botão é
// apertado. Persiste entre visitas (localStorage), já resolvida
// (nome/artista/BPM) no momento em que foi salva, pra o botão não precisar
// esperar nenhuma chamada de API na hora do toque.
let boostTrack = null;

// Pulso sonoro — agenda cliques via Web Audio API, cujo relógio é bem mais
// preciso que setTimeout pra esse fim.
let audioCtx = null;
let audiblePulseEnabled = false;
let clickSchedulerHandle = null;
let clickPeriodSec = null;
let nextClickTime = 0;
let currentEffectiveBpm = null; // pra religar o pulso se o checkbox for marcado no meio de uma faixa

// Screen Wake Lock — mantém a tela ligada durante a corrida (iOS 18.4+ em
// PWA instalado) pra evitar que o app fique em segundo plano por timeout
// automático de tela. Não impede o usuário de apertar o botão físico de
// bloquear — a API não tem como interceptar isso.
let wakeLock = null;

function populatePaceOptions() {
  el.paceSelect.innerHTML = "";
  for (const opt of FIXED_PACE_OPTIONS) {
    const option = document.createElement("option");
    option.value = opt.id;
    option.textContent = `${opt.label} (${opt.min}–${opt.max} bpm)`;
    el.paceSelect.appendChild(option);
  }
}

function currentFixedRange() {
  const opt = FIXED_PACE_OPTIONS.find((o) => o.id === el.paceSelect.value);
  return opt ? { min: opt.min, max: opt.max } : null;
}

// Resumo exibido ao lado do título do passo 3 depois de concluído (ex.
// "(Automático)" ou "(Warming Up)") — ver o mesmo padrão em connect-summary
// e library-summary.
function updatePaceSummary() {
  if (el.modeSelect.value === "fixed") {
    const opt = FIXED_PACE_OPTIONS.find((o) => o.id === el.paceSelect.value);
    el.paceSummary.textContent = opt ? `(${opt.label})` : "";
  } else {
    el.paceSummary.textContent = t("autoSummary");
  }
}

// Aplica imediatamente uma troca de modo/velocidade feita em pleno andamento
// da corrida — antes, essas trocas só valiam na próxima vez que "Iniciar
// corrida" fosse clicado, o que fazia o app ignorar qualquer mudança de
// modo/ritmo escolhida depois de já ter começado.
function applyLiveModeChange() {
  if (!runActive) return;
  activeMode = el.modeSelect.value;
  fixedRange = activeMode === "fixed" ? currentFixedRange() : null;
  clearInterval(bootstrapTimer);
  clearCadenceWaitHint();
  clearTimeout(endOfTrackTimer);
  playNextAndSchedule().catch((err) => showRunError(err.message));
}

function startBeatPulse(effectiveBpm) {
  if (!effectiveBpm || effectiveBpm <= 0) return;
  currentEffectiveBpm = effectiveBpm;
  el.beatBpmValue.textContent = t("beatsPerMin", { n: Math.round(effectiveBpm) });
  el.beatVisual.hidden = false;
  startAudiblePulse(effectiveBpm);
}

// --- Pulso sonoro ---
// Um clique curto a cada batida, tocado no navegador (não no Spotify). Não
// temos como saber a fase real do áudio da faixa — é um metrônomo
// independente, não uma sobreposição travada no áudio. Também não é
// garantido que o iOS misture esse som com o Spotify em vez de abafar um
// dos dois — daí ser opcional.
// A criação do AudioContext (linha de baixo) precisa acontecer de forma
// síncrona dentro do gesto de toque do usuário — isso já acontece (é
// chamada direto no "change" do checkbox). O resume() em si pode demorar
// um pouco pra resolver no Safari/iOS, daí o await — mas isso não invalida
// o gesto, porque o pedido de resume já foi disparado de forma síncrona.
async function ensureAudioContext() {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch {
      // O estado abaixo (ctx.state) reflete a falha — não precisa de mais nada aqui.
    }
  }
  return audioCtx;
}

// iOS às vezes cria o contexto mas não sai de "suspended" (ou toca sem som
// nenhum sair, por causa do interruptor de silêncio do aparelho, ou por já
// ter o Spotify ocupando a sessão de áudio) — mostra isso na tela, já que
// não dá pra abrir o console do navegador num iPhone sem um Mac por perto.
function updateAudioStatus(ctx) {
  if (!audiblePulseEnabled) {
    el.audioStatus.hidden = true;
    return;
  }
  const blocked = ctx.state !== "running";
  el.audioStatus.hidden = false;
  el.audioStatus.textContent = blocked ? t("audioBlocked") : t("audioActive");
  el.audioStatus.classList.toggle("audio-status-warn", blocked);
}

function playClick(time) {
  // Tom intermediário (nem o bipe agudo original, nem o surdo grave) —
  // frequência começa em 400Hz e cai até 180Hz, mais parecido com uma
  // batida de tom/caixa do que um bipe eletrônico ou um grave de bumbo.
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(400, time);
  osc.frequency.exponentialRampToValueAtTime(180, time + 0.05);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.7, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(time);
  osc.stop(time + 0.12);
}

function scheduleClicks() {
  if (!audiblePulseEnabled || !clickPeriodSec || !audioCtx) return;
  while (nextClickTime < audioCtx.currentTime + 0.2) {
    playClick(nextClickTime);
    nextClickTime += clickPeriodSec;
  }
}

async function startAudiblePulse(effectiveBpm) {
  if (!audiblePulseEnabled || !effectiveBpm) return;
  const ctx = await ensureAudioContext();
  if (!audiblePulseEnabled) return; // pode ter sido desmarcado enquanto o resume() rodava
  updateAudioStatus(ctx);
  clickPeriodSec = 60 / effectiveBpm;
  nextClickTime = ctx.currentTime + 0.05;
  clearInterval(clickSchedulerHandle);
  clickSchedulerHandle = setInterval(scheduleClicks, 50);
}

function stopAudiblePulse() {
  clearInterval(clickSchedulerHandle);
  clickSchedulerHandle = null;
  clickPeriodSec = null;
}

function setStatus(text) {
  el.status.textContent = text;
}

function showRunError(message) {
  el.runError.textContent = message;
  el.runError.hidden = !message;
}

// Mostra um link "https://open.spotify.com/track/<id>" — Universal Link, não
// o esquema customizado "spotify:track:<id>". Abrir esse link no celular
// manda o app Spotify começar a tocar essa faixa sozinho (sem precisar
// procurar nada lá dentro), desde que nada mais esteja tocando ainda — igual
// ao esquema customizado nesse sentido. A diferença é que, por ser um
// Universal Link (domínio verificado), o iOS costuma mostrar sozinho a
// pilula "‹ Voltar pro RunBeat" no topo da tela depois de abrir — volta com
// um toque só, em vez do usuário precisar lembrar de trocar de app de
// volta manualmente (isso não acontece com o esquema customizado).
function showNoDeviceLink(track) {
  el.openSpotifyLink.href = spotifyTrackWebUrl(track.id);
  el.openSpotifyLink.hidden = false;
}

function spotifyTrackWebUrl(trackId) {
  return `https://open.spotify.com/track/${trackId}`;
}

function hideNoDeviceLink() {
  el.openSpotifyLink.hidden = true;
}

// Troca qual dos dois botões está em destaque: antes do sync funcionar,
// "Spotify sync" chama mais atenção que o Play (ainda esmaecido); assim que
// funciona, a ênfase inverte — Play vira a ação óbvia, "Spotify sync" recua
// pro segundo plano (ver .warmup-btn.is-highlighted/.play-pause-btn.is-muted
// no CSS).
function setSyncHighlight(syncIsHighlighted) {
  el.warmupBtn.classList.toggle("is-highlighted", syncIsHighlighted);
  el.playPauseBtn.classList.toggle("is-muted", syncIsHighlighted);
}

// Faixa fixa usada pra "aquecer" o Spotify — escolhida pelo usuário
// especificamente por ser tranquila/discreta (não uma música real do pool,
// que tocaria em volume normal e sem relação nenhuma com a corrida ainda).
// Antes disso o app tentava achar dinamicamente uma faixa "silenciosa" via
// busca no catálogo do Spotify — trocado por uma faixa fixa e conhecida,
// que é mais previsível que depender do resultado de uma busca.
const WARMUP_TRACK_ID = "3mSFn1km1dGcGHUNqmEaHM"; // "One Bird Singing" — Auge Espiritual

// "Aquece" o Spotify abrindo o app de verdade (Universal Link — ver
// showNoDeviceLink pra mais detalhes de por que Universal Link em vez do
// esquema customizado "spotify:track:<id>") — a mesma técnica do fallback
// "sem dispositivo ativo" (ver showNoDeviceLink), que é a única que se
// provou 100% confiável em testes reais. Uma versão anterior tentava tocar
// remoto via API (device_id) sem sair do RunBeat, mas o Spotify às vezes
// lista o dispositivo como disponível e ainda assim recusa o comando —
// testado e descartado por instável. Como aqui SEMPRE troca de app
// (diferente da tentativa anterior), abre sempre a mesma faixa fixa
// (WARMUP_TRACK_ID) em vez de uma música real do pool.
function warmUpSpotify() {
  el.warmupHint.hidden = false;
  el.warmupStatus.hidden = false;
  el.warmupStatus.textContent = t("openingSpotify");
  warmupPending = true;

  setSyncHighlight(false);
  // O Spotify vai abrir e tocar essa faixa sozinho — o Play pulsa até o
  // primeiro toque pra deixar claro que precisa voltar e apertar logo (ver
  // startRun(), que tira o pulso assim que a corrida realmente começa).
  el.playPauseBtn.classList.add("is-attention");
  window.location.href = spotifyTrackWebUrl(WARMUP_TRACK_ID);
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch (err) {
    console.warn("Wake Lock indisponível:", err.message);
  }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

async function loadPlaylistOptions() {
  el.playlistSelect.innerHTML = "";

  // "Todos" é uma opção exclusiva (ver playlistExclusivity) — seleciona de
  // uma vez só tudo que existe: toda a biblioteca do Spotify (playlists
  // próprias + Músicas Curtidas) E a Playlist RunBeat com todos os gêneros.
  // Vem primeiro, depois a Playlist RunBeat (Catálogo) isolada, depois as
  // playlists próprias do usuário.
  const allOpt = document.createElement("option");
  allOpt.value = "__all__";
  allOpt.textContent = t("allOption");
  el.playlistSelect.appendChild(allOpt);

  const catalogOpt = document.createElement("option");
  catalogOpt.value = "__catalog__";
  catalogOpt.textContent = "RunBeat";
  el.playlistSelect.appendChild(catalogOpt);

  const myUserId = await api.getCurrentUserId();
  const playlists = await api.getMyPlaylists();
  // Só as playlists de propriedade do usuário aparecem na lista — playlists
  // de outras contas que ele segue/colabora ficam de fora (continuam
  // incluídas em "Todos", só não viram opção individual aqui).
  const ownPlaylists = playlists.filter((p) => p.ownerId === myUserId);
  for (const p of ownPlaylists) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    el.playlistSelect.appendChild(opt);
  }

  // Nenhuma opção começa marcada — o passo 2 sempre abre em branco, sem
  // herdar seleção de uma visita anterior.
  playlistExclusivity.sync();
  updateCatalogGenreVisibility();
  updateMultiselectSummary(el.playlistSelect, el.playlistSummaryBtn);
  updateBuildPoolAvailability();
}

// Marcar uma opção "exclusiva" (ex. "Todos") dentro de um <select multiple>
// desmarca qualquer outra coisa, e marcar qualquer outra coisa desmarca a
// opção exclusiva — um <select multiple> nativo não tem esse conceito de
// exclusividade sozinho, por isso o rastreamento da seleção anterior (pra
// saber o que acabou de mudar). Reaproveitado tanto pro <select> de
// playlists ("Todos") quanto pro de gêneros do Catálogo ("Todos").
function makeExclusivityEnforcer(selectEl, exclusiveValue) {
  let previous = new Set();

  function sync() {
    previous = new Set(Array.from(selectEl.selectedOptions).map((o) => o.value));
  }

  function enforce() {
    const options = Array.from(selectEl.options);
    const current = new Set(options.filter((o) => o.selected).map((o) => o.value));
    const exclusiveJustSelected = current.has(exclusiveValue) && !previous.has(exclusiveValue);
    const otherJustSelected = [...current].some(
      (v) => v !== exclusiveValue && !previous.has(v)
    );

    if (exclusiveJustSelected) {
      for (const o of options) o.selected = o.value === exclusiveValue;
    } else if (current.has(exclusiveValue) && otherJustSelected) {
      options.find((o) => o.value === exclusiveValue).selected = false;
    }

    sync();
  }

  return { sync, enforce };
}

const playlistExclusivity = makeExclusivityEnforcer(el.playlistSelect, "__all__");
const genreExclusivity = makeExclusivityEnforcer(el.catalogGenreSelect, "__all__");

// O passo 2 só libera "Carregar BPM" com uma seleção válida — playlist
// escolhida (ou "Todos") e, se a Playlist RunBeat estiver marcada
// isoladamente, também ao menos um gênero (ou "Todos" dentre eles). Sem
// seleção nenhuma, o botão fica desabilitado — não existe mais um estado
// implícito de "nada marcado = tudo incluído".
function hasValidPoolSelection() {
  if (el.playlistSelect.selectedOptions.length === 0) return false;
  const catalogAloneSelected = Array.from(el.playlistSelect.selectedOptions).some(
    (o) => o.value === "__catalog__"
  );
  if (catalogAloneSelected && el.catalogGenreSelect.selectedOptions.length === 0) return false;
  return true;
}

function updateBuildPoolAvailability() {
  el.buildPoolBtn.disabled = !hasValidPoolSelection();
}

// --- Multiselect de playlists/gêneros (UI própria por cima do <select
// multiple> — o resumo nativo "N Items"/"..." do iOS pra <select multiple>
// não pode ser restilizado nem traduzido). O campo fica fechado por
// padrão; tocar nele abre um pop-up modal (compartilhado entre playlists e
// gêneros, só um por vez) com a lista de marcar/desmarcar — cada linha é
// tocável por inteiro e marca/desmarca com destaque de cor e um checkbox
// próprio ao lado do texto. O <select> original continua escondido no DOM como
// "fonte da verdade" — toda a lógica de seleção/exclusividade continua
// lendo e escrevendo nele normalmente; as funções abaixo só espelham o
// estado dele no pop-up.
let activeMultiselect = null; // { selectEl, summaryBtnEl } — qual campo está aberto no modal agora

function renderMultiselectPanel(selectEl, panelEl) {
  panelEl.innerHTML = "";
  for (const opt of selectEl.options) {
    const row = document.createElement("div");
    row.className = "multiselect-option";
    row.dataset.value = opt.value;
    row.classList.toggle("is-selected", opt.selected);

    const check = document.createElement("span");
    check.className = "multiselect-check";
    row.appendChild(check);

    const label = document.createElement("span");
    label.className = "multiselect-label";
    if (opt.value === "__catalog__") {
      // Linha da Playlist RunBeat ganha a logo + o nome com a mesma
      // tipografia do cabeçalho do app, em vez de texto puro — reforça que é
      // o catálogo próprio do RunBeat, não uma playlist qualquer do usuário.
      const logo = document.createElement("img");
      logo.src = "img/logo-mark.png";
      logo.alt = "";
      logo.className = "multiselect-option-logo";
      label.appendChild(logo);
      const brand = document.createElement("span");
      brand.className = "brand-runbeat";
      brand.textContent = opt.textContent;
      label.appendChild(brand);
    } else {
      label.textContent = opt.textContent;
    }
    row.appendChild(label);

    panelEl.appendChild(row);
  }
}

function syncMultiselectSelection(selectEl, panelEl) {
  const selected = new Set(Array.from(selectEl.selectedOptions).map((o) => o.value));
  for (const row of panelEl.querySelectorAll(".multiselect-option")) {
    row.classList.toggle("is-selected", selected.has(row.dataset.value));
  }
}

// Campo fechado por padrão — o resumo mostra "Selecione" sem nada marcado,
// ou a contagem depois de qualquer seleção.
function updateMultiselectSummary(selectEl, summaryBtnEl) {
  const n = selectEl.selectedOptions.length;
  summaryBtnEl.textContent = n === 0 ? t("selectPlaceholder") : t(n === 1 ? "oneItem" : "nItems", { n });
  summaryBtnEl.classList.toggle("is-placeholder", n === 0);
}

// Se `selectEl` for o campo aberto no momento no modal, re-renderiza o
// destaque das linhas — necessário porque uma mudança pode vir de outro
// lugar além de um toque direto no pop-up (ex. exclusividade de "toda a
// biblioteca" desmarcando outras opções).
function refreshMultiselectModalIfOpen(selectEl) {
  if (activeMultiselect?.selectEl === selectEl) {
    syncMultiselectSelection(selectEl, el.multiselectModalPanel);
  }
}

function openMultiselectModal(selectEl, summaryBtnEl, title) {
  activeMultiselect = { selectEl, summaryBtnEl };
  el.multiselectModalTitle.textContent = title;
  renderMultiselectPanel(selectEl, el.multiselectModalPanel);
  el.multiselectModal.hidden = false;
}

function closeMultiselectModal() {
  el.multiselectModal.hidden = true;
  activeMultiselect = null;
}

let catalogGenresLoaded = false;

// Mostra/esconde o dropdown de gêneros do Catálogo RunBeat conforme a
// Playlist RunBeat estiver marcada isoladamente entre as fontes
// selecionadas — quando "Todos" está marcado, todos os gêneros já estão
// implícitos, então o dropdown de gêneros fica escondido. Popula o
// dropdown na primeira vez que ficar visível.
function updateCatalogGenreVisibility() {
  const catalogSelected = Array.from(el.playlistSelect.selectedOptions).some(
    (o) => o.value === "__catalog__"
  );
  el.catalogGenreGroup.hidden = !catalogSelected;
  if (catalogSelected && !catalogGenresLoaded) {
    catalogGenresLoaded = true;
    populateCatalogGenreOptions().catch((err) => {
      catalogGenresLoaded = false; // permite tentar de novo na próxima seleção
      console.warn("Falha ao carregar gêneros do Catálogo RunBeat:", err.message);
    });
  }
}

async function populateCatalogGenreOptions() {
  const genres = await loadCatalogGenres();
  el.catalogGenreSelect.innerHTML = "";

  // "Todos" é uma opção exclusiva (ver genreExclusivity), igual à de
  // playlists — marcar ela desmarca os gêneros individuais e vice-versa.
  const allOpt = document.createElement("option");
  allOpt.value = "__all__";
  allOpt.textContent = t("allOption");
  el.catalogGenreSelect.appendChild(allOpt);

  for (const genre of genres) {
    const opt = document.createElement("option");
    opt.value = genre;
    opt.textContent = genre;
    el.catalogGenreSelect.appendChild(opt);
  }

  // Idem: nenhum gênero começa marcado — só libera "Carregar BPM" depois
  // de uma escolha explícita (específica ou "Todos").
  genreExclusivity.sync();
  updateMultiselectSummary(el.catalogGenreSelect, el.catalogGenreSummaryBtn);
  updateBuildPoolAvailability();
}

// "__all__" vira lista vazia pro catalogSource.js — que já trata "sem
// filtro" como "catálogo inteiro" — já que a exclusividade garante que
// "Todos" nunca fica marcado junto com gêneros específicos.
function selectedCatalogGenres() {
  const values = Array.from(el.catalogGenreSelect.selectedOptions).map((o) => o.value);
  return values.includes("__all__") ? [] : values;
}

function dedupeRefs(listOfRefLists) {
  const seenIds = new Set();
  const refs = [];
  for (const list of listOfRefLists) {
    for (const track of list) {
      if (!seenIds.has(track.id)) {
        seenIds.add(track.id);
        refs.push(track);
      }
    }
  }
  return refs;
}

// Busca as faixas de uma fonte sem deixar uma falha isolada (ex. playlist
// sem permissão de leitura) derrubar a análise inteira — devolve refs
// vazio e o nome/motivo da fonte em `failure` nesse caso.
async function fetchSourceRefs(id, label, catalogGenres) {
  try {
    let refs;
    if (id === "__catalog__") refs = await loadCatalogRefs(catalogGenres);
    else if (id === "__liked__") refs = await api.getLikedSongRefs();
    else refs = await api.getPlaylistTrackRefs(id);
    // Marca cada faixa com o nome da fonte de onde veio (playlist, Músicas
    // Curtidas ou Playlist RunBeat) — usado na tela de corrida pra mostrar
    // de onde a faixa que está tocando agora foi tirada (ver "Tocando agora").
    return { refs: refs.map((r) => ({ ...r, source: label })), failure: null };
  } catch (err) {
    console.warn(`Falha ao buscar faixas de "${label}":`, err.message);
    return { refs: [], failure: { label, message: err.message } };
  }
}

// Resolve o BPM de `refs` e atualiza a tela — usado tanto pra análise das
// playlists selecionadas quanto pra "toda a biblioteca".
async function resolvePool(refs, failures = [], itemCount = 0) {
  const { tracks, diagnostic } = await buildBpmPool(refs, (done, total) => {
    el.poolProgress.textContent = t("resolvingBpm", { done, total });
  });
  bpmPool = tracks;

  let text = t("poolReady", { found: bpmPool.length, total: refs.length });
  if (failures.length > 0) {
    const names = failures.map((f) => f.label).join(", ");
    text += t("poolFailuresSuffix", { count: failures.length, names });
    text += t("poolFirstFailureReason", { message: failures[0].message });
  }
  el.poolProgress.textContent = text;
  if (bpmPool.length === 0) {
    el.poolProgress.textContent += t("poolNoTracksResolved");
    if (diagnostic) {
      el.poolProgress.textContent += t("poolDiagnostic", { diagnostic });
    }
  } else {
    lastLibraryItemCount = itemCount;
    updateLibrarySummary();
    // Cartão 2 concluído — avança pro cartão 3 (Ritmo). Reabre e refaz o
    // cartão 3 mesmo se o usuário só queria trocar de playlist com a
    // corrida já em andamento — mantém o modelo simples e previsível.
    advanceTo("pace");
  }
}

// Extraído de resolvePool() pra poder recalcular na língua nova quando o
// idioma muda (ver refreshDynamicTexts) sem precisar reconstruir o pool.
function updateLibrarySummary() {
  if (lastLibraryItemCount == null) return;
  const n = lastLibraryItemCount;
  el.librarySummary.textContent = `(${t(n === 1 ? "oneItem" : "nItems", { n })})`;
}

async function buildPool() {
  const selectedOptions = Array.from(el.playlistSelect.selectedOptions);
  if (!hasValidPoolSelection()) {
    el.poolProgress.hidden = false;
    el.poolProgress.textContent =
      selectedOptions.length === 0 ? t("chooseAtLeastOnePlaylist") : t("chooseAtLeastOneGenre");
    return;
  }
  const catalogGenres = selectedCatalogGenres();

  el.buildPoolBtn.disabled = true;
  el.poolProgress.hidden = false;
  el.poolProgress.textContent = t("fetchingTracks");

  const results = await Promise.all(
    selectedOptions.map((opt) => fetchSourceRefs(opt.value, opt.textContent, catalogGenres))
  );
  const failures = results.map((r) => r.failure).filter(Boolean);
  await resolvePool(dedupeRefs(results.map((r) => r.refs)), failures, selectedOptions.length);

  updateBuildPoolAvailability();
}

// "Todos" junta literalmente tudo: Músicas Curtidas + todas as playlists da
// conta + a Playlist RunBeat inteira (todos os gêneros do catálogo) — sem
// precisar escolher uma por uma. O "banco de BPM" cresce conforme mais
// faixas vão sendo analisadas (o cache de BPM em bpmSource.js já persiste
// entre usos).
async function buildPoolFromEverything() {
  el.buildPoolBtn.disabled = true;
  el.poolProgress.hidden = false;
  el.poolProgress.textContent = t("fetchingLibraryPlaylists");

  const myUserId = await api.getCurrentUserId();
  const playlists = await api.getMyPlaylists();
  const sources = [
    { id: "__liked__", name: t("likedSongs") },
    ...playlists.map((p) => ({
      id: p.id,
      name: p.ownerId && p.ownerId !== myUserId ? t("playlistByOwner", { name: p.name, owner: p.ownerName }) : p.name,
    })),
    { id: "__catalog__", name: "RunBeat" },
  ];

  const refLists = [];
  const failures = [];
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    el.poolProgress.textContent = t("fetchingTracksSource", { i: i + 1, total: sources.length, name: source.name });
    const { refs, failure } = await fetchSourceRefs(source.id, source.name, []);
    refLists.push(refs);
    if (failure) failures.push(failure);
  }

  await resolvePool(dedupeRefs(refLists), failures, sources.length);

  updateBuildPoolAvailability();
}

function updateCadenceDisplay() {
  const liveCadence = tracker?.getCurrentSpm() ?? 0;
  el.cadenceLiveValue.textContent = liveCadence > 0 ? t("stepsPerMin", { n: liveCadence }) : t("measuring");

  if (activeMode === "fixed") {
    el.cadenceLastLabel.textContent = t("targetLabel");
    el.cadenceLastValue.textContent = fixedRange
      ? t("stepsPerMinRange", { min: fixedRange.min, max: fixedRange.max })
      : "—";
    return;
  }
  el.cadenceLastLabel.textContent = t("lastMeasurementLabel");
  el.cadenceLastValue.textContent = lastMatchCadence > 0 ? t("stepsPerMin", { n: lastMatchCadence }) : "—";
}

// Extraído de playSpecificTrack() pra poder recalcular o texto na língua
// nova (ver refreshDynamicTexts) sem precisar tocar a faixa de novo.
function renderTrackInfo(track) {
  el.trackNameValue.textContent = `${track.name} — ${track.artist}`;
  el.trackSourceValue.textContent = track.source ? `"${track.source}"` : "—";
  el.trackGenreRow.hidden = !track.genre;
  if (track.genre) el.trackGenreValue.textContent = track.genre;
}

// `requestId` evita que uma troca de faixa lenta (ex. chamada à API do
// Spotify demorando) sobrescreva na tela o resultado de uma troca mais
// recente — se outra chamada já começou depois desta, esta é descartada
// silenciosamente ao terminar. Devolve false quando isso acontece.
async function playSpecificTrack(track, requestId) {
  await api.playTrackUri(track.uri);
  if (requestId !== playRequestSeq) return false;
  currentTrackId = track.id;
  renderTrackInfo(track);
  showRunError("");
  hideNoDeviceLink();
  startBeatPulse(track.effectiveBpm);
  // playTrackUri sempre começa a faixa do zero — se estava pausado (ex.
  // troca de faixa manual ou automática durante uma pausa), volta a
  // "tocando" de verdade, senão o botão ficaria mostrando "Play" com a
  // música já rolando.
  if (runPaused) {
    runPaused = false;
    setPlayPauseIcon(true);
  }
  return true;
}

// Agenda a troca seguinte pra pouco antes do fim da faixa — sem nunca
// precisar perguntar ao Spotify "quanto falta", já que sabemos a duração da
// faixa que mandamos tocar. Guarda o ponto de partida e a duração restante
// pra dar pra retomar certo depois de um pause (ver pauseRun()).
function scheduleEndOfTrack(track) {
  clearTimeout(endOfTrackTimer);
  const durationMs = track.durationMs || FALLBACK_TRACK_DURATION_MS;
  trackSegmentStartedAt = Date.now();
  trackRemainingMs = durationMs;
  const delay = Math.max(durationMs - END_OF_TRACK_LEAD_MS, 1000);
  endOfTrackTimer = setTimeout(playNextAndSchedule, delay);
}

// Escolhe e toca a próxima faixa pra cadência atual (usado tanto pela troca
// automática de fim de faixa quanto pelo botão "Próxima").
async function playNextAndSchedule() {
  // Qualquer chamada nova (manual ou automática) resolve a espera de retry
  // pendente — ver o listener de visibilitychange mais abaixo.
  noDeviceRetryPending = false;
  const requestId = ++playRequestSeq;
  const cadenceNow = tracker?.getCurrentSpm() ?? 0;
  const track =
    activeMode === "fixed"
      ? pickTrackForRange(bpmPool, fixedRange, playedIds)
      : pickTrackForCadence(bpmPool, cadenceNow, playedIds);
  if (!track) return;
  // Congela a cadência usada nessa escolha pro rótulo "Última medição" (ver
  // updateCadenceDisplay) — só faz sentido no modo automático, onde a
  // cadência real é o critério de escolha.
  if (activeMode !== "fixed") lastMatchCadence = cadenceNow;

  // Marca como "tentada" antes de tocar — se falhar (ex. faixa do catálogo
  // com ID que não existe mais no Spotify), o retry abaixo escolhe outra
  // em vez de bater na mesma faixa quebrada pra sempre.
  playedIds.add(track.id);

  try {
    const applied = await playSpecificTrack(track, requestId);
    if (!applied) return; // uma troca mais recente já assumiu enquanto isso tocava
    history.push(track);
    scheduleEndOfTrack(track);
  } catch (err) {
    if (requestId !== playRequestSeq) return;
    showRunError(err.message);
    if (err.code === "NO_ACTIVE_DEVICE") {
      showNoDeviceLink(track);
      // Assim que o usuário voltar pro RunBeat depois de abrir o Spotify
      // pelo link acima, o listener de visibilitychange já tenta de novo
      // na hora, sem esperar esse intervalo inteiro (ver mais abaixo).
      noDeviceRetryPending = true;
    }
    // Não trava o loop — tenta de novo em breve (ex. dispositivo Spotify
    // pode ter ficado inativo temporariamente, ou a faixa não existe mais).
    endOfTrackTimer = setTimeout(playNextAndSchedule, RETRY_AFTER_ERROR_MS);
  }
}

async function skipToNext() {
  clearTimeout(endOfTrackTimer);
  await playNextAndSchedule();
}

async function skipToPrevious() {
  if (history.length < 2) return; // nada antes da faixa atual
  clearTimeout(endOfTrackTimer);
  history.pop(); // remove a atual
  const previousTrack = history[history.length - 1];
  const requestId = ++playRequestSeq;
  try {
    const applied = await playSpecificTrack(previousTrack, requestId);
    if (!applied) return;
    scheduleEndOfTrack(previousTrack);
  } catch (err) {
    if (requestId !== playRequestSeq) return;
    showRunError(err.message);
    if (err.code === "NO_ACTIVE_DEVICE") showNoDeviceLink(previousTrack);
  }
}

// --- "Faixa Bônus" ---

// Aceita um link completo (https://open.spotify.com/track/<id>?...),
// o esquema "spotify:track:<id>", ou só o ID cru — o que o usuário colar.
function extractSpotifyTrackId(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/track[/:]([A-Za-z0-9]{22})/);
  if (match) return match[1];
  return /^[A-Za-z0-9]{22}$/.test(trimmed) ? trimmed : null;
}

function showBoostError(message) {
  el.boostError.textContent = message;
  el.boostError.hidden = !message;
}

function updateBoostUi() {
  el.boostConfigure.hidden = !!boostTrack;
  el.boostConfigured.hidden = !boostTrack;
  if (boostTrack) {
    el.boostTrackName.textContent = `${boostTrack.name} — ${boostTrack.artist}`;
  }
  el.boostBtn.disabled = !boostTrack || !runActive;
}

function loadBoostTrack() {
  const raw = localStorage.getItem(STORAGE_KEYS.boostTrack);
  boostTrack = raw ? JSON.parse(raw) : null;
  updateBoostUi();
}

// Resolve nome/artista/BPM na hora de salvar (não no toque do botão) —
// assim o botão em si é instantâneo, sem esperar nenhuma chamada de API.
async function saveBoostTrack() {
  const id = extractSpotifyTrackId(el.boostTrackInput.value);
  if (!id) {
    showBoostError(t("boostInvalidLink"));
    return;
  }
  el.boostSaveBtn.disabled = true;
  showBoostError("");
  try {
    const meta = await api.getTrack(id);
    const { tracks } = await buildBpmPool([meta]);
    if (tracks.length === 0 || !tracks[0].tempo) {
      showBoostError(t("boostNoTempo"));
      return;
    }
    boostTrack = tracks[0];
    localStorage.setItem(STORAGE_KEYS.boostTrack, JSON.stringify(boostTrack));
    el.boostTrackInput.value = "";
    updateBoostUi();
  } catch (err) {
    showBoostError(t("genericErrorPrefix", { message: err.message }));
  } finally {
    el.boostSaveBtn.disabled = false;
  }
}

function forgetBoostTrack() {
  boostTrack = null;
  localStorage.removeItem(STORAGE_KEYS.boostTrack);
  updateBoostUi();
}

// Toca a Faixa Bônus por cima da faixa atual — mesma mecânica de
// playSpecificTrack()/scheduleEndOfTrack() usada pra qualquer troca normal,
// só que a faixa já vem pronta (fixa) em vez de escolhida pelo matcher.
// Depois que ela termina, a troca automática volta ao normal sozinha.
async function triggerBoost() {
  if (!boostTrack || !runActive) return;
  clearTimeout(endOfTrackTimer);
  const requestId = ++playRequestSeq;
  const track = { ...boostTrack, source: t("boostTrackSource"), effectiveBpm: boostTrack.tempo };
  try {
    const applied = await playSpecificTrack(track, requestId);
    if (!applied) return;
    history.push(track);
    playedIds.add(track.id);
    scheduleEndOfTrack(track);
  } catch (err) {
    if (requestId !== playRequestSeq) return;
    showRunError(err.message);
    if (err.code === "NO_ACTIVE_DEVICE") showNoDeviceLink(track);
  }
}

// Modo automático: só começa a tocar quando tiver uma primeira leitura
// confiável de cadência (no início da corrida o acelerômetro ainda não tem
// dado suficiente na janela deslizante). Modo fixo: começa na hora, o valor
// já é conhecido de antemão.
function waitForFirstCadence() {
  if (activeMode === "fixed") {
    playNextAndSchedule();
    return;
  }
  // Sem nenhum passo detectado ainda depois de um tempo — provavelmente o
  // usuário só ainda não começou a se mexer. Um aviso evita deixar a tela
  // parada sem explicação nenhuma enquanto isso.
  cadenceWaitHintTimer = setTimeout(() => {
    el.cadenceWaitHint.hidden = false;
  }, CADENCE_WAIT_HINT_DELAY_MS);
  bootstrapTimer = setInterval(() => {
    if (tracker.getCurrentSpm() > 0) {
      clearInterval(bootstrapTimer);
      clearCadenceWaitHint();
      playNextAndSchedule();
    }
  }, CADENCE_DISPLAY_INTERVAL_MS);
}

function clearCadenceWaitHint() {
  clearTimeout(cadenceWaitHintTimer);
  el.cadenceWaitHint.hidden = true;
}

// SVG elements não refletem a propriedade `.hidden` pro atributo HTML
// (ao contrário de elementos HTML normais), então setAttribute/
// removeAttribute é usado direto pra garantir que o seletor CSS
// `[hidden]` realmente funcione nesses ícones.
function setSvgHidden(svg, hidden) {
  if (hidden) svg.setAttribute("hidden", "");
  else svg.removeAttribute("hidden");
}

function setPlayPauseIcon(isPlaying) {
  setSvgHidden(el.iconPlay, isPlaying);
  setSvgHidden(el.iconPause, !isPlaying);
  el.playPauseLabel.textContent = isPlaying ? t("pauseLabel") : t("playLabel");
}

function startRun() {
  activeMode = el.modeSelect.value;
  fixedRange = activeMode === "fixed" ? currentFixedRange() : null;

  // Sempre inicia o sensor, mesmo começando em ritmo fixo — assim dá pra
  // alternar pro modo automático a qualquer momento durante a corrida.
  tracker = new CadenceTracker();
  tracker.start();

  currentTrackId = null;
  playedIds.clear();
  history = [];
  runActive = true;
  runPaused = false;
  trackRemainingMs = null;
  trackSegmentStartedAt = null;
  setPlayPauseIcon(true);
  el.prevBtn.hidden = false;
  el.nextBtn.hidden = false;
  updateBoostUi(); // libera o botão "Faixa Bônus", que fica desabilitado até a corrida começar
  showRunError("");
  hideNoDeviceLink();
  el.warmupRow.hidden = true;
  // A corrida já começou — Play/Pause virou o controle principal da tela,
  // não faz mais sentido ficar esmaecido (mesmo se o usuário nunca tiver
  // usado o "Spotify sync") nem pulsando (já foi apertado, não precisa mais
  // chamar atenção).
  setSyncHighlight(false);
  el.playPauseBtn.classList.remove("is-attention");
  requestWakeLock();
  displayTimer = setInterval(updateCadenceDisplay, CADENCE_DISPLAY_INTERVAL_MS);
  waitForFirstCadence();
}

// "Pause" agora só controla a música — pausa o Spotify de verdade e
// suspende a troca automática de faixa, mas mantém a corrida "ativa"
// (sensor de passos, faixas já tocadas, faixa atual) intacta, pra "Play"
// poder só retomar de onde parou em vez de recomeçar a corrida do zero.
function pauseRun() {
  runPaused = true;
  clearInterval(bootstrapTimer);
  clearCadenceWaitHint();
  clearTimeout(endOfTrackTimer);
  if (trackSegmentStartedAt != null && trackRemainingMs != null) {
    const elapsed = Date.now() - trackSegmentStartedAt;
    trackRemainingMs = Math.max(trackRemainingMs - elapsed, 0);
  }
  api.pausePlayback().catch((err) => console.warn("Falha ao pausar no Spotify:", err.message));
  stopAudiblePulse();
  setPlayPauseIcon(false);
}

function resumeRun() {
  runPaused = false;
  api.resumePlayback().catch((err) => {
    showRunError(err.message);
    if (err.code === "NO_ACTIVE_DEVICE") showNoDeviceLink({ id: currentTrackId });
  });
  setPlayPauseIcon(true);
  if (currentEffectiveBpm) startAudiblePulse(currentEffectiveBpm);
  // Retoma o agendamento de troca de faixa de onde parou, em vez de
  // recontar a duração inteira da faixa (que já estava parcialmente
  // tocada antes do pause).
  if (trackRemainingMs != null) {
    trackSegmentStartedAt = Date.now();
    const delay = Math.max(trackRemainingMs - END_OF_TRACK_LEAD_MS, 1000);
    endOfTrackTimer = setTimeout(playNextAndSchedule, delay);
  }
}

// `silentlyConnected`: true quando a conexão já estava valida de uma visita
// anterior (sem o usuário precisar tocar em nada agora) — nesse caso a
// sequência de conclusão do cartão 1 ganha 0,5s a mais antes de avançar pro
// cartão 2, porque não teve nenhuma ação do usuário (login manual, redirect)
// marcando o ritmo — sem isso, a transição acontece rápido demais pra
// perceber o que aconteceu.
async function refreshAuthedUi(silentlyConnected = false) {
  el.connectBtn.hidden = true;
  el.disconnectBtn.hidden = false;
  setStatus(t("connectedStatus"));
  el.connectSummary.textContent = t("connectedSummary");
  // Cartão 1 concluído (já conectado, com ou sem interação do usuário) —
  // avança pro cartão 2 na hora, sem esperar a rede: o usuário precisa ver
  // a espera + o check acontecerem de verdade, mesmo quando o login já
  // estava pronto de antes. O dropdown do cartão 2 termina de se popular
  // assim que loadPlaylistOptions() responder.
  advanceTo("library", { preDelayMs: 500, extraHoldMs: silentlyConnected ? 500 : 0 });
  await loadPlaylistOptions();
}

function updateLangButtons() {
  const lang = getLang();
  el.langPtBtn.classList.toggle("is-active", lang === "pt");
  el.langEnBtn.classList.toggle("is-active", lang === "en");
}

// A maior parte do texto é estática e já é reaplicada sozinha (ver
// applyStaticTranslations em i18n.js, via atributos data-i18n*) — esta
// função só cobre o que é montado em runtime a partir do estado atual do
// app, chamada toda vez que o idioma muda (ver onLanguageChange em init()).
// Alguns estados transitórios raros (uma mensagem de erro pontual já
// ocorrida, o progresso de carregamento de faixas em andamento) não são
// re-traduzidos — ficam na língua em que apareceram até a próxima ação do
// usuário, o que é aceitável por serem passageiros.
function refreshDynamicTexts() {
  if (el.connectBtn.hidden) {
    setStatus(t("connectedStatus"));
    el.connectSummary.textContent = t("connectedSummary");
  } else {
    setStatus(t("notConnected"));
  }

  // As opções "__all__" ("Todos"/"All") são escritas uma vez só, quando a
  // lista é populada (loadPlaylistOptions/populateCatalogGenreOptions) —
  // sem isso ficariam presas na língua de quando a tela foi carregada.
  for (const selectEl of [el.playlistSelect, el.catalogGenreSelect]) {
    const allOpt = Array.from(selectEl.options).find((o) => o.value === "__all__");
    if (allOpt) allOpt.textContent = t("allOption");
  }

  updateMultiselectSummary(el.playlistSelect, el.playlistSummaryBtn);
  updateMultiselectSummary(el.catalogGenreSelect, el.catalogGenreSummaryBtn);
  updateLibrarySummary();
  updatePaceSummary();
  if (runActive) updateCadenceDisplay();
  // Lê o atributo, não a propriedade `.hidden` — SVG não reflete os dois
  // de forma confiável em todo navegador (ver setSvgHidden()).
  setPlayPauseIcon(!el.iconPause.hasAttribute("hidden"));

  const lastTrack = history[history.length - 1];
  if (lastTrack) renderTrackInfo(lastTrack);
  if (currentEffectiveBpm) el.beatBpmValue.textContent = t("beatsPerMin", { n: Math.round(currentEffectiveBpm) });

  // O pop-up de multiseleção (playlists/gêneros) constrói suas linhas a
  // partir do texto das opções na hora que abre (ver renderMultiselectPanel)
  // — se estiver aberto durante a troca de idioma, precisa recriar as
  // linhas (com o texto das opções já atualizado acima) e o título, senão
  // ficam presos na língua de quando foi aberto.
  if (activeMultiselect) {
    const isGenreModal = activeMultiselect.selectEl === el.catalogGenreSelect;
    el.multiselectModalTitle.textContent = isGenreModal ? t("catalogGenresLabel") : "Playlists";
    renderMultiselectPanel(activeMultiselect.selectEl, el.multiselectModalPanel);
  }
}

async function init() {
  initI18n();
  setStatus(t("checkingLogin"));
  updateLangButtons();
  el.langPtBtn.addEventListener("click", () => setLang("pt"));
  el.langEnBtn.addEventListener("click", () => setLang("en"));
  onLanguageChange(() => {
    updateLangButtons();
    refreshDynamicTexts();
  });

  initOnboarding();
  populatePaceOptions();
  loadBoostTrack();
  el.modeSelect.addEventListener("change", () => {
    el.paceGroup.hidden = el.modeSelect.value !== "fixed";
    updatePaceSummary();
    applyLiveModeChange();
  });
  el.paceSelect.addEventListener("change", () => {
    updatePaceSummary();
    if (el.modeSelect.value === "fixed") applyLiveModeChange();
  });
  el.playlistSelect.addEventListener("change", () => {
    playlistExclusivity.enforce();
    updateCatalogGenreVisibility();
    refreshMultiselectModalIfOpen(el.playlistSelect);
    updateMultiselectSummary(el.playlistSelect, el.playlistSummaryBtn);
    updateBuildPoolAvailability();
  });
  el.catalogGenreSelect.addEventListener("change", () => {
    genreExclusivity.enforce();
    refreshMultiselectModalIfOpen(el.catalogGenreSelect);
    updateMultiselectSummary(el.catalogGenreSelect, el.catalogGenreSummaryBtn);
    updateBuildPoolAvailability();
  });

  el.playlistSummaryBtn.addEventListener("click", () => {
    openMultiselectModal(el.playlistSelect, el.playlistSummaryBtn, "Playlists");
  });
  el.catalogGenreSummaryBtn.addEventListener("click", () => {
    openMultiselectModal(el.catalogGenreSelect, el.catalogGenreSummaryBtn, t("catalogGenresLabel"));
  });
  el.multiselectModalPanel.addEventListener("click", (event) => {
    const row = event.target.closest(".multiselect-option");
    if (!row || !activeMultiselect) return;
    const { selectEl } = activeMultiselect;
    const opt = Array.from(selectEl.options).find((o) => o.value === row.dataset.value);
    if (!opt) return;
    opt.selected = !opt.selected;
    selectEl.dispatchEvent(new Event("change"));
  });
  el.warmupBtn.addEventListener("click", warmUpSpotify);
  el.multiselectModalClose.addEventListener("click", closeMultiselectModal);
  el.multiselectModal.addEventListener("click", (event) => {
    if (event.target === el.multiselectModal) closeMultiselectModal();
  });

  // Splash de abertura: ícone em fade-in por ~1,2s, depois some sozinho e
  // revela a tela certa — sem depender de toque nenhum do usuário. O timer
  // já começa a contar aqui, em paralelo com a checagem de login abaixo,
  // pra não somar os dois tempos. A checagem só decide QUAL card mostrar —
  // a decisão de avançar (com a espera + o check) só acontece depois do
  // splash sumir, pra o usuário sempre ver a sequência completa do cartão
  // 1, mesmo quando já estava conectado de antes.
  const minSplashDelay = new Promise((resolve) => setTimeout(resolve, 1200));

  let alreadyConnected = false;
  let justLoggedIn = false;
  let loginErrorMessage = null;
  try {
    justLoggedIn = await auth.handleRedirectCallback();
    alreadyConnected = justLoggedIn || auth.isLoggedIn();
  } catch (err) {
    loginErrorMessage = err.message;
  }

  await minSplashDelay;
  el.splashScreen.classList.add("splash-hide");
  setTimeout(() => {
    el.splashScreen.hidden = true;
  }, 400);

  if (loginErrorMessage) {
    setStatus(t("loginError", { message: loginErrorMessage }));
  } else if (alreadyConnected) {
    // "Silenciosa" = já estava conectado de antes, sem passar pelo redirect
    // de login agora — ver o comentário em refreshAuthedUi.
    refreshAuthedUi(!justLoggedIn).catch((err) => setStatus(t("genericErrorPrefix", { message: err.message })));
  } else {
    setStatus(t("notConnected"));
  }

  el.connectBtn.addEventListener("click", () => {
    auth.startLogin().catch((err) => setStatus(err.message));
  });

  el.disconnectBtn.addEventListener("click", () => {
    auth.logout();
    window.location.reload();
  });

  el.buildPoolBtn.addEventListener("click", () => {
    closeMultiselectModal();
    const isAllMode = Array.from(el.playlistSelect.selectedOptions).some(
      (o) => o.value === "__all__"
    );
    const action = isAllMode ? buildPoolFromEverything() : buildPool();
    action.catch((err) => {
      el.poolProgress.textContent = t("genericErrorPrefix", { message: err.message });
    });
  });

  el.confirmPaceBtn.addEventListener("click", () => {
    // Se a corrida já estiver rolando (usuário reabriu esse cartão só pra
    // trocar de ritmo no meio do caminho), a troca já foi aplicada ao vivo
    // pelo listener de "change" do mode-select/pace-select — esse botão só
    // precisa avançar de volta pro cartão de corrida.
    updatePaceSummary();
    advanceTo("run");
  });

  el.playPauseBtn.addEventListener("click", async () => {
    if (runActive && runPaused) {
      resumeRun();
      return;
    }
    if (runActive) {
      pauseRun();
      return;
    }
    try {
      // Pede a permissão sempre, mesmo começando em ritmo fixo — o sensor
      // roda em paralelo pra poder alternar pro modo automático a qualquer
      // momento, sem precisar reiniciar a corrida.
      await requestMotionPermission();
      startRun();
    } catch (err) {
      showRunError(err.message);
    }
  });

  el.nextBtn.addEventListener("click", () => {
    skipToNext().catch((err) => showRunError(err.message));
  });
  el.prevBtn.addEventListener("click", () => {
    skipToPrevious().catch((err) => showRunError(err.message));
  });

  el.boostSaveBtn.addEventListener("click", () => {
    saveBoostTrack();
  });
  el.boostChangeBtn.addEventListener("click", forgetBoostTrack);
  el.boostBtn.addEventListener("click", () => {
    triggerBoost();
  });

  el.audiblePulseToggle.addEventListener("change", () => {
    audiblePulseEnabled = el.audiblePulseToggle.checked;
    if (audiblePulseEnabled) {
      ensureAudioContext() // precisa iniciar dentro do gesto do toque (iOS)
        .then((ctx) => {
          updateAudioStatus(ctx);
          if (currentEffectiveBpm) startAudiblePulse(currentEffectiveBpm);
        })
        .catch((err) => console.warn("Falha ao iniciar áudio do pulso:", err.message));
    } else {
      stopAudiblePulse();
      el.audioStatus.hidden = true;
    }
  });

  // O Wake Lock é liberado automaticamente pelo navegador quando a aba/app
  // fica em segundo plano (parte do spec) — reconquista sozinho ao voltar,
  // sem precisar que o usuário faça nada.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    // Some a dica/status do "Spotify sync" assim que o usuário volta pro
    // RunBeat — independe da corrida já ter começado (o sync acontece antes
    // do primeiro Play), por isso fica fora do `if (!runActive)` abaixo.
    if (warmupPending) {
      warmupPending = false;
      el.warmupHint.hidden = true;
      el.warmupStatus.hidden = true;
    }
    if (!runActive) return;
    if (!wakeLock) requestWakeLock();
    // O usuário voltou pro RunBeat depois de abrir o Spotify (ex. pelo link
    // "Spotify sync (clique aqui)") — tenta tocar de novo agora, sem
    // esperar o resto do intervalo de retry automático.
    if (noDeviceRetryPending) {
      clearTimeout(endOfTrackTimer);
      playNextAndSchedule().catch((err) => showRunError(err.message));
    }
  });
}

init();
