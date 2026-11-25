#!/usr/bin/env bash
# Build the publishable bundle from the current commit.
#
# `dist/` is the only thing that ever gets published. Because it is assembled
# from tracked files by this script, the live site is always a byte-for-byte
# copy of the commit named in dist/version.json.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

sha="$(git rev-parse HEAD)"
short="${sha:0:7}"
branch="$(git rev-parse --abbrev-ref HEAD)"
built="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
dirty="false"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  dirty="true"
  echo "warning: working tree has uncommitted changes; the bundle will not match $short" >&2
fi

rm -rf dist
mkdir -p dist
cp -R index.html css js icons media manifest.webmanifest sw.js dist/

cat > dist/version.json <<JSON
{
  "name": "Resonance Field",
  "commit": "$sha",
  "short": "$short",
  "branch": "$branch",
  "builtAt": "$built",
  "dirty": $dirty
}
JSON

echo "built dist/ from $short ($branch) at $built"
