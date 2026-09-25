// Tradução PT/EN — dicionário simples por chave, sem biblioteca externa (só
// duas línguas, sem plural complexo nem pluralização por região). `t(key,
// vars)` busca a string na língua atual (com fallback pro PT se faltar
// alguma chave) e substitui "{nome}" pelos valores de `vars`.
//
// Cobre todo texto estático (via atributos `data-i18n*` aplicados em
// `applyStaticTranslations`) e serve de fonte pros textos dinâmicos que o
// app.js/onboarding.js montam em tempo de execução (status, progresso,
// resumo de passo, etc.) — esses últimos precisam ser recalculados na hora
// que o idioma muda, por isso `onLanguageChange` existe: cada módulo com
// texto dinâmico próprio registra uma função de "re-render" que é chamada
// toda vez que `setLang` roda.
import { STORAGE_KEYS } from "./config.js";

const translations = {
  pt: {
    tagline: "A música certa na hora certa.",
    helpAriaLabel: "Como funciona",
    langSwitchAriaLabel: "Idioma",

    step1Title: "Conecte ao Spotify",
    checkingLogin: "Verificando login...",
    connectedStatus: "Conectado ao Spotify.",
    notConnected: "Não conectado.",
    loginError: "Erro no login: {message}",
    connectBtn: "Conectar ao Spotify",
    disconnectBtn: "Desconectar do Spotify",
    connectedSummary: "(Conectado)",

    step2Title: "Escolha as Playlists",
    catalogGenresLabel: "Gêneros Playlist RunBeat",
    selectPlaceholder: "Selecione",
    loadBpmBtn: "Carregar BPM",
    allOption: "Todos",
    oneItem: "{n} Item",
    nItems: "{n} Items",
    chooseAtLeastOnePlaylist: "Escolha ao menos uma playlist.",
    chooseAtLeastOneGenre: "Escolha ao menos um gênero.",
    fetchingTracks: "Buscando faixas...",
    resolvingBpm: "Resolvendo BPM: {done}/{total}...",
    poolReady: "Pronto: {found} de {total} faixas com BPM encontrado.",
    poolFailuresSuffix: " ({count} fonte(s) não puderam ser lidas: {names})",
    poolFirstFailureReason: " [motivo da 1ª: {message}]",
    poolNoTracksResolved: " Nenhuma faixa teve BPM resolvido.",
    poolDiagnostic: " [Diagnóstico: {diagnostic}]",
    fetchingLibraryPlaylists: "Buscando playlists da biblioteca...",
    fetchingTracksSource: "Buscando faixas: fonte {i}/{total} ({name})...",
    likedSongs: "Músicas Curtidas",
    playlistByOwner: "{name} (de {owner})",
    unknownOwner: "desconhecido",
    genericErrorPrefix: "Erro: {message}",

    step3Title: "Escolha o ritmo",
    paceLabel: "Ritmo",
    modeAuto: "Automático (minha cadência)",
    modeFixed: "Ritmo fixo",
    paceLevelLabel: "Nível",
    continueBtn: "Continuar",
    autoSummary: "(Automático)",

    audiblePulseTitle: "Marca-Passo Sonoro",
    audiblePulseSubtitle: "Pode interferir no áudio do Spotify — faça o teste.",
    audioBlocked: "🔇 iOS não liberou o som — desmarque e marque de novo, ou confira o interruptor de silêncio",
    audioActive: "🔊 Marca-Passo Sonoro ativo",
    liveDashboardTitle: "Painel em tempo real:",
    lastMeasurementLabel: "Última medição (SPM):",
    targetLabel: "Alvo (SPM):",
    liveCadenceLabel: "Tempo real (SPM):",
    beatBpmLabel: "Batida da música (BPM):",
    measuring: "medindo...",
    stepsPerMin: "{n} passos/min",
    stepsPerMinRange: "{min}–{max} passos/min",
    beatsPerMin: "{n} beats/min",
    cadenceWaitHint: "🏃 Pode começar a correr! Estamos esperando os primeiros passos.",
    nowPlayingTitle: "Tocando:",
    trackNameLabel: "Música:",
    trackSourceLabel: "Playlist:",
    trackGenreLabel: "Gênero:",
    warmupBtn: "Spotify sync (clique aqui)",
    warmupHint: "↖️ Voltar é só tocar em \"‹ RunBeat\"",
    openingSpotify: "Abrindo o Spotify...",
    prevAriaLabel: "Faixa anterior",
    nextAriaLabel: "Próxima faixa",
    playLabel: "Play",
    pauseLabel: "Pause",

    boostInputPlaceholder: "Link da faixa bônus",
    boostSaveBtn: "Salvar",
    boostChangeBtn: "Trocar",
    boostBtn: "Faixa Bônus",
    boostTrackSource: "Faixa bônus",
    boostInvalidLink: "Link inválido — cole o link de uma faixa do Spotify (ex. https://open.spotify.com/track/...).",
    boostNoTempo: "Não foi possível determinar o BPM dessa música — tente outra.",

    multiselectCloseAriaLabel: "Fechar",

    onboardingNext: "Próximo",
    onboardingStart: "Começar",
    onboardingBack: "Voltar",
    onboardingSkip: "Pular",
    onboardingTitle1: "Bem-vindo ao RunBeat",
    onboardingBody1: "O RunBeat troca a música sozinho no Spotify pra acompanhar o ritmo da sua corrida ou caminhada — sem precisar escolher faixa na mão.",
    onboardingTitle2: "Conecte sua conta Spotify",
    onboardingBody2: "Precisa ser <strong>Premium</strong> — é a API de controle de playback que troca a faixa por você, sem custo além da sua assinatura.",
    onboardingTitle3: "Escolha suas músicas",
    onboardingBody3: "Na lista, marque \"Todos\" pra juntar tudo de uma vez, a <strong>Playlist RunBeat</strong> (com filtro por gênero) pra mais opções de BPM, ou uma ou mais playlists suas.",
    onboardingTitle4: "Escolha o ritmo",
    onboardingBody4: "<strong>Automático</strong> usa o acelerômetro do celular pra medir sua cadência real. <strong>Ritmo fixo</strong> trava um nível (Easy Pace, Warming Up, Taking Off, Pro) — dá pra trocar a qualquer momento durante a corrida.",
    onboardingTitle5: "Toque em Play pra começar",
    onboardingBody5: "A troca de faixa acontece sozinha, sem interromper a música no meio. Use ⏮/⏭ pra pular manualmente, e o pulso sonoro (opcional) pra sentir a batida-alvo. Se o Spotify pedir, um toque no botão que aparece já abre e começa a tocar — pra voltar, toque em \"‹ RunBeat\" no topo da tela, ou troque de app normalmente.",

    configureClientId: "Configure SPOTIFY_CLIENT_ID em src/config.js antes de conectar (ver README).",
    spotifyRefusedLogin: "Spotify recusou o login: {error}",
    loginSessionExpired: "Sessão de login expirada, tente conectar novamente.",
    tokenExchangeFailed: "Falha ao trocar código por token (HTTP {status}).",
    tokenRefreshFailed: "Falha ao renovar token (HTTP {status}).",
    notConnectedToSpotify: "Não conectado ao Spotify.",
    spotifyApiFailed: "Spotify API {method} {path} falhou (HTTP {status}): {detail}",
    noActiveDevice: "Nenhum dispositivo Spotify ativo. Toque no botão abaixo pra abrir o Spotify e começar.",
    trackNotFound: "Faixa não encontrada no Spotify (pode ter sido removida do catálogo): {uri}",
    motionPermissionDenied: "Permissão de sensor de movimento negada.",
    catalogLoadFailed: "Falha ao carregar o Catálogo RunBeat (HTTP {status})",
  },
  en: {
    tagline: "The right song at the right moment.",
    helpAriaLabel: "How it works",
    langSwitchAriaLabel: "Language",

    step1Title: "Connect to Spotify",
    checkingLogin: "Checking login...",
    connectedStatus: "Connected to Spotify.",
    notConnected: "Not connected.",
    loginError: "Login error: {message}",
    connectBtn: "Connect to Spotify",
    disconnectBtn: "Disconnect from Spotify",
    connectedSummary: "(Connected)",

    step2Title: "Choose the Playlists",
    catalogGenresLabel: "RunBeat Playlist Genres",
    selectPlaceholder: "Select",
    loadBpmBtn: "Load BPM",
    allOption: "All",
    oneItem: "{n} Item",
    nItems: "{n} Items",
    chooseAtLeastOnePlaylist: "Choose at least one playlist.",
    chooseAtLeastOneGenre: "Choose at least one genre.",
    fetchingTracks: "Fetching tracks...",
    resolvingBpm: "Resolving BPM: {done}/{total}...",
    poolReady: "Ready: {found} of {total} tracks with BPM found.",
    poolFailuresSuffix: " ({count} source(s) could not be read: {names})",
    poolFirstFailureReason: " [1st reason: {message}]",
    poolNoTracksResolved: " No track had its BPM resolved.",
    poolDiagnostic: " [Diagnostic: {diagnostic}]",
    fetchingLibraryPlaylists: "Fetching library playlists...",
    fetchingTracksSource: "Fetching tracks: source {i}/{total} ({name})...",
    likedSongs: "Liked Songs",
    playlistByOwner: "{name} (by {owner})",
    unknownOwner: "unknown",
    genericErrorPrefix: "Error: {message}",

    step3Title: "Choose the pace",
    paceLabel: "Pace",
    modeAuto: "Automatic (my cadence)",
    modeFixed: "Fixed pace",
    paceLevelLabel: "Level",
    continueBtn: "Continue",
    autoSummary: "(Automatic)",

    audiblePulseTitle: "Audible Pacer",
    audiblePulseSubtitle: "May interfere with Spotify's audio — give it a try.",
    audioBlocked: "🔇 iOS didn't let sound through — uncheck and check again, or check the silent switch",
    audioActive: "🔊 Audible Pacer active",
    liveDashboardTitle: "Live Dashboard:",
    lastMeasurementLabel: "Last measurement (SPM):",
    targetLabel: "Target (SPM):",
    liveCadenceLabel: "Live (SPM):",
    beatBpmLabel: "Music beat (BPM):",
    measuring: "measuring...",
    stepsPerMin: "{n} steps/min",
    stepsPerMinRange: "{min}–{max} steps/min",
    beatsPerMin: "{n} beats/min",
    cadenceWaitHint: "🏃 You can start running! We're waiting for the first steps.",
    nowPlayingTitle: "Now:",
    trackNameLabel: "Track:",
    trackSourceLabel: "Playlist:",
    trackGenreLabel: "Genre:",
    warmupBtn: "Spotify sync (tap here)",
    warmupHint: "↖️ To come back, just tap \"‹ RunBeat\"",
    openingSpotify: "Opening Spotify...",
    prevAriaLabel: "Previous track",
    nextAriaLabel: "Next track",
    playLabel: "Play",
    pauseLabel: "Pause",

    boostInputPlaceholder: "Bonus track link",
    boostSaveBtn: "Save",
    boostChangeBtn: "Change",
    boostBtn: "Bonus Track",
    boostTrackSource: "Bonus track",
    boostInvalidLink: "Invalid link — paste a Spotify track link (e.g. https://open.spotify.com/track/...).",
    boostNoTempo: "Couldn't determine this track's BPM — try another one.",

    multiselectCloseAriaLabel: "Close",

    onboardingNext: "Next",
    onboardingStart: "Get started",
    onboardingBack: "Back",
    onboardingSkip: "Skip",
    onboardingTitle1: "Welcome to RunBeat",
    onboardingBody1: "RunBeat switches songs on Spotify by itself to match the pace of your run or walk — no need to pick tracks by hand.",
    onboardingTitle2: "Connect your Spotify account",
    onboardingBody2: "You need <strong>Premium</strong> — it's the playback control API that swaps tracks for you, at no extra cost beyond your subscription.",
    onboardingTitle3: "Choose your music",
    onboardingBody3: "In the list, check \"All\" to bring everything in at once, the <strong>RunBeat Playlist</strong> (with genre filtering) for more BPM options, or one or more of your own playlists.",
    onboardingTitle4: "Choose the pace",
    onboardingBody4: "<strong>Automatic</strong> uses your phone's accelerometer to measure your real cadence. <strong>Fixed pace</strong> locks in a level (Easy Pace, Warming Up, Taking Off, Pro) — you can switch anytime during the run.",
    onboardingTitle5: "Tap Play to start",
    onboardingBody5: "Track switching happens by itself, without interrupting the music midway. Use ⏮/⏭ to skip manually, and the audible pulse (optional) to feel the target beat. If Spotify asks, tapping the button that shows up opens it and starts playing right away — to come back, tap \"‹ RunBeat\" at the top of the screen, or switch apps normally.",

    configureClientId: "Set SPOTIFY_CLIENT_ID in src/config.js before connecting (see README).",
    spotifyRefusedLogin: "Spotify refused the login: {error}",
    loginSessionExpired: "Login session expired, please try connecting again.",
    tokenExchangeFailed: "Failed to exchange code for token (HTTP {status}).",
    tokenRefreshFailed: "Failed to refresh token (HTTP {status}).",
    notConnectedToSpotify: "Not connected to Spotify.",
    spotifyApiFailed: "Spotify API {method} {path} failed (HTTP {status}): {detail}",
    noActiveDevice: "No active Spotify device. Tap the button below to open Spotify and start.",
    trackNotFound: "Track not found on Spotify (it may have been removed from the catalog): {uri}",
    motionPermissionDenied: "Motion sensor permission denied.",
    catalogLoadFailed: "Failed to load the RunBeat Catalog (HTTP {status})",
  },
};

let currentLang = localStorage.getItem(STORAGE_KEYS.lang) === "en" ? "en" : "pt";
const listeners = [];

export function t(key, vars) {
  const dict = translations[currentLang] || translations.pt;
  let str = dict[key] ?? translations.pt[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.split(`{${name}}`).join(value);
    }
  }
  return str;
}

export function getLang() {
  return currentLang;
}

// Chamado por qualquer módulo que tenha texto dinâmico próprio (montado em
// runtime, fora do alcance dos atributos `data-i18n*`) — a função passada é
// chamada toda vez que o idioma muda, pra recalcular esse texto na língua
// nova.
export function onLanguageChange(fn) {
  listeners.push(fn);
}

function applyStaticTranslations() {
  document.documentElement.lang = currentLang === "pt" ? "pt-BR" : "en";
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll("[data-i18n-html]")) {
    node.innerHTML = t(node.dataset.i18nHtml);
  }
  for (const node of document.querySelectorAll("[data-i18n-aria-label]")) {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  }
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  }
}

export function setLang(lang) {
  if (lang !== "pt" && lang !== "en") return;
  currentLang = lang;
  localStorage.setItem(STORAGE_KEYS.lang, lang);
  applyStaticTranslations();
  for (const fn of listeners) fn();
}

// Chamado uma vez no carregamento — aplica a língua salva (ou o padrão PT)
// antes de qualquer outra coisa aparecer na tela.
export function initI18n() {
  applyStaticTranslations();
}
