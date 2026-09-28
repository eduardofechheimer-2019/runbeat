import { STORAGE_KEYS } from "./config.js";
import { t, onLanguageChange } from "./i18n.js";

const TOTAL_STEPS = 4;
let currentStep = 1;

const el = {
  overlay: document.getElementById("onboarding-overlay"),
  steps: document.querySelectorAll(".onboarding-step"),
  dots: document.querySelectorAll(".onboarding-dot"),
  progress: document.getElementById("onboarding-progress"),
  nextBtn: document.getElementById("onboarding-next"),
  skipBtn: document.getElementById("onboarding-skip"),
  helpBtn: document.getElementById("help-btn"),
};

// Rótulo do CTA principal muda por etapa: "Começar" na 1ª (mesma chave já
// usada antes só na última etapa do onboarding anterior, agora reaproveitada
// aqui), "Próximo" nas intermediárias, "Bora correr" (chave nova) só na
// última — único lugar que precisa saber em que etapa está.
function ctaLabelFor(step) {
  if (step === 1) return t("onboardingStart");
  if (step === TOTAL_STEPS) return t("onboardingLetsRun");
  return t("onboardingNext");
}

function goToStep(n) {
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
  el.overlay.hidden = false;
  goToStep(1);
}

function completeOnboarding() {
  localStorage.setItem(STORAGE_KEYS.onboardingSeen, "1");
  el.overlay.hidden = true;
}

export function initOnboarding() {
  el.nextBtn.addEventListener("click", () => {
    if (currentStep >= TOTAL_STEPS) completeOnboarding();
    else goToStep(currentStep + 1);
  });
  el.skipBtn.addEventListener("click", completeOnboarding);
  el.helpBtn.addEventListener("click", showOnboarding);

  if (!localStorage.getItem(STORAGE_KEYS.onboardingSeen)) {
    showOnboarding();
  }

  // O texto dos passos (título/parágrafo) é traduzido junto com o resto da
  // tela estática via data-i18n/data-i18n-html — só o rótulo do botão
  // principal e o contador "n / 4" precisam ser recalculados à mão, porque
  // dependem do passo atual.
  onLanguageChange(() => goToStep(currentStep));
}
