import {
  STORAGE_KEYS,
  END_OF_TRACK_LEAD_MS,
  FALLBACK_TRACK_DURATION_MS,
  CADENCE_DISPLAY_INTERVAL_MS,
  RETRY_AFTER_ERROR_MS,
} from "./config.js";
import * as auth from "./spotifyAuth.js";
import * as api from "./spotifyApi.js";
import { buildBpmPool } from "./bpmSource.js";
import { CadenceTracker, requestMotionPermission } from "./cadence.js";
import { pickTrackForCadence } from "./matcher.js";

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
let displayTimer = null;
let bootstrapTimer = null;
let endOfTrackTimer = null;
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

function updateCadenceDisplay() {
  const cadence = tracker.getCurrentSpm();
  el.cadenceValue.textContent = cadence > 0 ? `${cadence} passos/min` : "medindo...";
}

// Escolhe e toca a próxima faixa pra cadência atual, e agenda a troca
// seguinte pra pouco antes do fim dela — sem nunca precisar perguntar ao
// Spotify "quanto falta", já que sabemos a duração da faixa que mandamos
// tocar.
async function playNextAndSchedule() {
  const cadence = tracker.getCurrentSpm();
  const track = pickTrackForCadence(bpmPool, cadence, playedIds);
  if (!track) return;

  try {
    await api.playTrackUri(track.uri);
    currentTrackId = track.id;
    playedIds.add(track.id);
    el.trackValue.textContent = `${track.name} — ${track.artist} (${Math.round(track.tempo)} BPM)`;
    showRunError("");

    const durationMs = track.durationMs || FALLBACK_TRACK_DURATION_MS;
    const delay = Math.max(durationMs - END_OF_TRACK_LEAD_MS, 1000);
    endOfTrackTimer = setTimeout(playNextAndSchedule, delay);
  } catch (err) {
    showRunError(err.message);
    // Não trava o loop — tenta de novo em breve (ex. dispositivo Spotify
    // pode ter ficado inativo temporariamente).
    endOfTrackTimer = setTimeout(playNextAndSchedule, RETRY_AFTER_ERROR_MS);
  }
}

// Só começa a tocar quando tiver uma primeira leitura confiável de
// cadência — no início da corrida o acelerômetro ainda não tem dado
// suficiente na janela deslizante.
function waitForFirstCadence() {
  bootstrapTimer = setInterval(() => {
    if (tracker.getCurrentSpm() > 0) {
      clearInterval(bootstrapTimer);
      playNextAndSchedule();
    }
  }, CADENCE_DISPLAY_INTERVAL_MS);
}

function startRun() {
  tracker = new CadenceTracker();
  tracker.start();
  currentTrackId = null;
  playedIds.clear();
  el.startBtn.hidden = true;
  el.stopBtn.hidden = false;
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
