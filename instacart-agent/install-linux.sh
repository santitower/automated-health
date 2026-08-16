#!/usr/bin/env bash
set -euo pipefail

agent_version="0.3.0"
release_tag="instacart-agent-v$agent_version"
source_url="https://github.com/santitower/automated-health/archive/refs/tags/$release_tag.tar.gz"
install_dir="$HOME/.local/share/nutriplan/instacart-agent"
runtime_dir="$HOME/.local/share/nutriplan/runtime"
browser_dir="$HOME/.local/share/nutriplan/playwright-browsers"
unit_dir="$HOME/.config/systemd/user"
unit_file="$unit_dir/nutriplan-instacart-agent.service"
temporary_dir="$(mktemp -d /tmp/nutriplan-installer.XXXXXX)"

cleanup() {
  if [[ "$temporary_dir" == /tmp/nutriplan-installer.* ]]; then
    rm -rf "$temporary_dir"
  fi
}
trap cleanup EXIT

for tool in curl tar sha256sum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "NutriPlan needs $tool to complete its one-time installation." >&2
    exit 1
  fi
done

case "$(uname -m)" in
  x86_64) node_arch="x64" ;;
  aarch64|arm64) node_arch="arm64" ;;
  *) echo "This Linux architecture is not supported: $(uname -m)" >&2; exit 1 ;;
esac

echo "Downloading the NutriPlan Playwright companion…"
curl --fail --silent --show-error --location "$source_url" -o "$temporary_dir/source.tar.gz"
mkdir -p "$temporary_dir/source"
tar -xzf "$temporary_dir/source.tar.gz" -C "$temporary_dir/source"
source_dir="$(find "$temporary_dir/source" -mindepth 2 -maxdepth 2 -type d -name instacart-agent -print -quit)"
if [[ -z "$source_dir" || ! -f "$source_dir/package.json" ]]; then
  echo "The downloaded NutriPlan source archive is incomplete." >&2
  exit 1
fi

mkdir -p "$install_dir" "$runtime_dir" "$browser_dir" "$unit_dir"
for name in src test package.json package-lock.json README.md; do
  cp -R "$source_dir/$name" "$install_dir/"
done

echo "Downloading NutriPlan's private Node.js runtime…"
node_release="https://nodejs.org/dist/latest-v22.x"
curl --fail --silent --show-error --location "$node_release/SHASUMS256.txt" -o "$temporary_dir/SHASUMS256.txt"
node_archive="$(awk -v arch="$node_arch" '$2 ~ ("linux-" arch "\\.tar\\.xz$") { print $2; exit }' "$temporary_dir/SHASUMS256.txt")"
expected_sha="$(awk -v file="$node_archive" '$2 == file { print $1; exit }' "$temporary_dir/SHASUMS256.txt")"
if [[ -z "$node_archive" || -z "$expected_sha" ]]; then
  echo "NutriPlan could not identify the Node.js runtime download." >&2
  exit 1
fi
curl --fail --silent --show-error --location "$node_release/$node_archive" -o "$temporary_dir/$node_archive"
actual_sha="$(sha256sum "$temporary_dir/$node_archive" | awk '{ print $1 }')"
if [[ "$actual_sha" != "$expected_sha" ]]; then
  echo "The downloaded Node.js runtime failed its security checksum." >&2
  exit 1
fi

if [[ "$runtime_dir" == "$HOME/.local/share/nutriplan/runtime" ]]; then
  rm -rf "$runtime_dir"
fi
mkdir -p "$runtime_dir"
tar -xJf "$temporary_dir/$node_archive" -C "$runtime_dir" --strip-components=1

node_path="$runtime_dir/bin/node"
npm_cli="$runtime_dir/lib/node_modules/npm/bin/npm-cli.js"
export PLAYWRIGHT_BROWSERS_PATH="$browser_dir"
export PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=120000

echo "Installing the private Chromium browser…"
cd "$install_dir"
"$node_path" "$npm_cli" install --omit=dev --no-audit --no-fund
if command -v apt-get >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
  "$node_path" "$install_dir/node_modules/playwright/cli.js" install-deps chromium
fi
"$node_path" "$install_dir/node_modules/playwright/cli.js" install --no-shell chromium

cat > "$unit_file" <<UNIT
[Unit]
Description=NutriPlan Instacart Playwright agent
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$install_dir
Environment=PLAYWRIGHT_BROWSERS_PATH=$browser_dir
ExecStart=$node_path $install_dir/src/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now nutriplan-instacart-agent.service
echo "NutriPlan Instacart agent installed, running, and set to start automatically."
