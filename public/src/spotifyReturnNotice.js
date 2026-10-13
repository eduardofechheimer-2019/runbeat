// Aviso "Aviso importante" antes da primeira ida ao Spotify pelo "Spotify
// sync": explica que o app vai abrir o Spotify e que, pra voltar, é só
// tocar na pílula "◀ RunBeat" que o iOS mostra no topo da tela (a volta em
// si é do sistema operacional — JS não controla isso, só orienta).
//
// Camada de interface ANTES da ação existente, sem tocar nela: um listener
// de captura no document intercepta o toque em #warmup-btn (e no link
// equivalente #open-spotify-link, mesmo rótulo) enquanto o aviso não foi
// confirmado. Em "Ok. Entendi." a confirmação é gravada e o MESMO elemento
// recebe .click() de forma síncrona, ainda dentro do gesto do usuário —
// assim o handler original de app.js (warmUpSpotify / o href do link) roda
// intacto e o iOS aceita abrir o Universal Link do Spotify, sem redirecionar
// automaticamente fora de um toque.
//
// Fechar sem confirmar (Esc ou toque fora do aviso) não grava nada, não abre
// o Spotify e o aviso volta na próxima tentativa.

const STORAGE_KEY = "runbeat_spotify_return_notice_seen";
const TRIGGERS = "#warmup-btn, #open-spotify-link";

const el = {
  modal: document.getElementById("spotify-notice"),
  dialog: document.querySelector(".spotify-notice-dialog"),
  ok: document.getElementById("spotify-notice-ok"),
};

let pendingTrigger = null;
let restoreFocusTo = null;
let replaying = false;

function noticeSeen() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markNoticeSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Armazenamento indisponível (ex.: modo privado restrito): o sync segue
    // normalmente; o aviso só voltaria a aparecer numa próxima vez.
  }
}

function openNotice(trigger) {
  pendingTrigger = trigger;
  restoreFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : trigger;
  el.modal.hidden = false;
  el.dialog.focus({ preventScroll: true });
}

function hideNotice() {
  el.modal.hidden = true;
}

function dismissNotice() {
  if (el.modal.hidden) return;
  hideNotice();
  pendingTrigger = null;
  const target = restoreFocusTo;
  restoreFocusTo = null;
  if (target && document.contains(target)) target.focus({ preventScroll: true });
}

function confirmNotice() {
  const trigger = pendingTrigger;
  pendingTrigger = null;
  restoreFocusTo = null;
  markNoticeSeen();
  hideNotice();
  if (!trigger || !document.contains(trigger)) return;
  replaying = true;
  try {
    trigger.click();
  } finally {
    replaying = false;
  }
}

function interceptSync(event) {
  if (replaying) return;
  const trigger = event.target instanceof Element ? event.target.closest(TRIGGERS) : null;
  if (!trigger || noticeSeen()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openNotice(trigger);
}

function onKeydown(event) {
  if (el.modal.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    dismissNotice();
    return;
  }
  // Foco preso no aviso: o único controle é o botão de confirmação.
  if (event.key === "Tab") {
    event.preventDefault();
    el.ok.focus({ preventScroll: true });
  }
}

document.addEventListener("click", interceptSync, true);
document.addEventListener("keydown", onKeydown);
el.ok.addEventListener("click", confirmNotice);
el.modal.addEventListener("click", (event) => {
  if (event.target === el.modal) dismissNotice();
});
