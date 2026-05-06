import {
  startSpotifyAuth,
  handleSpotifyCallback,
  isSpotifyConnected,
  clearSpotifyAuth,
  resumePlayback,
  pausePlayback,
  getCurrentlyPlaying,
  SPOTIFY_CLIENT_ID,
} from './spotify.js';

import {
  getRokuIp,
  setRokuIp,
  mute,
  unmute,
  pingRoku,
} from './roku.js';

// ── App state ─────────────────────────────────────────────────────────
const state = {
  screen: 'setup',          // 'setup' | 'idle' | 'break'
  preset: 5,                // minutes (0 = manual)
  breakStart: null,         // Date
  addedMinutes: 0,
  nowPlaying: null,
  pollInterval: null,
  timerInterval: null,
  rokuStatus: null,         // null | 'ok' | 'error'
  rokuStatusMsg: '',
};

// ── Router ────────────────────────────────────────────────────────────
function navigate(screen) {
  state.screen = screen;
  render();
}

// ── Render dispatcher ─────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  clearIntervals();

  switch (state.screen) {
    case 'setup': app.innerHTML = renderSetup(); bindSetup(); break;
    case 'idle':  app.innerHTML = renderIdle();  bindIdle();  break;
    case 'break': app.innerHTML = renderBreak(); bindBreak(); break;
  }
}

function clearIntervals() {
  clearInterval(state.pollInterval);
  clearInterval(state.timerInterval);
  state.pollInterval = null;
  state.timerInterval = null;
}

// ── Helpers ────────────────────────────────────────────────────────────
function formatTime(seconds) {
  const m = Math.floor(Math.abs(seconds) / 60).toString().padStart(2, '0');
  const s = (Math.abs(seconds) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function elapsedSeconds() {
  if (!state.breakStart) return 0;
  return Math.floor((Date.now() - state.breakStart) / 1000);
}

function remainingSeconds() {
  if (state.preset === 0) return null; // manual mode
  const total = (state.preset * 60) + (state.addedMinutes * 60);
  return Math.max(0, total - elapsedSeconds());
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// ── SETUP SCREEN ──────────────────────────────────────────────────────
function renderSetup() {
  const rokuIp = getRokuIp();
  const spotifyOk = isSpotifyConnected();

  const rokuStatusHtml = state.rokuStatus === 'ok'
    ? `<div class="status-row"><div class="dot dot-ok"></div><span>Roku reachable</span></div>`
    : state.rokuStatus === 'error'
    ? `<div class="status-row"><div class="dot dot-err"></div><span>${state.rokuStatusMsg}</span></div>`
    : '';

  const spotifyStatusHtml = spotifyOk
    ? `<div class="status-row"><div class="dot dot-ok"></div><span>Spotify connected</span></div>`
    : '';

  const canContinue = rokuIp && spotifyOk;

  return `
    <div class="screen">
      <div class="header">
        <span class="app-name">Standby</span>
      </div>

      <div>
        <h1>Setup</h1>
        <p class="helper" style="margin-top:6px">Two steps: enter your Roku's IP address, then connect Spotify.</p>
      </div>

      ${window.location.protocol === 'https:'
        ? `<div class="alert alert-warn">
            <strong>Chrome step required for Roku:</strong> This page is served over HTTPS, but Roku uses plain HTTP.
            Click the <strong>lock icon</strong> in Chrome's address bar → <strong>Site settings</strong> →
            set <strong>Insecure content</strong> to <strong>Allow</strong>, then reload.
           </div>`
        : ''
      }

      <div class="card">
        <div>
          <label>Step 1 — Roku IP Address</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="roku-ip-input"
              placeholder="192.168.1.x"
              value="${rokuIp}"
            />
            <button class="btn-secondary btn-sm" id="test-roku-btn" style="white-space:nowrap">Test</button>
          </div>
          <p class="helper" style="margin-top:6px">
            Find it on your Roku: Settings → Network → About → IP address
          </p>
        </div>
        ${rokuStatusHtml}
      </div>

      <div class="card">
        <label>Step 2 — Spotify</label>
        ${spotifyStatusHtml}
        ${spotifyOk
          ? `<button class="btn-secondary" id="disconnect-spotify-btn">Disconnect Spotify</button>`
          : `<button class="spotify-btn" id="connect-spotify-btn">
               <svg class="spotify-logo" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
               </svg>
               Connect Spotify
             </button>`
        }
      </div>

      <div id="setup-error" class="alert" style="display:none"></div>

      ${canContinue
        ? `<button class="btn-primary" id="go-btn">Go to Main Screen →</button>`
        : `<button class="btn-primary" disabled>Complete steps above to continue</button>`
      }
    </div>
  `;
}

function bindSetup() {
  // Save Roku IP on input
  const ipInput = document.getElementById('roku-ip-input');
  ipInput?.addEventListener('input', () => {
    setRokuIp(ipInput.value);
    // Reset status on change
    state.rokuStatus = null;
  });

  // Test Roku connectivity
  document.getElementById('test-roku-btn')?.addEventListener('click', async () => {
    const ip = ipInput?.value.trim();
    if (!ip) { showError('setup-error', 'Enter a Roku IP first.'); return; }
    hideError('setup-error');
    setRokuIp(ip);

    const btn = document.getElementById('test-roku-btn');
    btn.textContent = 'Testing…';
    btn.disabled = true;

    try {
      await pingRoku(ip);
      state.rokuStatus = 'ok';
      state.rokuStatusMsg = '';
    } catch (err) {
      state.rokuStatus = 'error';
      state.rokuStatusMsg = err.message;
    }
    render();
  });

  // Spotify connect
  document.getElementById('connect-spotify-btn')?.addEventListener('click', async () => {
    hideError('setup-error');
    try {
      await startSpotifyAuth(SPOTIFY_CLIENT_ID);
    } catch (err) {
      showError('setup-error', err.message);
    }
  });

  // Spotify disconnect
  document.getElementById('disconnect-spotify-btn')?.addEventListener('click', () => {
    clearSpotifyAuth();
    render();
  });

  // Go button
  document.getElementById('go-btn')?.addEventListener('click', () => {
    navigate('idle');
  });
}

// ── IDLE SCREEN ───────────────────────────────────────────────────────
function renderIdle() {
  const presets = [
    { label: '2 min', value: 2 },
    { label: '5 min', value: 5 },
    { label: 'Manual', value: 0 },
  ];

  return `
    <div class="screen">
      <div class="header">
        <span class="app-name">Standby</span>
        <div class="header-actions">
          <button class="text-btn" id="setup-link">Setup</button>
        </div>
      </div>

      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:24px">
        <div class="text-center">
          <h2>Ready</h2>
          <p class="helper" style="margin-top:4px">Tap to mute TV + start Spotify</p>
        </div>

        <button class="mute-btn" id="start-break-btn">
          🎵 Mute Break
        </button>

        <div>
          <label>Timer preset</label>
          <div class="preset-row">
            ${presets.map(p => `
              <button class="preset-btn ${state.preset === p.value ? 'active' : ''}"
                data-preset="${p.value}">
                ${p.label}
              </button>
            `).join('')}
          </div>
        </div>
      </div>

      <div id="idle-error" class="alert" style="display:none"></div>

      <div style="display:flex;gap:8px;margin-top:auto">
        <div class="status-row" style="flex:1">
          <div class="dot ${getRokuIp() ? 'dot-ok' : 'dot-off'}"></div>
          <span class="helper">Roku: ${getRokuIp() || 'not set'}</span>
        </div>
        <div class="status-row">
          <div class="dot ${isSpotifyConnected() ? 'dot-ok' : 'dot-off'}"></div>
          <span class="helper">Spotify</span>
        </div>
      </div>
    </div>
  `;
}

function bindIdle() {
  document.getElementById('setup-link')?.addEventListener('click', () => navigate('setup'));

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.preset = Number(btn.dataset.preset);
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('start-break-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('start-break-btn');
    btn.disabled = true;
    btn.textContent = 'Starting…';
    hideError('idle-error');

    const [rokuResult, spotifyResult] = await Promise.allSettled([
      mute(),
      resumePlayback(),
    ]);

    const errors = [];

    if (rokuResult.status === 'rejected') {
      errors.push(rokuResult.reason?.message || 'Roku command failed');
    }

    if (spotifyResult.status === 'rejected') {
      const err = spotifyResult.reason;
      if (err?.reason === 'PLAYER_COMMAND_FAILED_NO_ACTIVE_DEVICE' || err?.status === 404) {
        errors.push('No active Spotify device found — open Spotify on any device first.');
      } else {
        errors.push(`Spotify: ${err?.message || 'playback failed'}`);
      }
    }

    if (errors.length) {
      showError('idle-error', errors.join('\n\n'));
      btn.disabled = false;
      btn.textContent = '🎵 Mute Break';
      return;
    }

    state.breakStart = new Date();
    state.addedMinutes = 0;
    navigate('break');
  });
}

// ── BREAK SCREEN ──────────────────────────────────────────────────────
function renderBreak() {
  const rem = remainingSeconds();
  const timeDisplay = rem === null
    ? formatTime(elapsedSeconds())
    : formatTime(rem);

  const timerLabel = rem === null
    ? 'elapsed'
    : rem === 0 ? 'break over!' : 'remaining';

  return `
    <div class="screen">
      <div class="header">
        <span class="app-name">Standby</span>
        <span class="helper">Break in progress</span>
      </div>

      <div class="countdown">
        <div class="countdown-time" id="countdown-display">${timeDisplay}</div>
        <div class="countdown-label" id="countdown-label">${timerLabel}</div>
      </div>

      <div class="quick-actions">
        ${state.preset !== 0
          ? `<button class="btn-icon" id="add-min-btn">+1 min</button>`
          : ''
        }
        <button class="btn-danger" id="restore-now-btn">Restore TV Now</button>
      </div>

      <div id="break-error" class="alert" style="display:none"></div>

      <div id="now-playing-bar" class="now-playing">
        <div class="now-playing-info">
          <div class="now-playing-track" style="color:var(--text-muted)">Loading…</div>
          <div class="now-playing-artist"></div>
        </div>
      </div>
    </div>
  `;
}

function bindBreak() {
  // Countdown timer
  updateCountdown();
  state.timerInterval = setInterval(() => {
    updateCountdown();
    // Auto-restore when timer hits zero
    const rem = remainingSeconds();
    if (rem !== null && rem <= 0) {
      clearInterval(state.timerInterval);
      restoreTV();
    }
  }, 1000);

  // Poll now-playing
  pollNowPlaying();
  state.pollInterval = setInterval(pollNowPlaying, 5000);

  // +1 min
  document.getElementById('add-min-btn')?.addEventListener('click', () => {
    state.addedMinutes += 1;
  });

  // Restore now
  document.getElementById('restore-now-btn')?.addEventListener('click', () => {
    clearIntervals();
    restoreTV();
  });
}

function updateCountdown() {
  const rem = remainingSeconds();
  const display = document.getElementById('countdown-display');
  const label   = document.getElementById('countdown-label');
  if (!display) return;

  if (rem === null) {
    display.textContent = formatTime(elapsedSeconds());
    if (label) label.textContent = 'elapsed';
  } else {
    display.textContent = formatTime(rem);
    if (label) label.textContent = rem === 0 ? 'break over!' : 'remaining';
  }
}

async function pollNowPlaying() {
  const bar = document.getElementById('now-playing-bar');
  if (!bar) return;

  try {
    const data = await getCurrentlyPlaying();
    const item = data?.item;

    if (!item) {
      bar.innerHTML = `
        <div class="now-playing-info">
          <div class="now-playing-track" style="color:var(--text-muted)">Nothing playing</div>
        </div>`;
      return;
    }

    const art = item.album?.images?.[2]?.url || item.album?.images?.[0]?.url;
    const track = item.name || 'Unknown track';
    const artists = item.artists?.map(a => a.name).join(', ') || '';

    bar.innerHTML = `
      ${art ? `<img class="now-playing-art" src="${art}" alt="Album art" />` : ''}
      <div class="now-playing-info">
        <div class="now-playing-track">${escapeHtml(track)}</div>
        <div class="now-playing-artist">${escapeHtml(artists)}</div>
      </div>`;
  } catch (err) {
    // Silently ignore polling errors (token refresh may handle it next round)
    console.warn('Now-playing poll failed:', err.message);
  }
}

async function restoreTV() {
  const restoreBtn = document.getElementById('restore-now-btn');
  if (restoreBtn) { restoreBtn.disabled = true; restoreBtn.textContent = 'Restoring…'; }
  hideError('break-error');

  const [rokuResult, spotifyResult] = await Promise.allSettled([
    unmute(),
    pausePlayback(),
  ]);

  const errors = [];
  if (rokuResult.status === 'rejected')   errors.push(`Roku: ${rokuResult.reason?.message}`);
  if (spotifyResult.status === 'rejected') errors.push(`Spotify: ${spotifyResult.reason?.message}`);

  if (errors.length) {
    // Show errors but still navigate back so user isn't stuck
    console.warn('Restore errors:', errors);
  }

  navigate('idle');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── OAuth callback handler ────────────────────────────────────────────
async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code  = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (error) {
    // User denied or something went wrong
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  if (code && state === 'standby') {
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
    try {
      await handleSpotifyCallback(code);
    } catch (err) {
      console.error('OAuth callback error:', err);
    }
  }
}

// ── Boot ──────────────────────────────────────────────────────────────
(async () => {
  await handleOAuthCallback();

  // Decide starting screen
  if (getRokuIp() && isSpotifyConnected()) {
    state.screen = 'idle';
  } else {
    state.screen = 'setup';
  }

  render();
})();
