# Hermes Desktop Web

Serve the [Hermes Agent](https://github.com/NousResearch/hermes-agent) Electron Desktop SPA as a web page in your browser — no VNC needed, no Electron binary required.

## What This Does

The Hermes Desktop app is an Electron app by default. This project adds a **browser-mode shim** and **server-side patches** so the full desktop SPA (chat, session management, settings, tools, file browser, model config, cron, etc.) works at `http://your-host:9119/` in any browser.

## How It Works

```
┌─────────────────────────────────────────────┐
│                  Browser                     │
│  http://hermesarch:9119/                    │
├─────────────────────────────────────────────┤
│              dFib-shim.js                    │
│  • Stubs 60+ Electron APIs (window.*)        │
│  • Provides fetch-based api() client         │
│  • Injects Bearer auth from session token    │
│  • Routes gateway WS to dashboard endpoint   │
├─────────────────────────────────────────────┤
│           Hermes Dashboard Server            │
│  (web_server.py + patch)                    │
├─────────────────────────────────────────────┤
│              Hermes Gateway                  │
│  (WebSocket at /api/ws)                     │
└─────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|---|---|
| `dFib-shim.js` | Browser-mode Electron API shim (60+ stubs) |
| `web-server.patch.sh` | Patch script for dashboard web_server.py |
| `hermes-desktop-web.plugin.sh` | Hermes plugin for one-command install |
| `setup.sh` | Standalone install script |

## Installation

### Option 1: Manual

```bash
# 1. Copy the dFib-shim into the desktop SPA
cp dFib-shim.js ~/.hermes/hermes-agent/apps/desktop/public/dFib-shim.js

# 2. Rebuild the desktop-web-dist
cd ~/.hermes/hermes-agent/apps/desktop && npm run build:web

# 3. Copy the shim to the built output
cp dFib-shim.js ~/.hermes/hermes-agent/hermes_cli/desktop-web-dist/dFib-shim.js

# 4. Patch web_server.py to serve desktop SPA at /
#    (See web-server.patch.sh for details)

# 5. Restart dashboard
systemctl --user restart hermes-dashboard
```

### Option 2: Patch Script (Recommended)

```bash
chmod +x web-server.patch.sh
./web-server.patch.sh
```

### Option 3: Automatic via systemd (Survives Updates)

```bash
# Copy patch script outside the repository (survives hermes update)
cp web-server.patch.sh ~/.hermes/scripts/
cp dFib-shim.js ~/.hermes/scripts/

# Add to systemd service
systemctl --user edit --full hermes-dashboard.service
# Add: ExecStartPre=/home/YOU/.hermes/scripts/web-server.patch.sh
```

## Survival After `hermes update`

The golden copies in `~/.hermes/scripts/` survive updates because they're **outside** the `hermes-agent` repository. The systemd `ExecStartPre` re-applies patches automatically on every dashboard start.

## Compatibility

- Built for **Hermes ~0.16.0** (June 2026)
- Tested with **deepseek-v4-flash** and Anthropic models
- Dashboard must run with `--insecure` flag (trusted LAN mode)

## Key Architecture Decisions

- **Bearer token auth**: The dashboard REST API expects `Authorization: Bearer <token>` — the shim's `api()` function reads `window.__HERMES_SESSION_TOKEN__` and injects it in every fetch.
- **Gateway WebSocket**: Connected via `ws://host:9119/api/ws?token=<token>` — the shim constructs the URL from the dashboard's injected token.
- **Bootstrap state shape**: `getBootstrapState()` must return the full bootstrap state object (not just platform metadata) to avoid React state being replaced with a partial object.

## License

MIT
