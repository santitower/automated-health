#!/usr/bin/env bash
set -euo pipefail

source_dir="$(cd "$(dirname "$0")" && pwd)"
install_dir="$HOME/.local/share/nutriplan/instacart-agent"
unit_dir="$HOME/.config/systemd/user"
unit_file="$unit_dir/nutriplan-instacart-agent.service"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "NutriPlan needs Node.js 22 or newer. Install it from https://nodejs.org, then run this installer again." >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "NutriPlan needs Node.js 22 or newer. Your version is $(node --version)." >&2
  exit 1
fi

if ! command -v google-chrome >/dev/null 2>&1 && ! command -v google-chrome-stable >/dev/null 2>&1; then
  echo "Google Chrome is required. Install Chrome, then run this installer again." >&2
  exit 1
fi

mkdir -p "$install_dir" "$unit_dir"
rsync -a --delete --exclude node_modules --exclude .git "$source_dir/" "$install_dir/"
cd "$install_dir"
npm install --omit=dev

node_path="$(command -v node)"
cat > "$unit_file" <<UNIT
[Unit]
Description=NutriPlan Instacart Playwright agent
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$install_dir
ExecStart=$node_path $install_dir/src/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now nutriplan-instacart-agent.service
echo "NutriPlan Instacart agent installed and set to start automatically."
