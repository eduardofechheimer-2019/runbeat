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
// Uma ação por vez: antes do sync só existe o "Spotify sync" (o Play aparece
// assim que ele é tocado, mesmo que a abertura do Spotify falhe — o toque
// basta). Depois do sync, um link discreto "Sincronizar novamente" repete o
// toque no botão original, que segue passando pelo aviso e pelo
// warmUpSpotify() intactos. Durante a corrida, falhas de reprodução seguem
// o caminho que o app.js já tem (erro + link "Spotify sync" pra abrir o app).

const el = {
  card: document.getElementById("card-run"),
  warmupRow: document.getElementById("warmup-row"),
  warmupBtn: document.getElementById("warmup-btn"),
  playBtn: document.getElementById("play-pause-btn"),
  resyncBtn: document.getElementById("player-resync"),
  msgs: document.querySelector(".player-msgs"),
  runError: document.getElementById("run-error"),
  noDeviceLink: document.getElementById("open-spotify-link"),
  values: [document.getElementById("cadence-live-value"), document.getElementById("beat-bpm-value")],
};

function currentState() {
  if (el.warmupRow.hidden) return "running";
  if (el.playBtn.classList.contains("is-attention")) return "ready";
  return "sync";
}

// O estado só existe enquanto o player (#card-run) está na tela — durante as
// três etapas de configuração o cartão fica `hidden` e nenhum estilo do
// player pode valer. Por isso o atributo sai do cartão E do <html> (cabeçalho
// e etapas condensadas ficam fora do cartão) sempre que ele é escondido, e
// só volta quando o app.js o revela (depois do "Continuar" da etapa 3, ou ao
// voltar pra ele depois de reabrir uma etapa).
function render() {
  if (el.card.hidden) {
    delete el.card.dataset.playerState;
    delete document.documentElement.dataset.playerState;
    return;
  }
  const state = currentState();
  el.card.dataset.playerState = state;
  document.documentElement.dataset.playerState = state;
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
