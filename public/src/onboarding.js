import { STORAGE_KEYS } from "./config.js";

const TOTAL_STEPS = 5;
let currentStep = 1;

const el = {
  overlay: document.getElementById("onboarding-overlay"),
  steps: document.querySelectorAll(".onboarding-step"),
  dots: document.querySelectorAll(".onboarding-dot"),
  backBtn: document.getElementById("onboarding-back"),
  nextBtn: document.getElementById("onboarding-next"),
  skipBtn: document.getElementById("onboarding-skip"),
  helpBtn: document.getElementById("help-btn"),
};

function goToStep(n) {
  currentStep = n;
  for (const step of el.steps) {
    step.hidden = Number(step.dataset.step) !== n;
  }
  for (const dot of el.dots) {
    dot.classList.toggle("active", Number(dot.dataset.dot) === n);
  }
  el.backBtn.hidden = n === 1;
  el.nextBtn.textContent = n === TOTAL_STEPS ? "Começar" : "Próximo";
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
  el.backBtn.addEventListener("click", () => goToStep(Math.max(1, currentStep - 1)));
  el.skipBtn.addEventListener("click", completeOnboarding);
  el.helpBtn.addEventListener("click", showOnboarding);

  if (!localStorage.getItem(STORAGE_KEYS.onboardingSeen)) {
    showOnboarding();
  }
}
