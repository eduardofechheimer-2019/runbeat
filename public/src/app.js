import { STORAGE_KEYS, REMATCH_INTERVAL_MS } from "./config.js";
import * as auth from "./spotifyAuth.js";
import * as api from "./spotifyApi.js";
import { buildBpmPool } from "./bpmSource.js";
import { CadenceTracker, requestMotionPermission } from "./cadence.js";
import { pickTrackForCadence, shouldRematch } from "./matcher.js";

const el = {
  status: document.getElementById("status"),
  connectBtn: document.getElementById("connect-btn"),
  setupSection: document.getElementById("setup-section"),
  playlistSelect: document.getElementById("playlist-select"),
  buildPoolBtn: document.getElementById("build-pool-btn"),
  poolProgress: document.getElementById("pool-progress"),
  runSection: document.getElementById("run-section"),
  startBtn: document.getElementById("start-btn"),
  stopBtn: document.getElementById("stop-btn"),
  cadenceValue: document.getElementById("cadence-value"),
  trackValue: document.getElementById("track-value"),
  runError: document.getElementById("run-error"),
};

let bpmPool = [];
let tracker = null;
let rematchTimer = null;
let lastMatchedCadence = null;
let currentTrackId = null;
const playedIds = new Set();

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

  const saved = localStorage.getItem(STORAGE_KEYS.sourcePlaylist);
  if (saved) el.playlistSelect.value = saved;
}

async function buildPool() {
  const playlistId = el.playlistSelect.value;
  localStorage.setItem(STORAGE_KEYS.sourcePlaylist, playlistId);

  el.buildPoolBtn.disabled = true;
  el.poolProgress.hidden = false;
  el.poolProgress.textContent = "Buscando faixas...";

  const refs =
    playlistId === "__liked__"
      ? await api.getLikedSongRefs()
      : await api.getPlaylistTrackRefs(playlistId);

  const { tracks, diagnostic } = await buildBpmPool(refs, (done, total) => {
    el.poolProgress.textContent = `Resolvendo BPM: ${done}/${total}...`;
  });
  bpmPool = tracks;

  el.poolProgress.textContent = `Pronto: ${bpmPool.length} de ${refs.length} faixas com BPM encontrado.`;
  el.buildPoolBtn.disabled = false;
  el.runSection.hidden = bpmPool.length === 0;
  if (bpmPool.length === 0) {
    el.poolProgress.textContent += " Nenhuma faixa teve BPM resolvido.";
    if (diagnostic) {
      el.poolProgress.textContent += ` [Diagnóstico: ${diagnostic}]`;
    }
  }
}

async function rematchLoop() {
  const cadence = tracker.getCurrentSpm();
  el.cadenceValue.textContent = cadence > 0 ? `${cadence} passos/min` : "medindo...";

  if (cadence === 0) return; // ainda sem leitura confiável
  if (!shouldRematch(lastMatchedCadence, cadence)) return;

  const track = pickTrackForCadence(bpmPool, cadence, playedIds);
  if (!track || track.id === currentTrackId) return;

  try {
    await api.playTrackUri(track.uri);
    currentTrackId = track.id;
    playedIds.add(track.id);
    lastMatchedCadence = cadence;
    el.trackValue.textContent = `${track.name} — ${track.artist} (${Math.round(track.tempo)} BPM)`;
    showRunError("");
  } catch (err) {
    showRunError(err.message);
  }
}

function startRun() {
  tracker = new CadenceTracker();
  tracker.start();
  lastMatchedCadence = null;
  currentTrackId = null;
  playedIds.clear();
  rematchTimer = setInterval(rematchLoop, REMATCH_INTERVAL_MS);
  el.startBtn.hidden = true;
  el.stopBtn.hidden = false;
  showRunError("");
}

function stopRun() {
  clearInterval(rematchTimer);
  tracker?.stop();
  tracker = null;
  el.startBtn.hidden = false;
  el.stopBtn.hidden = true;
  el.cadenceValue.textContent = "—";
  el.trackValue.textContent = "—";
}

async function refreshAuthedUi() {
  el.connectBtn.hidden = true;
  el.setupSection.hidden = false;
  setStatus("Conectado ao Spotify.");
  await loadPlaylistOptions();
}

async function init() {
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

  el.buildPoolBtn.addEventListener("click", () => {
    buildPool().catch((err) => {
      el.poolProgress.textContent = `Erro: ${err.message}`;
    });
  });

  el.startBtn.addEventListener("click", async () => {
    try {
      await requestMotionPermission();
      startRun();
    } catch (err) {
      showRunError(err.message);
    }
  });

  el.stopBtn.addEventListener("click", stopRun);
}

init();
