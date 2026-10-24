// Diagnóstico do Spotify (somente leitura) — Configurações → "Diagnóstico do
// Spotify". Serve pra descobrir pra onde vão os pedidos de reprodução quando
// o RunBeat mostra a música mas o app do Spotify não toca.
//
// Duas fontes:
//   1. Registro das chamadas que o próprio RunBeat faz à API do Spotify
//      (método, caminho, status HTTP, corpo de erro). O fetch é só observado:
//      a requisição e a resposta seguem exatamente iguais pro app.js.
//   2. Consultas de leitura feitas só quando o painel é aberto/atualizado:
//      GET /me (conta), GET /me/player/devices (dispositivos) e GET /me/player
//      (o que está tocando e onde).
//
// Nenhum comando de reprodução é enviado daqui e nada no fluxo do app muda.

import { getValidAccessToken, isLoggedIn } from "./spotifyAuth.js";

const API = "https://api.spotify.com/v1";
const MAX_LOG = 40;
const log = [];
const originalFetch = window.fetch.bind(window);

window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (!url.startsWith(API)) return originalFetch(input, init);
  const started = Date.now();
  const entry = { at: new Date(started), method: (init?.method || "GET").toUpperCase(), path: url.slice(API.length), status: "…", ms: 0, detail: "" };
  // Pedido de reprodução: guarda qual faixa foi pedida (corpo do PUT) pra
  // comparar com o que o Spotify diz estar tocando logo depois.
  let requested = "";
  try {
    const uris = JSON.parse(init?.body || "null")?.uris;
    if (uris?.length) requested = `pedido: ${uris.join(", ")}`;
  } catch { /* corpo não-JSON: ignora */ }
  log.push(entry);
  if (log.length > MAX_LOG) log.shift();
  try {
    const res = await originalFetch(input, init);
    entry.status = res.status;
    entry.ms = Date.now() - started;
    if (requested) entry.detail = requested;
    if (!res.ok) {
      res.clone().text().then((t) => (entry.detail = [requested, t.slice(0, 300)].filter(Boolean).join("\n    "))).catch(() => {});
    } else if (entry.method === "GET" && entry.path === "/me/player") {
      // Resumo do estado lido (conferência depois do play): mostra se estava
      // tocando, qual faixa e em qual dispositivo, sem mudar a resposta.
      res.clone().text().then((t) => {
        if (!t) return void (entry.detail = "nenhum dispositivo ativo");
        const b = JSON.parse(t);
        entry.detail = `${b.is_playing ? "tocando" : "pausado"} · ${b.item ? `${b.item.name} (${b.item.uri})` : "sem faixa"} · ${b.device?.name ?? "?"}`;
      }).catch(() => {});
    }
    return res;
  } catch (err) {
    entry.status = "falha de rede";
    entry.detail = err.message;
    entry.ms = Date.now() - started;
    throw err;
  }
};

const el = {
  settingsModal: document.getElementById("settings-modal"),
  openBtn: document.getElementById("settings-spotify-diag"),
  modal: document.getElementById("spotify-diag-modal"),
  close: document.getElementById("spotify-diag-close"),
  refresh: document.getElementById("spotify-diag-refresh"),
  copy: document.getElementById("spotify-diag-copy"),
  out: document.getElementById("spotify-diag-output"),
};

const hhmmss = (d) => d.toTimeString().slice(0, 8);

async function readOnly(path) {
  const token = await getValidAccessToken();
  const res = await originalFetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 204) return { status: 204, body: null };
  const text = await res.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON: mostra como texto */ }
  return { status: res.status, body };
}

function describeDevice(d) {
  const flags = [d.is_active ? "ATIVO" : "inativo", d.is_restricted ? "RESTRITO (não aceita comandos da API)" : "aceita comandos", d.is_private_session ? "sessão privada" : null].filter(Boolean).join(", ");
  return `• ${d.name} — ${d.type}, ${flags}, volume ${d.volume_percent ?? "?"}%  [id ${String(d.id).slice(0, 8)}…]`;
}

async function buildReport() {
  const lines = [`RunBeat · diagnóstico do Spotify · ${new Date().toLocaleString()}`, `Endereço: ${location.origin}`, `Modo: ${matchMedia("(display-mode: standalone)").matches ? "app instalado (tela inicial)" : "navegador"}`, ""];
  if (!isLoggedIn()) {
    lines.push("O RunBeat não está conectado ao Spotify.");
    return lines.join("\n");
  }
  try {
    const me = await readOnly("/me");
    lines.push("CONTA");
    lines.push(me.status === 200 ? `• ${me.body.display_name ?? "(sem nome)"} — id ${me.body.id}` : `• erro HTTP ${me.status}: ${JSON.stringify(me.body).slice(0, 200)}`);
    lines.push("");

    const dev = await readOnly("/me/player/devices");
    lines.push("DISPOSITIVOS DO SPOTIFY NESTA CONTA");
    if (dev.status === 200) {
      const list = dev.body?.devices ?? [];
      if (!list.length) lines.push("• nenhum dispositivo disponível");
      list.forEach((d) => lines.push(describeDevice(d)));
    } else {
      lines.push(`• erro HTTP ${dev.status}: ${JSON.stringify(dev.body).slice(0, 200)}`);
    }
    lines.push("");

    const pl = await readOnly("/me/player");
    lines.push("REPRODUÇÃO ATUAL (segundo o Spotify)");
    if (pl.status === 204 || !pl.body) {
      lines.push("• nada tocando / nenhum dispositivo ativo");
    } else if (pl.status === 200) {
      const b = pl.body;
      const item = b.item ? `${b.item.name} — ${(b.item.artists || []).map((a) => a.name).join(", ")}` : "(sem faixa)";
      lines.push(`• dispositivo: ${b.device?.name ?? "?"} (${b.device?.type ?? "?"})${b.device?.is_restricted ? " — RESTRITO" : ""}`);
      lines.push(`• ${b.is_playing ? "tocando" : "pausado"}: ${item}`);
      lines.push(`• posição: ${Math.round((b.progress_ms ?? 0) / 1000)} s de ${Math.round((b.item?.duration_ms ?? 0) / 1000)} s`);
    } else {
      lines.push(`• erro HTTP ${pl.status}: ${JSON.stringify(pl.body).slice(0, 200)}`);
    }
  } catch (err) {
    lines.push(`Falha ao consultar o Spotify: ${err.message}`);
  }
  lines.push("");
  lines.push("ÚLTIMAS CHAMADAS DO RUNBEAT AO SPOTIFY (mais recentes primeiro)");
  if (!log.length) lines.push("• nenhuma chamada registrada desde que o app abriu");
  [...log].reverse().forEach((e) => {
    lines.push(`• ${hhmmss(e.at)} ${e.method} ${e.path} → ${e.status} (${e.ms} ms)${e.detail ? `\n    ${e.detail}` : ""}`);
  });
  return lines.join("\n");
}

async function render() {
  el.out.textContent = "Consultando o Spotify…";
  el.out.textContent = await buildReport();
}

function open() {
  el.settingsModal.hidden = true;
  el.modal.hidden = false;
  render();
}

function close() {
  el.modal.hidden = true;
}

el.openBtn.addEventListener("click", open);
el.close.addEventListener("click", close);
el.refresh.addEventListener("click", render);
el.modal.addEventListener("click", (event) => {
  if (event.target === el.modal) close();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !el.modal.hidden) close();
});
el.copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(el.out.textContent);
    el.copy.textContent = "Copiado ✓";
  } catch {
    // Sem permissão de área de transferência: seleciona o texto pra copiar manualmente.
    const range = document.createRange();
    range.selectNodeContents(el.out);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    el.copy.textContent = "Selecionado — copie manualmente";
  }
  setTimeout(() => (el.copy.textContent = "Copiar relatório"), 2500);
});
