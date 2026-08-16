#!/bin/bash
set -euo pipefail

source_dir="$(cd "$(dirname "$0")" && pwd)"
install_dir="$HOME/Library/Application Support/NutriPlan/instacart-agent"
runtime_dir="$HOME/Library/Application Support/NutriPlan/runtime"
browser_dir="$HOME/Library/Application Support/NutriPlan/playwright-browsers"
log_dir="$HOME/Library/Logs/NutriPlan"
plist="$HOME/Library/LaunchAgents/app.nutriplan.instacart-agent.plist"
temporary_dir="$(mktemp -d /tmp/nutriplan-installer.XXXXXX)"

finish() {
  if [[ "$temporary_dir" == /tmp/nutriplan-installer.* ]]; then
    rm -rf "$temporary_dir"
  fi
}
trap finish EXIT

case "$(uname -m)" in
  arm64) node_arch="arm64" ;;
  x86_64) node_arch="x64" ;;
  *) echo "NutriPlan does not support this Mac architecture."; read -r -p "Press Return to close."; exit 1 ;;
esac

echo "Downloading NutriPlan's private Node.js runtime…"
node_release="https://nodejs.org/dist/latest-v22.x"
curl --fail --silent --show-error --location "$node_release/SHASUMS256.txt" -o "$temporary_dir/SHASUMS256.txt"
node_archive="$(awk -v arch="$node_arch" '$2 ~ ("darwin-" arch "\\.tar\\.gz$") { print $2; exit }' "$temporary_dir/SHASUMS256.txt")"
expected_sha="$(awk -v file="$node_archive" '$2 == file { print $1; exit }' "$temporary_dir/SHASUMS256.txt")"
if [[ -z "$node_archive" || -z "$expected_sha" ]]; then
  echo "NutriPlan could not identify the Node.js runtime download."
  read -r -p "Press Return to close."
  exit 1
fi
curl --fail --silent --show-error --location "$node_release/$node_archive" -o "$temporary_dir/$node_archive"
actual_sha="$(shasum -a 256 "$temporary_dir/$node_archive" | awk '{ print $1 }')"
if [[ -z "$expected_sha" || "$actual_sha" != "$expected_sha" ]]; then
  echo "The downloaded Node.js runtime failed its security checksum."
  read -r -p "Press Return to close."
  exit 1
fi

mkdir -p "$install_dir" "$browser_dir" "$log_dir" "$(dirname "$plist")"
rsync -a --delete --exclude node_modules --exclude dist --exclude .git "$source_dir/" "$install_dir/"
if [[ "$runtime_dir" == "$HOME/Library/Application Support/NutriPlan/runtime" ]]; then
  rm -rf "$runtime_dir"
fi
mkdir -p "$runtime_dir"
tar -xzf "$temporary_dir/$node_archive" -C "$runtime_dir" --strip-components=1

node_path="$runtime_dir/bin/node"
npm_cli="$runtime_dir/lib/node_modules/npm/bin/npm-cli.js"
export PLAYWRIGHT_BROWSERS_PATH="$browser_dir"
export PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=120000

echo "Installing the Playwright companion and its private Chromium browser…"
cd "$install_dir"
"$node_path" "$npm_cli" install --omit=dev --no-audit --no-fund
"$node_path" "$install_dir/node_modules/playwright/cli.js" install --no-shell chromium

cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>app.nutriplan.instacart-agent</string>
  <key>ProgramArguments</key>
  <array><string>$node_path</string><string>$install_dir/src/server.js</string></array>
  <key>WorkingDirectory</key><string>$install_dir</string>
  <key>EnvironmentVariables</key>
  <dict><key>PLAYWRIGHT_BROWSERS_PATH</key><string>$browser_dir</string></dict>
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

echo "NutriPlan Instacart agent installed, running, and set to start automatically."
echo "Return to NutriPlan and retry the connection."
read -r -p "Press Return to close."
