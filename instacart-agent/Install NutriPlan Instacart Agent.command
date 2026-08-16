#!/bin/bash
set -euo pipefail

source_dir="$(cd "$(dirname "$0")" && pwd)"
install_dir="$HOME/Library/Application Support/NutriPlan/instacart-agent"
log_dir="$HOME/Library/Logs/NutriPlan"
plist="$HOME/Library/LaunchAgents/app.nutriplan.instacart-agent.plist"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "NutriPlan needs Node.js 22 or newer. Install it from https://nodejs.org, then run this installer again."
  read -r -p "Press Return to close."
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "NutriPlan needs Node.js 22 or newer. Your version is $(node --version)."
  read -r -p "Press Return to close."
  exit 1
fi

if [ ! -d "/Applications/Google Chrome.app" ]; then
  echo "Google Chrome is required. Install Chrome, then run this installer again."
  read -r -p "Press Return to close."
  exit 1
fi

echo "Installing the private NutriPlan agent for this Mac…"
mkdir -p "$install_dir" "$log_dir" "$(dirname "$plist")"
rsync -a --delete --exclude node_modules --exclude .git "$source_dir/" "$install_dir/"
cd "$install_dir"
npm install --omit=dev

node_path="$(command -v node)"
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>app.nutriplan.instacart-agent</string>
  <key>ProgramArguments</key>
  <array><string>$node_path</string><string>$install_dir/src/server.js</string></array>
  <key>WorkingDirectory</key><string>$install_dir</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$log_dir/instacart-agent.log</string>
  <key>StandardErrorPath</key><string>$log_dir/instacart-agent-error.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "$plist" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$plist"
launchctl kickstart -k "gui/$(id -u)/app.nutriplan.instacart-agent"

echo "NutriPlan Instacart agent installed and set to start automatically."
echo "Return to NutriPlan and retry the connection."
read -r -p "Press Return to close."
