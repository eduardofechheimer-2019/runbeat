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
// Nenhum comando de reprodução é enviado daqui e nada no fluxo do app muda —
// exceto pelo botão "Testar troca de faixa" (ver runSwitchTest), que só roda
// quando o usuário toca nele e registra o resultado no relatório.

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
  test: document.getElementById("spotify-diag-test"),
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

// --- Teste de troca de faixa ---
// Com o Spotify do iPhone tocando em segundo plano (o RunBeat na frente),
// tenta trocar de faixa por caminhos diferentes da API e registra qual deles
// fez a faixa pedida tocar de fato. Serve pra decidir, com evidência, como o
// RunBeat deve trocar de faixa. Só roda quando o usuário toca no botão.
const TEST_TRACKS = ["78EQ5LZGgviMU9k0zrqv1r", "15BlympuVSfZFROojEMY2M", "5masKPHeAOVNgxdLebIcK7"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastTest = [];

async function call(method, path, body) {
  const token = await getValidAccessToken();
  const res = await originalFetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => "");
  return `${res.status}${res.ok ? "" : ` ${text.replace(/\s+/g, " ").slice(0, 160)}`}`;
}

async function stateSummary() {
  const st = await readOnly("/me/player");
  if (st.status !== 200 || !st.body) return { text: "nada tocando / nenhum dispositivo ativo", body: null };
  const b = st.body;
  return { body: b, text: `${b.is_playing ? "tocando" : "pausado"} · ${b.item ? `${b.item.name} (${b.item.id})` : "sem faixa"} · ${b.device?.name ?? "?"}` };
}

async function waitForTrack(id, totalMs = 4500) {
  const started = Date.now();
  let last;
  while (Date.now() - started < totalMs) {
    await sleep(800);
    last = await stateSummary();
    const it = last.body?.item;
    if (last.body?.is_playing && it && (it.id === id || it.linked_from?.id === id)) return { ok: true, ms: Date.now() - started, text: last.text };
  }
  return { ok: false, ms: Date.now() - started, text: last?.text ?? "?" };
}

async function runSwitchTest() {
  const out = [`TESTE DE TROCA DE FAIXA · ${new Date().toLocaleTimeString()}`];
  const devs = await readOnly("/me/player/devices");
  const list = devs.body?.devices ?? [];
  const phone = list.find((d) => d.type === "Smartphone" && d.is_active) || list.find((d) => d.type === "Smartphone");
  const before = await stateSummary();
  out.push(`• antes: ${before.text}`);
  out.push(`• celular na lista: ${phone ? `${phone.name} (${phone.is_active ? "ativo" : "inativo"})` : "NÃO — abra o Spotify, toque uma música e volte"}`);
  const q = phone ? `device_id=${encodeURIComponent(phone.id)}` : "";

  // Fila + próxima primeiro: se um teste pausar o Spotify, o iOS pode
  // suspendê-lo e prejudicar os seguintes.
  const [a, b, c] = TEST_TRACKS;
  const qs = q ? `&${q}` : "";
  const sq = await call("POST", `/me/player/queue?uri=${encodeURIComponent(`spotify:track:${a}`)}${qs}`);
  const sn = await call("POST", `/me/player/next${q ? `?${q}` : ""}`);
  let r = await waitForTrack(a);
  out.push(`• 1) fila + próxima → fila ${sq}, próxima ${sn} → ${r.ok ? `✅ TROCOU (${r.ms} ms)` : `❌ não trocou — ${r.text}`}`);

  let s = await call("PUT", "/me/player/play", { uris: [`spotify:track:${b}`] });
  r = await waitForTrack(b);
  out.push(`• 2) tocar faixa → ${s} → ${r.ok ? `✅ TROCOU (${r.ms} ms)` : `❌ não trocou — ${r.text}`}`);

  if (phone) {
    s = await call("PUT", `/me/player/play?${q}`, { uris: [`spotify:track:${c}`] });
    r = await waitForTrack(c);
    out.push(`• 3) tocar faixa no celular (device_id) → ${s} → ${r.ok ? `✅ TROCOU (${r.ms} ms)` : `❌ não trocou — ${r.text}`}`);
  } else {
    out.push("• 3) pulado (celular não aparece na lista)");
  }

  const after = await stateSummary();
  if (!after.body?.is_playing) {
    const sr = await call("PUT", `/me/player/play${q ? `?${q}` : ""}`);
    await sleep(2500);
    const end = await stateSummary();
    out.push(`• 4) retomar → ${sr} → ${end.body?.is_playing ? "✅ voltou a tocar" : "❌ continua parado"} — ${end.text}`);
  }
  out.push(`• fim: ${(await stateSummary()).text}`);
  return out;
}

async function render() {
  el.out.textContent = "Consultando o Spotify…";
  const report = await buildReport();
  el.out.textContent = lastTest.length ? `${report}\n\n${lastTest.join("\n")}` : report;
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
el.test.addEventListener("click", async () => {
  el.test.disabled = true;
  el.test.textContent = "Testando… (~20 s)";
  try {
    lastTest = await runSwitchTest();
  } catch (err) {
    lastTest = [`TESTE DE TROCA DE FAIXA: falhou — ${err.message}`];
  }
  el.test.disabled = false;
  el.test.textContent = "Testar troca de faixa";
  await render();
});
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
