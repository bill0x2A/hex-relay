#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 22 or newer from https://nodejs.org/ and try again.'
  exit 1
fi
exec node scripts/launch.mjs
