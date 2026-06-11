#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VAULT="${OBSIDIAN_VAULT:-$HOME/obsidian}"
PLUGIN_ID="obsidian-auto-configs"
PLUGIN_DIR="$VAULT/.obsidian/plugins/$PLUGIN_ID"

cd "$ROOT"

if [[ ! -d node_modules ]]; then
	npm install
fi

npm run build

mkdir -p "$PLUGIN_DIR"
install -m 644 manifest.json styles.css main.js "$PLUGIN_DIR/"

echo "Deployed: $PLUGIN_DIR"
echo "Enable plugin in Obsidian: Settings → Community plugins → $PLUGIN_ID"
