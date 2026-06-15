#!/usr/bin/env bash
# Hermes Plugin: hermes-desktop-web
# Install with: hermes plugins install ./hermes-desktop-web.plugin.sh
# Description: Browser-mode shim for Hermes Desktop SPA

hermes_plugin_install() {
    echo "Installing Hermes Desktop Web..."
    SRC_DIR="$(dirname "${BASH_SOURCE[0]}")"
    cp "$SRC_DIR/dFib-shim.js" "$HERMES_HOME/scripts/dFib-shim.js"
    cp "$SRC_DIR/setup.sh" "$HERMES_HOME/scripts/setup-desktop-web.sh"
    bash "$SRC_DIR/setup.sh"
}

hermes_plugin_uninstall() {
    echo "Removing Hermes Desktop Web..."
    rm -f "$HERMES_HOME/scripts/dFib-shim.js"
    rm -f "$HERMES_HOME/scripts/web-server.patch.sh"
    echo "To complete uninstall, remove the ExecStartPre from systemd service"
}

hermes_plugin_update() {
    echo "Updating Hermes Desktop Web..."
    hermes_plugin_install
}
