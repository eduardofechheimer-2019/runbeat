import {
  STORAGE_KEYS,
  END_OF_TRACK_LEAD_MS,
  FALLBACK_TRACK_DURATION_MS,
  CADENCE_DISPLAY_INTERVAL_MS,
  RETRY_AFTER_ERROR_MS,
  FIXED_PACE_OPTIONS,
} from "./config.js";
import * as auth from "./spotifyAuth.js";
import * as api from "./spotifyApi.js";
import { buildBpmPool } from "./bpmSource.js";
import { loadCatalogRefs } from "./catalogSource.js";
import { CadenceTracker, requestMotionPermission } from "./cadence.js";
import { pickTrackForCadence, pickTrackForRange } from "./matcher.js";

const el = {
  status: document.getElementById("status"),
  connectBtn: document.getElementById("connect-btn"),
  disconnectBtn: document.getElementById("disconnect-btn"),
  setupSection: document.getElementById("setup-section"),
  playlistSelect: document.getElementById("playlist-select"),
  buildPoolBtn: document.getElementById("build-pool-btn"),
  buildAllBtn: document.getElementById("build-pool-all-btn"),
  poolProgress: document.getElementById("pool-progress"),
  runSection: document.getElementById("run-section"),
  modeSelect: document.getElementById("mode-select"),
  paceGroup: document.getElementById("pace-group"),
  paceSelect: document.getElementById("pace-select"),
  startBtn: document.getElementById("start-btn"),
  stopBtn: document.getElementById("stop-btn"),
  playbackControls: document.getElementById("playback-controls"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  cadenceValue: document.getElementById("cadence-value"),
  trackValue: document.getElementById("track-value"),
  runError: document.getElementById("run-error"),
  openSpotifyLink: document.getElementById("open-spotify-link"),
  beatVisual: document.getElementById("beat-visual"),
  beatBpmValue: document.getElementById("beat-bpm-value"),
  audiblePulseToggle: document.getElementById("audible-pulse-toggle"),
};

let bpmPool = [];
let tracker = null;
let displayTimer = null;
let bootstrapTimer = null;
let endOfTrackTimer = null;
let currentTrackId = null;
let activeMode = "auto"; // "auto" (cadência real) | "fixed" (faixa de BPM fixa)
let fixedRange = null; // {min, max} quando activeMode === "fixed"
let runActive = false; // true entre "Iniciar corrida" e "Parar"
let playRequestSeq = 0; // invalida trocas de faixa que ficaram pra trás no tempo
let history = []; // faixas já tocadas nesta corrida, em ordem — pra "Anterior"
const playedIds = new Set();

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

// Aplica imediatamente uma troca de modo/velocidade feita em pleno andamento
// da corrida — antes, essas trocas só valiam na próxima vez que "Iniciar
// corrida" fosse clicado, o que fazia o app ignorar qualquer mudança de
// modo/ritmo escolhida depois de já ter começado.
function applyLiveModeChange() {
  if (!runActive) return;
  activeMode = el.modeSelect.value;
  fixedRange = activeMode === "fixed" ? currentFixedRange() : null;
  clearInterval(bootstrapTimer);
  clearTimeout(endOfTrackTimer);
  playNextAndSchedule().catch((err) => showRunError(err.message));
}

function startBeatPulse(effectiveBpm) {
  if (!effectiveBpm || effectiveBpm <= 0) return;
  currentEffectiveBpm = effectiveBpm;
  el.beatBpmValue.textContent = `${Math.round(effectiveBpm)} /min`;
  el.beatVisual.hidden = false;
  startAudiblePulse(effectiveBpm);
}

function stopBeatPulse() {
  el.beatVisual.hidden = true;
  currentEffectiveBpm = null;
  stopAudiblePulse();
}

// --- Pulso sonoro ---
// Um clique curto a cada batida, tocado no navegador (não no Spotify). Não
// temos como saber a fase real do áudio da faixa — é um metrônomo
// independente, não uma sobreposição travada no áudio. Também não é
// garantido que o iOS misture esse som com o Spotify em vez de abafar um
// dos dois — daí ser opcional.
function ensureAudioContext() {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
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

function startAudiblePulse(effectiveBpm) {
  if (!audiblePulseEnabled || !effectiveBpm) return;
  const ctx = ensureAudioContext();
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

// Mostra um link "spotify:track:<id>" — abrir esse link no celular manda o
// app Spotify começar a tocar essa faixa sozinho (sem precisar procurar nada
// lá dentro), desde que nada mais esteja tocando ainda. É o que resolve o
// caso "nenhum dispositivo ativo" com um toque só.
function showNoDeviceLink(track) {
  el.openSpotifyLink.href = `spotify:track:${track.id}`;
  el.openSpotifyLink.hidden = false;
}

function hideNoDeviceLink() {
  el.openSpotifyLink.hidden = true;
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
  const likedOpt = document.createElement("option");
  likedOpt.value = "__liked__";
  likedOpt.textContent = "Músicas Curtidas";
  el.playlistSelect.appendChild(likedOpt);

  const catalogOpt = document.createElement("option");
  catalogOpt.value = "__catalog__";
  catalogOpt.textContent = "Catálogo de referência (~89 mil músicas por BPM)";
  el.playlistSelect.appendChild(catalogOpt);

  const myUserId = await api.getCurrentUserId();
  const playlists = await api.getMyPlaylists();
  for (const p of playlists) {
    const opt = document.createElement("option");
    opt.value = p.id;
    const ownerTag = p.ownerId && p.ownerId !== myUserId ? ` — de ${p.ownerName}` : "";
    opt.textContent = `${p.name} (${p.trackCount})${ownerTag}`;
    el.playlistSelect.appendChild(opt);
  }

  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.sourcePlaylist) || "[]");
  } catch {
    saved = [];
  }
  for (const opt of el.playlistSelect.options) {
    opt.selected = saved.includes(opt.value);
  }
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
async function fetchSourceRefs(id, label) {
  try {
    let refs;
    if (id === "__catalog__") refs = await loadCatalogRefs();
    else if (id === "__liked__") refs = await api.getLikedSongRefs();
    else refs = await api.getPlaylistTrackRefs(id);
    return { refs, failure: null };
  } catch (err) {
    console.warn(`Falha ao buscar faixas de "${label}":`, err.message);
    return { refs: [], failure: { label, message: err.message } };
  }
}

// Resolve o BPM de `refs` e atualiza a tela — usado tanto pra análise das
// playlists selecionadas quanto pra "toda a biblioteca".
async function resolvePool(refs, failures = []) {
  const { tracks, diagnostic } = await buildBpmPool(refs, (done, total) => {
    el.poolProgress.textContent = `Resolvendo BPM: ${done}/${total}...`;
  });
  bpmPool = tracks;

  let text = `Pronto: ${bpmPool.length} de ${refs.length} faixas com BPM encontrado.`;
  if (failures.length > 0) {
    const names = failures.map((f) => f.label).join(", ");
    text += ` (${failures.length} fonte(s) não puderam ser lidas: ${names})`;
    text += ` [motivo da 1ª: ${failures[0].message}]`;
  }
  el.poolProgress.textContent = text;
  el.runSection.hidden = bpmPool.length === 0;
  if (bpmPool.length === 0) {
    el.poolProgress.textContent += " Nenhuma faixa teve BPM resolvido.";
    if (diagnostic) {
      el.poolProgress.textContent += ` [Diagnóstico: ${diagnostic}]`;
    }
  }
}

async function buildPool() {
  const selectedOptions = Array.from(el.playlistSelect.selectedOptions);
  if (selectedOptions.length === 0) {
    el.poolProgress.hidden = false;
    el.poolProgress.textContent = "Escolha ao menos uma playlist.";
    return;
  }
  localStorage.setItem(STORAGE_KEYS.sourcePlaylist, JSON.stringify(selectedOptions.map((o) => o.value)));

  el.buildPoolBtn.disabled = true;
  el.buildAllBtn.disabled = true;
  el.poolProgress.hidden = false;
  el.poolProgress.textContent = "Buscando faixas...";

  const results = await Promise.all(
    selectedOptions.map((opt) => fetchSourceRefs(opt.value, opt.textContent))
  );
  const failures = results.map((r) => r.failure).filter(Boolean);
  await resolvePool(dedupeRefs(results.map((r) => r.refs)), failures);

  el.buildPoolBtn.disabled = false;
  el.buildAllBtn.disabled = false;
}

// Junta Músicas Curtidas + todas as playlists da conta, sem precisar
// escolher uma por uma — o "banco de BPM" cresce conforme mais faixas vão
// sendo analisadas (o cache de BPM em bpmSource.js já persiste entre usos).
async function buildPoolFromLibrary() {
  el.buildPoolBtn.disabled = true;
  el.buildAllBtn.disabled = true;
  el.poolProgress.hidden = false;
  el.poolProgress.textContent = "Buscando playlists da biblioteca...";

  const myUserId = await api.getCurrentUserId();
  const playlists = await api.getMyPlaylists();
  const sources = [
    { id: "__liked__", name: "Músicas Curtidas" },
    ...playlists.map((p) => ({
      id: p.id,
      name: p.ownerId && p.ownerId !== myUserId ? `${p.name} (de ${p.ownerName})` : p.name,
    })),
  ];

  const refLists = [];
  const failures = [];
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    el.poolProgress.textContent = `Buscando faixas: fonte ${i + 1}/${sources.length} (${source.name})...`;
    const { refs, failure } = await fetchSourceRefs(source.id, source.name);
    refLists.push(refs);
    if (failure) failures.push(failure);
  }

  await resolvePool(dedupeRefs(refLists), failures);

  el.buildPoolBtn.disabled = false;
  el.buildAllBtn.disabled = false;
}

function updateCadenceDisplay() {
  if (activeMode === "fixed") {
    el.cadenceValue.textContent = fixedRange
      ? `${fixedRange.min}–${fixedRange.max} passos/min (alvo)`
      : "—";
    return;
  }
  const cadence = tracker?.getCurrentSpm() ?? 0;
  el.cadenceValue.textContent = cadence > 0 ? `${cadence} passos/min` : "medindo...";
}

// `requestId` evita que uma troca de faixa lenta (ex. chamada à API do
// Spotify demorando) sobrescreva na tela o resultado de uma troca mais
// recente — se outra chamada já começou depois desta, esta é descartada
// silenciosamente ao terminar. Devolve false quando isso acontece.
async function playSpecificTrack(track, requestId) {
  await api.playTrackUri(track.uri);
  if (requestId !== playRequestSeq) return false;
  currentTrackId = track.id;
  el.trackValue.textContent = `${track.name} — ${track.artist} (${Math.round(track.tempo)} BPM)`;
  showRunError("");
  hideNoDeviceLink();
  startBeatPulse(track.effectiveBpm);
  return true;
}

// Agenda a troca seguinte pra pouco antes do fim da faixa — sem nunca
// precisar perguntar ao Spotify "quanto falta", já que sabemos a duração da
// faixa que mandamos tocar.
function scheduleEndOfTrack(track) {
  clearTimeout(endOfTrackTimer);
  const durationMs = track.durationMs || FALLBACK_TRACK_DURATION_MS;
  const delay = Math.max(durationMs - END_OF_TRACK_LEAD_MS, 1000);
  endOfTrackTimer = setTimeout(playNextAndSchedule, delay);
}

// Escolhe e toca a próxima faixa pra cadência atual (usado tanto pela troca
// automática de fim de faixa quanto pelo botão "Próxima").
async function playNextAndSchedule() {
  const requestId = ++playRequestSeq;
  const track =
    activeMode === "fixed"
      ? pickTrackForRange(bpmPool, fixedRange, playedIds)
      : pickTrackForCadence(bpmPool, tracker?.getCurrentSpm() ?? 0, playedIds);
  if (!track) return;

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
    if (err.code === "NO_ACTIVE_DEVICE") showNoDeviceLink(track);
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

// Modo automático: só começa a tocar quando tiver uma primeira leitura
// confiável de cadência (no início da corrida o acelerômetro ainda não tem
// dado suficiente na janela deslizante). Modo fixo: começa na hora, o valor
// já é conhecido de antemão.
function waitForFirstCadence() {
  if (activeMode === "fixed") {
    playNextAndSchedule();
    return;
  }
  bootstrapTimer = setInterval(() => {
    if (tracker.getCurrentSpm() > 0) {
      clearInterval(bootstrapTimer);
      playNextAndSchedule();
    }
  }, CADENCE_DISPLAY_INTERVAL_MS);
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
  el.startBtn.hidden = true;
  el.stopBtn.hidden = false;
  el.playbackControls.hidden = false;
  showRunError("");
  hideNoDeviceLink();
  requestWakeLock();
  displayTimer = setInterval(updateCadenceDisplay, CADENCE_DISPLAY_INTERVAL_MS);
  waitForFirstCadence();
}

function stopRun() {
  runActive = false;
  clearInterval(displayTimer);
  clearInterval(bootstrapTimer);
  clearTimeout(endOfTrackTimer);
  tracker?.stop();
  tracker = null;
  fixedRange = null;
  releaseWakeLock();
  el.startBtn.hidden = false;
  el.stopBtn.hidden = true;
  el.playbackControls.hidden = true;
  el.cadenceValue.textContent = "—";
  el.trackValue.textContent = "—";
  hideNoDeviceLink();
  stopBeatPulse();
}

async function refreshAuthedUi() {
  el.connectBtn.hidden = true;
  el.disconnectBtn.hidden = false;
  el.setupSection.hidden = false;
  setStatus("Conectado ao Spotify.");
  await loadPlaylistOptions();
}

async function init() {
  populatePaceOptions();
  el.modeSelect.addEventListener("change", () => {
    el.paceGroup.hidden = el.modeSelect.value !== "fixed";
    applyLiveModeChange();
  });
  el.paceSelect.addEventListener("change", () => {
    if (el.modeSelect.value === "fixed") applyLiveModeChange();
  });

  try {
    const justLoggedIn = await auth.handleRedirectCallback();
    if (justLoggedIn || auth.isLoggedIn()) {
      await refreshAuthedUi();
    } else {
      setStatus("Não conectado.");
    }
  } catch (err) {
    setStatus(`Erro no login: ${err.message}`);
  }

  el.connectBtn.addEventListener("click", () => {
    auth.startLogin().catch((err) => setStatus(err.message));
  });

  el.disconnectBtn.addEventListener("click", () => {
    auth.logout();
    window.location.reload();
  });

  el.buildPoolBtn.addEventListener("click", () => {
    buildPool().catch((err) => {
      el.poolProgress.textContent = `Erro: ${err.message}`;
    });
  });

  el.buildAllBtn.addEventListener("click", () => {
    buildPoolFromLibrary().catch((err) => {
      el.poolProgress.textContent = `Erro: ${err.message}`;
    });
  });

  el.startBtn.addEventListener("click", async () => {
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

  el.stopBtn.addEventListener("click", stopRun);

  el.nextBtn.addEventListener("click", () => {
    skipToNext().catch((err) => showRunError(err.message));
  });
  el.prevBtn.addEventListener("click", () => {
    skipToPrevious().catch((err) => showRunError(err.message));
  });

  el.audiblePulseToggle.addEventListener("change", () => {
    audiblePulseEnabled = el.audiblePulseToggle.checked;
    if (audiblePulseEnabled) {
      ensureAudioContext(); // precisa acontecer dentro do gesto do toque (iOS)
      if (currentEffectiveBpm) startAudiblePulse(currentEffectiveBpm);
    } else {
      stopAudiblePulse();
    }
  });

  // O Wake Lock é liberado automaticamente pelo navegador quando a aba/app
  // fica em segundo plano (parte do spec) — reconquista sozinho ao voltar,
  // sem precisar que o usuário faça nada.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && runActive && !wakeLock) {
      requestWakeLock();
    }
  });
}

init();
