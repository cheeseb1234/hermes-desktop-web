#!/usr/bin/env bash
# web-server.patch.sh — Re-apply Hermes Desktop web page patches after updates
set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
AGENT_DIR="$HERMES_HOME/hermes-agent"

log()  { echo "[patch:web] $*"; }
error() { echo "[patch:web] ERROR: $*" >&2; }

cd "$AGENT_DIR"

# ── 1. dFib-shim.js ────────────────────────────────────────────
log "Restoring dFib-shim.js..."
SHIM_SRC="$HERMES_HOME/scripts/dFib-shim.js"
SHIM_DST="apps/desktop/public/dFib-shim.js"

if [ -f "$SHIM_SRC" ]; then
    cp "$SHIM_SRC" "$SHIM_DST"
    log "  dFib-shim.js restored from golden copy"
    # Also copy to desktop-web-dist so it's served immediately
    cp "$SHIM_SRC" "hermes_cli/desktop-web-dist/dFib-shim.js" 2>/dev/null || true
else
    # Fallback: try in-repo copy (fresh install scenario)
    SHIM_FALLBACK="patch-scripts/dFib-shim.js"
    if [ -f "$SHIM_FALLBACK" ]; then
        cp "$SHIM_FALLBACK" "$SHIM_DST"
        log "  dFib-shim.js restored from patch-scripts (fallback)"
    else
        error "  dFib-shim.js not found at $SHIM_SRC or $SHIM_FALLBACK — skipping"
    fi
fi

# ── 2. Rebuild desktop-web-dist ─────────────────────────────────
log "Rebuilding desktop-web-dist..."
cd apps/desktop
npm run build:web 2>&1 | tail -3
cd "$AGENT_DIR"

# ── 3. web_server.py mount_desktop_web ──────────────────────────
log "Patching web_server.py..."
WEB_SERVER="hermes_cli/web_server.py"

if grep -q "_mount_desktop_web(app)" "$WEB_SERVER" 2>/dev/null; then
    log "  mount_desktop_web already present"
else
    log "  Injecting _mount_desktop_web call..."
    sed -i '/mount_spa(spa_app, prefix="\/dash-v1")/a_mount_desktop_web(app)' "$WEB_SERVER"

    if ! grep -q "def _mount_desktop_web" "$WEB_SERVER" 2>/dev/null; then
        log "  Adding _mount_desktop_web function..."
        # Insert before mount_spa's def
        sed -i '/^def mount_spa/i\
DIST = (Path(__file__).parent \/ "desktop-web-dist").resolve()\
\
\
def _mount_desktop_web(app):\
    dist = DIST\
    if not dist.is_dir():\
        return\
    spa_app = FastAPI()\
    spa_app.mount("/", StaticFiles(directory=str(dist), html=True), name="desktop_web")\
    app.mount("/", spa_app)\
    log.info("desktop_web: served at /")' "$WEB_SERVER"
    fi
    log "  web_server.py patched"
fi

log "All patches applied successfully"
