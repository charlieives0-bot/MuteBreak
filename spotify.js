// ── Spotify PKCE OAuth ──────────────────────────────────────────────
// Required scopes
const SCOPES = [
  'user-modify-playback-state',
  'user-read-playback-state',
].join(' ');

const REDIRECT_URI = window.location.origin + window.location.pathname;

// ── PKCE helpers ────────────────────────────────────────────────────
function base64urlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

async function generateCodeChallenge(verifier) {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return base64urlEncode(digest);
}

// ── Auth flow ────────────────────────────────────────────────────────
export async function startSpotifyAuth(clientId) {
  if (!clientId) throw new Error('Spotify Client ID is required');

  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  localStorage.setItem('spotify_code_verifier', verifier);
  localStorage.setItem('spotify_client_id', clientId);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state: 'mutebreak',
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export async function handleSpotifyCallback(code) {
  const verifier = localStorage.getItem('spotify_code_verifier');
  const clientId = localStorage.getItem('spotify_client_id');

  if (!verifier || !clientId) throw new Error('Missing PKCE verifier or client ID');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || `Token exchange failed: ${res.status}`);
  }

  const data = await res.json();
  const expiresAt = Date.now() + data.expires_in * 1000;

  localStorage.setItem('spotify_access_token', data.access_token);
  localStorage.setItem('spotify_refresh_token', data.refresh_token || '');
  localStorage.setItem('spotify_expires_at', String(expiresAt));
  localStorage.removeItem('spotify_code_verifier');

  return data.access_token;
}

async function refreshAccessToken() {
  const clientId = localStorage.getItem('spotify_client_id');
  const refreshToken = localStorage.getItem('spotify_refresh_token');

  if (!clientId || !refreshToken) throw new Error('Cannot refresh: missing credentials');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);

  const data = await res.json();
  const expiresAt = Date.now() + data.expires_in * 1000;

  localStorage.setItem('spotify_access_token', data.access_token);
  localStorage.setItem('spotify_expires_at', String(expiresAt));
  if (data.refresh_token) {
    localStorage.setItem('spotify_refresh_token', data.refresh_token);
  }

  return data.access_token;
}

export async function getAccessToken() {
  const token = localStorage.getItem('spotify_access_token');
  const expiresAt = Number(localStorage.getItem('spotify_expires_at') || 0);

  if (!token) return null;

  // Refresh if within 60 seconds of expiry
  if (Date.now() > expiresAt - 60_000) {
    try {
      return await refreshAccessToken();
    } catch {
      clearSpotifyAuth();
      return null;
    }
  }

  return token;
}

export function clearSpotifyAuth() {
  ['spotify_access_token', 'spotify_refresh_token', 'spotify_expires_at',
   'spotify_code_verifier', 'spotify_client_id'].forEach(k => localStorage.removeItem(k));
}

export function isSpotifyConnected() {
  return !!localStorage.getItem('spotify_access_token');
}

// ── Spotify API calls ────────────────────────────────────────────────
async function spotifyFetch(path, options = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Spotify');

  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  // 204 No Content is success with no body
  if (res.status === 204) return null;

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `Spotify API error: ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status, reason: err?.error?.reason });
  }

  return res.json().catch(() => null);
}

export async function resumePlayback() {
  return spotifyFetch('/me/player/play', { method: 'PUT', body: '{}' });
}

export async function pausePlayback() {
  return spotifyFetch('/me/player/pause', { method: 'PUT' });
}

export async function getCurrentlyPlaying() {
  return spotifyFetch('/me/player/currently-playing');
}

export async function getPlaybackState() {
  return spotifyFetch('/me/player');
}
