#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
agent_dir="$(cd "$script_dir/../.." && pwd)"
version="$(node -p "JSON.parse(require('fs').readFileSync('$agent_dir/package.json', 'utf8')).version")"
output="${1:-$agent_dir/dist/NutriPlan-Instacart-Agent-v$version.pkg}"
temporary_dir="$(mktemp -d /tmp/nutriplan-pkg.XXXXXX)"

cleanup() {
  if [[ "$temporary_dir" == /tmp/nutriplan-pkg.* ]]; then
    rm -rf "$temporary_dir"
  fi
}
trap cleanup EXIT

payload_agent="$temporary_dir/payload/Library/Application Support/NutriPlan/instacart-agent"
mkdir -p "$payload_agent" "$(dirname "$output")"
rsync -am \
  --exclude .git \
  --exclude dist \
  --exclude node_modules \
  "$agent_dir/" "$payload_agent/"
xattr -cr "$temporary_dir/payload"

COPYFILE_DISABLE=1 pkgbuild \
  --root "$temporary_dir/payload" \
  --scripts "$script_dir/scripts" \
  --identifier "app.nutriplan.instacart-agent" \
  --version "$version" \
  --install-location / \
  "$output"

echo "$output"
