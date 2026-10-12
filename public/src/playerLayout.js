// Layout contínuo do player (#card-run): a mesma tela do começo ao fim,
// só mudando o que está em destaque. Três estados visuais:
//
//   "sync"    — esperando o "Spotify sync" (único destaque da tela);
//   "ready"   — sync disparado: o Play ocupa o lugar dele e vira o destaque;
//   "running" — corrida começou: o player "acende" (logo, etapas, SPM/BPM).
//
// Este módulo NÃO tem lógica de reprodução própria: ele só lê sinais que o
// app.js já produz e expõe o estado como atributo pro CSS —
//   - running: startRun() esconde #warmup-row (e só ele faz isso);
//   - ready:   warmUpSpotify() põe .is-attention no Play no momento do toque
//              (não depende do visibilitychange da volta do Spotify);
//   - sync:    nenhum dos dois.
// Antes da corrida o Play fica fora da tela, então há um caminho
// alternativo discreto pra ninguém ficar travado: "Pular sincronização"
// (mostra o Play, que funciona com ou sem sync, como sempre funcionou) e,
// depois do sync, "Sincronizar novamente" (repete o toque no botão
// original, que segue passando pelo aviso e pelo warmUpSpotify() intactos).

const el = {
  card: document.getElementById("card-run"),
  warmupRow: document.getElementById("warmup-row"),
  warmupBtn: document.getElementById("warmup-btn"),
  playBtn: document.getElementById("play-pause-btn"),
  skipBtn: document.getElementById("player-skip-sync"),
  resyncBtn: document.getElementById("player-resync"),
  msgs: document.querySelector(".player-msgs"),
  runError: document.getElementById("run-error"),
  noDeviceLink: document.getElementById("open-spotify-link"),
  values: [document.getElementById("cadence-live-value"), document.getElementById("beat-bpm-value")],
};

let syncSkipped = false;

function currentState() {
  if (el.warmupRow.hidden) return "running";
  if (syncSkipped || el.playBtn.classList.contains("is-attention")) return "ready";
  return "sync";
}

// O estado também vai pro <html> (cabeçalho e etapas condensadas ficam fora
// do cartão), mas só enquanto o player está na tela — ao reabrir uma etapa
// anterior o cabeçalho volta ao normal.
function render() {
  const state = currentState();
  el.card.dataset.playerState = state;
  if (el.card.hidden) delete document.documentElement.dataset.playerState;
  else document.documentElement.dataset.playerState = state;
}

// SPM/BPM sem medição válida ("—", "medindo...") aparecem como "000" (ver
// CSS); o texto real continua sendo escrito pelo app.js como sempre.
function markPlaceholders() {
  for (const value of el.values) {
    value.toggleAttribute("data-placeholder", !/^\d+$/.test(value.textContent.trim()));
  }
}

new MutationObserver(render).observe(el.card, { attributes: true, attributeFilter: ["hidden"] });
new MutationObserver(render).observe(el.warmupRow, { attributes: true, attributeFilter: ["hidden"] });
new MutationObserver(render).observe(el.playBtn, { attributes: true, attributeFilter: ["class"] });
const valuesObserver = new MutationObserver(markPlaceholders);
for (const value of el.values) valuesObserver.observe(value, { childList: true, characterData: true, subtree: true });

el.skipBtn.addEventListener("click", () => {
  syncSkipped = true;
  render();
  el.playBtn.focus({ preventScroll: true });
});
el.resyncBtn.addEventListener("click", () => el.warmupBtn.click());

// As mensagens aparecem por cima da Faixa Bônus (ver .player-msgs no CSS).
// Um toque fecha a mensagem e libera o campo — só esconde o aviso na tela;
// o app.js volta a mostrá-lo se o problema acontecer de novo. O link "sem
// dispositivo" é uma ação (abre o Spotify) e não fecha pelo toque nele; ele
// sai junto quando o erro que o acompanha é fechado.
el.msgs.addEventListener("click", (event) => {
  if (event.target.closest("#open-spotify-link")) return;
  const box = event.target.closest(".player-msgs > *");
  if (!box) return;
  box.hidden = true;
  if (box === el.runError) el.noDeviceLink.hidden = true;
});

render();
markPlaceholders();
