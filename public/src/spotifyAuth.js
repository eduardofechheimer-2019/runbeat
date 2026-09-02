// Login via Authorization Code + PKCE — 100% client-side, sem client secret.
// https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_SCOPES,
  STORAGE_KEYS,
} from "./config.js";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

function base64UrlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return base64UrlEncode(new Uint8Array(digest));
}

function loadTokens() {
  const raw = localStorage.getItem(STORAGE_KEYS.spotifyTokens);
  return raw ? JSON.parse(raw) : null;
}

function saveTokens(tokens) {
  localStorage.setItem(STORAGE_KEYS.spotifyTokens, JSON.stringify(tokens));
}

export function isLoggedIn() {
  return !!loadTokens();
}

export function logout() {
  localStorage.removeItem(STORAGE_KEYS.spotifyTokens);
}

export async function startLogin() {
  if (SPOTIFY_CLIENT_ID === "COLOQUE_AQUI_O_CLIENT_ID") {
    throw new Error(
      "Configure SPOTIFY_CLIENT_ID em src/config.js antes de conectar (ver README)."
    );
  }
  const verifier = generateCodeVerifier();
  sessionStorage.setItem(STORAGE_KEYS.pkceVerifier, verifier);
  const challenge = await sha256Base64Url(verifier);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

// Chamado no carregamento da página — se a URL tiver ?code=..., troca por
// tokens e limpa a URL. Retorna true se um login acabou de ser concluído.
export async function handleRedirectCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) {
    url.searchParams.delete("error");
    window.history.replaceState({}, "", url.toString());
    throw new Error(`Spotify recusou o login: ${error}`);
  }
  if (!code) return false;

  const verifier = sessionStorage.getItem(STORAGE_KEYS.pkceVerifier);
  sessionStorage.removeItem(STORAGE_KEYS.pkceVerifier);
  if (!verifier) {
    throw new Error("Sessão de login expirada, tente conectar novamente.");
  }

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_verifier: verifier,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Falha ao trocar código por token (HTTP ${res.status}).`);
  }
  const json = await res.json();
  saveTokens({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
  });

  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.toString());
  return true;
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Falha ao renovar token (HTTP ${res.status}).`);
  }
  const json = await res.json();
  const tokens = loadTokens();
  const updated = {
    access_token: json.access_token,
    // Spotify só reenvia refresh_token novo às vezes — mantém o antigo se faltar.
    refresh_token: json.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
  saveTokens(updated);
  return updated;
}

// Retorna um access_token válido, renovando automaticamente se necessário.
export async function getValidAccessToken() {
  let tokens = loadTokens();
  if (!tokens) throw new Error("Não conectado ao Spotify.");
  const expiresSoon = Date.now() > tokens.expires_at - 60_000;
  if (expiresSoon) {
    tokens = await refreshAccessToken(tokens.refresh_token);
  }
  return tokens.access_token;
}
