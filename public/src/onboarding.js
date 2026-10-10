import { STORAGE_KEYS } from "./config.js";
import { t, onLanguageChange } from "./i18n.js";

const TOTAL_STEPS = 6;
let currentStep = 1;

// Transição entre etapas: só o conteúdo da moldura desliza (a etapa atual
// sai por um lado enquanto a próxima entra pelo outro); título "Tutorial",
// contador, dots e botões ficam parados. Enquanto a transição roda, novos
// pedidos de navegação são ignorados — evita pular etapa com toque duplo
// ou swipe + toque. Duração casada com --ob-slide-duration no CSS; o
// timeout é só uma rede de segurança caso animationend não dispare.
const SLIDE_MS = 300;
let transition = null;

// Swipe: deslocamento horizontal mínimo (px ou fração da largura, o que for
// maior) e quanto o eixo X precisa dominar o Y pra contar como troca de
// etapa — arrasto curto, diagonal ou vertical (scroll) não troca nada.
const SWIPE_MIN_PX = 56;
const SWIPE_MIN_WIDTH_RATIO = 0.18;
const SWIPE_AXIS_RATIO = 1.5;

const ANIM_CLASSES = ["ob-enter-right", "ob-enter-left", "ob-leave-left", "ob-leave-right"];

const el = {
  overlay: document.getElementById("onboarding-overlay"),
  stepsArea: document.querySelector(".onboarding-steps"),
  steps: document.querySelectorAll(".onboarding-step"),
  dots: document.querySelectorAll(".onboarding-dot"),
  progress: document.getElementById("onboarding-progress"),
  nextBtn: document.getElementById("onboarding-next"),
  skipBtn: document.getElementById("onboarding-skip"),
  helpBtn: document.getElementById("help-btn"),
  settingsModal: document.getElementById("settings-modal"),
  settingsClose: document.getElementById("settings-modal-close"),
  replayTutorialBtn: document.getElementById("settings-replay-tutorial"),
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const stepEl = (n) => el.overlay.querySelector(`.onboarding-step[data-step="${n}"]`);

// Rótulo do CTA principal: "Próximo" nas etapas 1–5 e "Começar" só na
// última — único lugar que precisa saber em que etapa está.
function ctaLabelFor(step) {
  return step === TOTAL_STEPS ? t("onboardingFinish") : t("onboardingNext");
}

function renderChrome(n) {
  for (const dot of el.dots) {
    dot.classList.toggle("active", Number(dot.dataset.dot) === n);
  }
  el.progress.textContent = `${n} / ${TOTAL_STEPS}`;
  el.nextBtn.textContent = ctaLabelFor(n);
}

function clearAnimation(step) {
  step.classList.remove(...ANIM_CLASSES);
}

function finishTransition() {
  if (!transition) return;
  const { leaving, entering, timer } = transition;
  clearTimeout(timer);
  if (leaving) {
    leaving.hidden = true;
    clearAnimation(leaving);
  }
  clearAnimation(entering);
  transition = null;
}

// Mostra a etapa n. "direction" decide de que lado ela entra: "forward"
// (pela direita, a atual sai pela esquerda) ou "back" (o contrário).
// "fromNothing" = abertura do tutorial: só a etapa 1 entra, nada sai.
function showStep(n, direction, { fromNothing = false } = {}) {
  const entering = stepEl(n);
  const leaving = fromNothing ? null : stepEl(currentStep);
  currentStep = n;
  renderChrome(n);

  for (const step of el.steps) {
    if (step !== entering && step !== leaving) {
      step.hidden = true;
      clearAnimation(step);
    }
  }
  entering.hidden = false;

  if (reducedMotion.matches) {
    if (leaving && leaving !== entering) leaving.hidden = true;
    return;
  }

  const forward = direction !== "back";
  entering.classList.add(forward ? "ob-enter-right" : "ob-enter-left");
  if (leaving && leaving !== entering) {
    leaving.classList.add(forward ? "ob-leave-left" : "ob-leave-right");
  }
  transition = {
    leaving: leaving !== entering ? leaving : null,
    entering,
    timer: setTimeout(finishTransition, SLIDE_MS + 80),
  };
  entering.addEventListener("animationend", finishTransition, { once: true });
}

function goToStep(n) {
  if (transition) return;
  if (n < 1 || n > TOTAL_STEPS || n === currentStep) return;
  showStep(n, n < currentStep ? "back" : "forward");
}

function showOnboarding() {
  finishTransition();
  el.overlay.hidden = false;
  showStep(1, "forward", { fromNothing: true });
}

function completeOnboarding() {
  finishTransition();
  localStorage.setItem(STORAGE_KEYS.onboardingSeen, "1");
  el.overlay.hidden = true;
}

// Swipe horizontal entre etapas (Pointer Events). A área das etapas tem
// touch-action: pan-y, então o navegador continua dono do scroll vertical
// (um arrasto vertical vira pointercancel e é descartado) e só o gesto
// horizontal chega inteiro aqui. Gestos que começam num botão são
// ignorados; nas pontas (etapa 1 pra trás, etapa 6 pra frente) o gesto não
// faz nada — nunca conclui o onboarding sozinho.
function initSwipe() {
  let start = null;

  const reset = () => {
    start = null;
  };

  el.stepsArea.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button > 0) return;
    if (event.target.closest("button, a, input, select, textarea")) return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });

  el.stepsArea.addEventListener("pointerup", (event) => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    reset();

    const minDistance = Math.max(SWIPE_MIN_PX, el.stepsArea.clientWidth * SWIPE_MIN_WIDTH_RATIO);
    if (Math.abs(dx) < minDistance) return;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return;

    if (dx < 0) goToStep(currentStep + 1);
    else goToStep(currentStep - 1);
  });

  el.stepsArea.addEventListener("pointercancel", reset);
  el.stepsArea.addEventListener("lostpointercapture", reset);
}

// Configurações: a engrenagem abre um painel próprio (não o tutorial
// direto); o tutorial só reabre pela opção explícita "Ver tutorial
// novamente", na etapa 1, sem mexer em runbeat_onboarding_seen.
function openSettings() {
  el.settingsModal.hidden = false;
  el.replayTutorialBtn.focus({ preventScroll: true });
}

function closeSettings() {
  el.settingsModal.hidden = true;
}

function initSettings() {
  el.helpBtn.addEventListener("click", openSettings);
  el.settingsClose.addEventListener("click", () => {
    closeSettings();
    el.helpBtn.focus({ preventScroll: true });
  });
  el.settingsModal.addEventListener("click", (event) => {
    if (event.target === el.settingsModal) closeSettings();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el.settingsModal.hidden) closeSettings();
  });
  el.replayTutorialBtn.addEventListener("click", () => {
    closeSettings();
    showOnboarding();
  });
}

export function initOnboarding() {
  el.nextBtn.addEventListener("click", () => {
    if (transition) return;
    if (currentStep >= TOTAL_STEPS) completeOnboarding();
    else goToStep(currentStep + 1);
  });
  el.skipBtn.addEventListener("click", completeOnboarding);
  initSwipe();
  initSettings();

  if (!localStorage.getItem(STORAGE_KEYS.onboardingSeen)) {
    showOnboarding();
  }

  // O texto das etapas é traduzido junto com o resto da tela estática via
  // data-i18n/data-i18n-html — só o rótulo do botão principal e o contador
  // "n / 6" dependem da etapa atual e são recalculados aqui.
  onLanguageChange(() => renderChrome(currentStep));
}
