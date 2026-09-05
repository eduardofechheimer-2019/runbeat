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
import { CadenceTracker, requestMotionPermission } from "./cadence.js";
import { pickTrackForCadence } from "./matcher.js";

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
};

let bpmPool = [];
let tracker = null;
let displayTimer = null;
let bootstrapTimer = null;
let endOfTrackTimer = null;
let currentTrackId = null;
let activeMode = "auto"; // "auto" (cadência real) | "fixed" (ritmo fixo)
let fixedCadence = null;
let history = []; // faixas já tocadas nesta corrida, em ordem — pra "Anterior"
const playedIds = new Set();

function populatePaceOptions() {
  el.paceSelect.innerHTML = "";
  for (const opt of FIXED_PACE_OPTIONS) {
    const option = document.createElement("option");
    option.value = String(opt.spm);
    option.textContent = `${opt.label} (${opt.spm} bpm)`;
    el.paceSelect.appendChild(option);
  }
}

function getCadence() {
  return activeMode === "fixed" ? fixedCadence : (tracker?.getCurrentSpm() ?? 0);
}

function setStatus(text) {
  el.status.textContent = text;
}

function showRunError(message) {
  el.runError.textContent = message;
  el.runError.hidden = !message;
}

async function loadPlaylistOptions() {
  el.playlistSelect.innerHTML = "";
  const likedOpt = document.createElement("option");
  likedOpt.value = "__liked__";
  likedOpt.textContent = "Músicas Curtidas";
  el.playlistSelect.appendChild(likedOpt);

  const playlists = await api.getMyPlaylists();
  for (const p of playlists) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.trackCount})`;
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
    const refs = id === "__liked__" ? await api.getLikedSongRefs() : await api.getPlaylistTrackRefs(id);
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

  const playlists = await api.getMyPlaylists();
  const sources = [{ id: "__liked__", name: "Músicas Curtidas" }, ...playlists];

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
  const cadence = getCadence();
  el.cadenceValue.textContent = cadence > 0 ? `${cadence} passos/min` : "medindo...";
}

async function playSpecificTrack(track) {
  await api.playTrackUri(track.uri);
  currentTrackId = track.id;
  playedIds.add(track.id);
  el.trackValue.textContent = `${track.name} — ${track.artist} (${Math.round(track.tempo)} BPM)`;
  showRunError("");
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
  const cadence = getCadence();
  const track = pickTrackForCadence(bpmPool, cadence, playedIds);
  if (!track) return;

  try {
    await playSpecificTrack(track);
    history.push(track);
    scheduleEndOfTrack(track);
  } catch (err) {
    showRunError(err.message);
    // Não trava o loop — tenta de novo em breve (ex. dispositivo Spotify
    // pode ter ficado inativo temporariamente).
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
  try {
    await playSpecificTrack(previousTrack);
    scheduleEndOfTrack(previousTrack);
  } catch (err) {
    showRunError(err.message);
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
  fixedCadence = activeMode === "fixed" ? Number(el.paceSelect.value) : null;

  if (activeMode === "auto") {
    tracker = new CadenceTracker();
    tracker.start();
  }
  currentTrackId = null;
  playedIds.clear();
  history = [];
  el.startBtn.hidden = true;
  el.stopBtn.hidden = false;
  el.playbackControls.hidden = false;
  showRunError("");
  displayTimer = setInterval(updateCadenceDisplay, CADENCE_DISPLAY_INTERVAL_MS);
  waitForFirstCadence();
}

function stopRun() {
  clearInterval(displayTimer);
  clearInterval(bootstrapTimer);
  clearTimeout(endOfTrackTimer);
  tracker?.stop();
  tracker = null;
  fixedCadence = null;
  el.startBtn.hidden = false;
  el.stopBtn.hidden = true;
  el.playbackControls.hidden = true;
  el.cadenceValue.textContent = "—";
  el.trackValue.textContent = "—";
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
      if (el.modeSelect.value === "auto") {
        await requestMotionPermission();
      }
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
}

init();
