#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$HOME/personal/openpawl"
TEST_DIR="$HOME/personal/openpawl-test-space"
BRANCH="${1:-staging}"

echo "→ run-app: branch=$BRANCH"

# 1. fresh user crews dir
echo "→ wiping ~/.openpawl/crews"
rm -rf ~/.openpawl/crews/

# 2. checkout + pull branch
cd "$REPO_DIR"
echo "→ syncing $BRANCH"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

# 3. fresh build
echo "→ rebuilding"
rm -rf dist
bun run build

# 4. verify dist preset shipped (catch Bug Z regression)
if [ ! -f dist/presets/full-stack/manifest.yaml ]; then
  echo "✗ FATAL: dist/presets/full-stack/manifest.yaml missing — build script regression"
  exit 1
fi
echo "✓ dist preset OK"

# 5. launch in test workspace
cd "$TEST_DIR"
echo "→ launching openpawl solo (Ctrl+C to exit)"
openpawl solo