#!/usr/bin/env bash
# setup.sh — Install Hermes Desktop Web patches
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; }

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
AGENT_DIR="$HERMES_HOME/hermes-agent"
SCRIPTS_DIR="$HERMES_HOME/scripts"

# Validate Hermes installation
if [ ! -d "$AGENT_DIR" ]; then
    error "Hermes agent not found at $AGENT_DIR"
    error "Run 'hermes setup' first"
    exit 1
fi

# 1. Place golden copies outside the repo (survives updates)
info "Installing golden copies to $SCRIPTS_DIR"
mkdir -p "$SCRIPTS_DIR"
cp dFib-shim.js "$SCRIPTS_DIR/dFib-shim.js"
cp web-server.patch.sh "$SCRIPTS_DIR/web-server.patch.sh"
chmod +x "$SCRIPTS_DIR/web-server.patch.sh"

# 2. Copy to app source
info "Copying dFib-shim to app source"
cp "$SCRIPTS_DIR/dFib-shim.js" "$AGENT_DIR/apps/desktop/public/dFib-shim.js"

# 3. Rebuild desktop-web-dist
info "Rebuilding desktop-web-dist (this may take a moment)..."
cd "$AGENT_DIR/apps/desktop"
npm run build:web 2>&1 | tail -3
cd "$OLDPWD"

# 4. Copy shim into built output
cp "$SCRIPTS_DIR/dFib-shim.js" "$AGENT_DIR/hermes_cli/desktop-web-dist/dFib-shim.js"

# 5. Apply web_server.py patches
info "Applying web_server.py patches..."
bash "$SCRIPTS_DIR/web-server.patch.sh"

# 6. Update systemd service to survive updates
SERVICE_FILE="$HOME/.config/systemd/user/hermes-dashboard.service"
if [ -f "$SERVICE_FILE" ]; then
    # Check if ExecStartPre already points to scripts/
    if grep -q "ExecStartPre.*scripts/web-server.patch.sh" "$SERVICE_FILE" 2>/dev/null; then
        info "systemd ExecStartPre already correct"
    else
        warn "Updating systemd service..."
        # Replace in-repo path with outside-repo path
        sed -i 's|ExecStartPre=.*patch-scripts/web-server.patch.sh|ExecStartPre='"$SCRIPTS_DIR"'/web-server.patch.sh|g' "$SERVICE_FILE"
        systemctl --user daemon-reload
        info "systemd service updated"
    fi
else
    warn "systemd service not found — you may need to configure manually"
fi

# 7. Restart dashboard
info "Restarting Hermes dashboard..."
systemctl --user restart hermes-dashboard.service 2>/dev/null || {
    warn "Could not restart via systemd — restart manually"
}

info "Setup complete!"
info "Open http://$(hostname -I | awk '{print $1}'):9119/ in your browser"
