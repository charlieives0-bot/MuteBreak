// ── Roku ECP (External Control Protocol) ───────────────────────────
// Roku ECP runs on port 8060 over HTTP on the local network.
// Browsers block cross-origin requests, but since we're hitting a local
// IP (not https://api.spotify.com), CORS headers depend on Roku firmware.
// Most modern Roku devices DO respond to ECP without CORS issues when
// accessed from the same local network. If you hit CORS errors, see README.

export function getRokuIp() {
  return localStorage.getItem('roku_ip') || '';
}

export function setRokuIp(ip) {
  localStorage.setItem('roku_ip', ip.trim());
}

function rokuUrl(ip, path) {
  // Normalise: strip trailing slash, ensure no double slashes
  const base = `http://${ip.trim().replace(/\/$/, '')}:8060`;
  return `${base}${path}`;
}

/**
 * Send an ECP keypress command.
 * Returns { ok: true } or throws with a descriptive message.
 */
export async function sendKeypress(key) {
  const ip = getRokuIp();
  if (!ip) throw new Error('Roku IP not configured. Go to Setup.');

  const url = rokuUrl(ip, `/keypress/${key}`);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      // ECP expects no body for keypress
      headers: { 'Content-Length': '0' },
    });
  } catch (err) {
    // Network-level failure (device unreachable, CORS, etc.)
    throw new Error(
      `Cannot reach Roku at ${ip}:8060. ` +
      `Check the IP and make sure you're on the same network. (${err.message})`
    );
  }

  if (!res.ok) {
    throw new Error(`Roku ECP returned ${res.status} for keypress/${key}`);
  }

  return { ok: true };
}

export async function mute()   { return sendKeypress('VolumeMute'); }
export async function unmute() { return sendKeypress('VolumeMute'); } // same toggle

/**
 * Ping the Roku device info endpoint to verify connectivity.
 * Returns device info XML text or throws.
 */
export async function pingRoku(ip) {
  if (!ip) throw new Error('No IP provided');

  const url = rokuUrl(ip, '/query/device-info');

  let res;
  try {
    res = await fetch(url, { method: 'GET' });
  } catch (err) {
    throw new Error(`Cannot reach Roku at ${ip}:8060 — ${err.message}`);
  }

  if (!res.ok) throw new Error(`Roku returned ${res.status}`);
  return res.text();
}
