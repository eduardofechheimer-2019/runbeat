// Detecção de cadência (passos/min) via acelerômetro do celular, por
// detecção de picos no módulo do vetor de aceleração.
import { CADENCE_MIN_SPM, CADENCE_MAX_SPM, CADENCE_WINDOW_MS } from "./config.js";

const MIN_STEP_INTERVAL_MS = 1000 * (60 / CADENCE_MAX_SPM); // evita contar ruído como passo duplo
const PEAK_THRESHOLD_G = 1.2; // acima da gravidade (~1g) em módulo, ajustável

// iOS 13+ exige permissão explícita (chamada dentro de um gesto do usuário,
// ex. clique no botão "Iniciar corrida").
export async function requestMotionPermission() {
  const DME = window.DeviceMotionEvent;
  if (DME && typeof DME.requestPermission === "function") {
    const result = await DME.requestPermission();
    if (result !== "granted") {
      throw new Error("Permissão de sensor de movimento negada.");
    }
  }
  // Android/desktop: não exige permissão explícita, DeviceMotionEvent já disponível.
}

export class CadenceTracker {
  constructor() {
    this.stepTimestamps = [];
    this.lastStepAt = 0;
    this.handler = this.handleMotion.bind(this);
    this.currentSpm = 0;
  }

  start() {
    window.addEventListener("devicemotion", this.handler);
  }

  stop() {
    window.removeEventListener("devicemotion", this.handler);
  }

  handleMotion(event) {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc || acc.x === null) return;
    const magnitudeG = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2) / 9.81;

    const now = Date.now();
    if (magnitudeG > PEAK_THRESHOLD_G && now - this.lastStepAt > MIN_STEP_INTERVAL_MS) {
      this.lastStepAt = now;
      this.stepTimestamps.push(now);
    }

    const cutoff = now - CADENCE_WINDOW_MS;
    this.stepTimestamps = this.stepTimestamps.filter((t) => t > cutoff);

    const windowSeconds = Math.min(now - (this.stepTimestamps[0] ?? now), CADENCE_WINDOW_MS) / 1000;
    const spm = windowSeconds > 1 ? Math.round((this.stepTimestamps.length / windowSeconds) * 60) : 0;

    this.currentSpm = spm >= CADENCE_MIN_SPM && spm <= CADENCE_MAX_SPM ? spm : this.currentSpm;
  }

  getCurrentSpm() {
    return this.currentSpm;
  }
}
