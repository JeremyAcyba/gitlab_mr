#!/usr/bin/env bash
# Builds the archive to upload to the Chrome Web Store.
set -euo pipefail

cd "$(dirname "$0")"

version=$(node -p "require('./manifest.json').version")
output="packages/gitlab-mr-tools-${version}.zip"

mkdir -p packages
rm -f "$output"

# Only what the extension actually needs at runtime.
zip -r "$output" manifest.json src images \
    --exclude '*.DS_Store' '*/.*'

echo "Built $output"
