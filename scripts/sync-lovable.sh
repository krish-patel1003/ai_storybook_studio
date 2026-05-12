#!/usr/bin/env bash
# Usage: ./scripts/sync-lovable.sh
# Pulls latest from the Lovable repo into apps/web, preserving your local edits via merge.

set -e

LOVABLE_REPO="git@github.com:krish-patel1003/vivid-tales-lab.git"
TMP_DIR=$(mktemp -d)
WEB_DIR="$(dirname "$0")/../apps/web"

echo "→ Cloning latest Lovable code..."
git clone --depth=1 "$LOVABLE_REPO" "$TMP_DIR"

echo "→ Syncing into apps/web (preserving your local files)..."
rsync -av --delete \
  --exclude='.git' \
  "$TMP_DIR/" "$WEB_DIR/"

rm -rf "$TMP_DIR"

echo ""
echo "✓ Sync complete. Review changes with: git diff apps/web/"
echo "  Then commit: git add apps/web/ && git commit -m 'chore: sync from Lovable'"
