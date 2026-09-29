import { STORAGE_KEYS } from "./config.js";
import { t, onLanguageChange } from "./i18n.js";

const TOTAL_STEPS = 4;
let currentStep = 1;

// Swipe: deslocamento horizontal mínimo (px ou fração da largura, o que for
// maior) e quanto o eixo X precisa dominar o Y pra contar como troca de
// etapa — arrasto curto, diagonal ou vertical (scroll) não troca nada.
const SWIPE_MIN_PX = 56;
const SWIPE_MIN_WIDTH_RATIO = 0.18;
const SWIPE_AXIS_RATIO = 1.5;

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

// Rótulo do CTA principal por etapa: "Próximo" nas três primeiras e
// "Bora correr" só na última — único lugar que precisa saber em que etapa
// está.
function ctaLabelFor(step) {
  return step === TOTAL_STEPS ? t("onboardingLetsRun") : t("onboardingNext");
}

// data-direction no overlay só escolhe o lado de onde a etapa nova entra
// (animação 100% CSS, desligada com prefers-reduced-motion).
function goToStep(n) {
  if (n !== currentStep) {
    el.overlay.dataset.direction = n < currentStep ? "back" : "forward";
  }
  currentStep = n;
  for (const step of el.steps) {
    step.hidden = Number(step.dataset.step) !== n;
  }
  for (const dot of el.dots) {
    dot.classList.toggle("active", Number(dot.dataset.dot) === n);
  }
  el.progress.textContent = `${n} / ${TOTAL_STEPS}`;
  el.nextBtn.textContent = ctaLabelFor(n);
}

function showOnboarding() {
  el.overlay.dataset.direction = "forward";
  currentStep = 1;
  el.overlay.hidden = false;
  goToStep(1);
}

function completeOnboarding() {
  localStorage.setItem(STORAGE_KEYS.onboardingSeen, "1");
  el.overlay.hidden = true;
}

// Swipe horizontal entre etapas (Pointer Events). A área das etapas tem
// touch-action: pan-y, então o navegador continua dono do scroll vertical
// (um arrasto vertical vira pointercancel e é descartado) e só o gesto
// horizontal chega inteiro aqui. Gestos que começam num botão são
// ignorados; nas pontas (etapa 1 pra trás, etapa 4 pra frente) o gesto não
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

    if (dx < 0 && currentStep < TOTAL_STEPS) goToStep(currentStep + 1);
    else if (dx > 0 && currentStep > 1) goToStep(currentStep - 1);
  });

  el.stepsArea.addEventListener("pointercancel", reset);
  el.stepsArea.addEventListener("lostpointercapture", reset);
}

// Configurações: a engrenagem abre um painel próprio (não mais o tutorial
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
    if (currentStep >= TOTAL_STEPS) completeOnboarding();
    else goToStep(currentStep + 1);
  });
  el.skipBtn.addEventListener("click", completeOnboarding);
  initSwipe();
  initSettings();

  if (!localStorage.getItem(STORAGE_KEYS.onboardingSeen)) {
    showOnboarding();
  }

  // O texto dos passos (título/parágrafo) é traduzido junto com o resto da
  // tela estática via data-i18n/data-i18n-html — só o rótulo do botão
  // principal e o contador "n / 4" precisam ser recalculados à mão, porque
  // dependem do passo atual.
  onLanguageChange(() => goToStep(currentStep));
}
