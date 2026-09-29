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
    tagline: "Música certa no passo certo.",
    helpAriaLabel: "Configurações",
    langSwitchAriaLabel: "Idioma",

    step1Title: "Conecte ao Spotify",
    checkingLogin: "Verificando login...",
    connectedStatus: "Conectado ao Spotify.",
    notConnected: "Não conectado.",
    loginError: "Erro no login: {message}",
    connectBtn: "Conectar ao Spotify",
    disconnectBtn: "Desconectar do Spotify",
    connectedSummary: "(Conectado)",

    step2Title: "Escolha suas playlists",
    catalogGenresLabel: "Gêneros RunBeat",
    selectPlaceholder: "Selecione",
    loadBpmBtn: "Carregar BPM",
    allOption: "Todos",
    oneItem: "{n} Item",
    nItems: "{n} Items",
    onePlaylist: "{n} playlist",
    nPlaylists: "{n} playlists",
    oneGenre: "{n} gênero",
    nGenres: "{n} gêneros",
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

    step3Title: "Escolha seu ritmo",
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
    spmSubLabel: "Passos por Minuto",
    bpmSubLabel: "Batidas por Minuto",
    lastMeasurementLabel: "Última medição (SPM):",
    targetLabel: "Alvo (SPM):",
    measuring: "medindo...",
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
    onboardingLetsRun: "Bora correr",
    onboardingSkip: "Pular",
    onboardingTitle1: "Você e a música.<br><span class=\"onboarding-highlight\">Juntos, no mesmo ritmo.</span>",
    onboardingTitle2: "Escolha o que<br>quer <span class=\"onboarding-highlight\">ouvir.</span>",
    onboardingCardYourPlaylists: "Suas playlists",
    onboardingCardRunbeatPlaylist: "Gêneros RunBeat",
    onboardingTitle3: "Corra do<br><span class=\"onboarding-highlight\">seu jeito.</span>",
    onboardingAutoLabel: "Automático",
    onboardingAutoBody: "A música acompanha seus passos.",
    onboardingFixedBody: "Você escolhe o ritmo.",
    onboardingPhraseA: "A <span class=\"onboarding-highlight\">batida</span> encontra o seu <span class=\"onboarding-highlight\">passo</span>.",
    onboardingPhraseB: "O seu <span class=\"onboarding-highlight\">passo</span> encontra a <span class=\"onboarding-highlight\">batida</span>.",
    onboardingOr: "ou",
    onboardingPulseTeaser: "Sinta a batida enquanto corre.",
    onboardingTutorialLabel: "Tutorial",
    onboardingSpmCaption: "Passos por minuto",
    onboardingBpmCaption: "Batidas por minuto",
    settingsTitle: "Configurações",
    settingsReplayTutorial: "Ver tutorial novamente",

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
    tagline: "The right song for every step.",
    helpAriaLabel: "Settings",
    langSwitchAriaLabel: "Language",

    step1Title: "Connect to Spotify",
    checkingLogin: "Checking login...",
    connectedStatus: "Connected to Spotify.",
    notConnected: "Not connected.",
    loginError: "Login error: {message}",
    connectBtn: "Connect to Spotify",
    disconnectBtn: "Disconnect from Spotify",
    connectedSummary: "(Connected)",

    step2Title: "Choose your playlists",
    catalogGenresLabel: "RunBeat Genres",
    selectPlaceholder: "Select",
    loadBpmBtn: "Load BPM",
    allOption: "All",
    oneItem: "{n} Item",
    nItems: "{n} Items",
    onePlaylist: "{n} playlist",
    nPlaylists: "{n} playlists",
    oneGenre: "{n} genre",
    nGenres: "{n} genres",
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

    step3Title: "Choose your pace",
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
    spmSubLabel: "Steps Per Minute",
    bpmSubLabel: "Beats Per Minute",
    lastMeasurementLabel: "Last measurement (SPM):",
    targetLabel: "Target (SPM):",
    measuring: "measuring...",
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
    onboardingLetsRun: "Let's run",
    onboardingSkip: "Skip",
    onboardingTitle1: "You and the music.<br><span class=\"onboarding-highlight\">Together, in sync.</span>",
    onboardingTitle2: "Choose what<br>you want to <span class=\"onboarding-highlight\">hear.</span>",
    onboardingCardYourPlaylists: "Your playlists",
    onboardingCardRunbeatPlaylist: "RunBeat Genres",
    onboardingTitle3: "Run your<br><span class=\"onboarding-highlight\">own way.</span>",
    onboardingAutoLabel: "Automatic",
    onboardingAutoBody: "The music follows your steps.",
    onboardingFixedBody: "You choose the pace.",
    onboardingPhraseA: "The <span class=\"onboarding-highlight\">beat</span> meets your <span class=\"onboarding-highlight\">stride</span>.",
    onboardingPhraseB: "Your <span class=\"onboarding-highlight\">stride</span> meets the <span class=\"onboarding-highlight\">beat</span>.",
    onboardingOr: "or",
    onboardingPulseTeaser: "Feel the beat as you run.",
    onboardingTutorialLabel: "Tutorial",
    onboardingSpmCaption: "Steps per minute",
    onboardingBpmCaption: "Beats per minute",
    settingsTitle: "Settings",
    settingsReplayTutorial: "View tutorial again",

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
