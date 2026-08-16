#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "NutriPlan needs Node.js 22 or newer. Install it from https://nodejs.org, then open this file again."
  read -r -p "Press Return to close."
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "NutriPlan needs Node.js 22 or newer. Your version is $(node --version)."
  read -r -p "Press Return to close."
  exit 1
fi

echo "Preparing the NutriPlan Instacart agent…"
npm install --omit=dev
echo "Starting the private agent on this Mac. Keep this window open while building a cart."
npm run serve
