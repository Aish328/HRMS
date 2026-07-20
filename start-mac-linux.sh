#!/bin/bash
# SEL HRMS — one-command start for Mac/Linux
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org and run this again."
  exit 1
fi

echo "[1/4] Installing server dependencies (first run only)…"
cd server
[ -d node_modules ] || npm install --no-audit --no-fund
[ -f .env ] || cp .env.example .env

if [ ! -f data/hrms.db ]; then
  echo "[2/4] Loading sample data…"
  npm run seed
else
  echo "[2/4] Existing data found — keeping it."
fi

echo "[3/4] Building the app (first run only)…"
cd ../client
[ -d node_modules ] || npm install --no-audit --no-fund
[ -d dist ] || npm run build

echo "[4/4] Starting SEL HRMS…"
echo ""
echo "  Open http://localhost:4000 in your browser."
echo "  Admin sign-in: admin@company.com / admin123"
echo "  Keep this window open. Press Ctrl+C to stop."
echo ""
cd ../server
npm start
