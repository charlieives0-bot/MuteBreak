# Standby

A web app that simultaneously mutes your Roku TV and starts Spotify when you need a quick break.

## How it works

1. **Mute Break** — mutes the Roku via ECP + resumes Spotify playback
2. **Restore TV** — unmutes the Roku + pauses Spotify
3. Countdown timer with presets (2 min, 5 min, Manual)
4. Live now-playing bar polls Spotify every 5 seconds

## Setup

### 1. Roku IP

Find it on your Roku: **Settings → Network → About → IP address**

### 2. Spotify

Click **Connect Spotify** on the setup screen. The Spotify Client ID is already baked in — no developer account needed.

### 3. Serve the app

The app uses ES modules so it needs an HTTP server (not `file://`).

```bash
# Option 1: Python
python3 -m http.server 5173

# Option 2: Node
npx serve . -p 5173

# Option 3: Vite
npx vite
```

Open `http://localhost:5173` and complete the setup screen.

## CORS note

Roku ECP is HTTP on your local network. Modern browsers may block cross-origin
requests to local IPs. If you get CORS errors:

- Try using `http://` (not `https://`) to serve the app — mixed-content rules don't apply
- On Chrome: launch with `--disable-web-security` flag for local testing only
- Or run a tiny local proxy (see below)

### Quick CORS proxy (optional)

```bash
# Install cors-anywhere
npm install -g local-cors-proxy
lcp --proxyUrl http://YOUR_ROKU_IP:8060 --port 8010
```

Then change the Roku IP in setup to `localhost:8010` and update `roku.js` to skip the port.

## Files

```
index.html   — HTML shell
styles.css   — Dark theme styles
app.js       — App logic, screen routing, UI binding
spotify.js   — Spotify PKCE OAuth + API calls (Client ID hardcoded)
roku.js      — Roku ECP keypress commands
```
