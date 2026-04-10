#!/usr/bin/env bash
# pre-human-check.sh
# Run all automated checks before handing off to human UX testing.
# If any check fails, the script exits immediately with a non-zero status.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================="
echo "  ITAMIN pre-human-check"
echo "========================================="

# 1. Backend TypeScript build
echo ""
echo "[1/5] Backend build check..."
cd "$PROJECT_ROOT/backend"
npx tsc --noEmit
echo "  ✓ Backend TypeScript OK"

# 2. Frontend lint
echo ""
echo "[2/5] Frontend lint check..."
cd "$PROJECT_ROOT/frontend"
npm run lint
echo "  ✓ Frontend lint OK"

# 3. Frontend TypeScript build
echo ""
echo "[3/5] Frontend build check..."
cd "$PROJECT_ROOT/frontend"
npx tsc --noEmit
echo "  ✓ Frontend TypeScript OK"

# 4. Frontend Vite production build
echo ""
echo "[4/5] Frontend production build..."
cd "$PROJECT_ROOT/frontend"
npm run build
echo "  ✓ Frontend build OK"

# 5. Backend unit tests (vitest)
echo ""
echo "[5/5] Backend unit tests..."
cd "$PROJECT_ROOT/backend"
npm test
echo "  ✓ Backend tests OK"

# 6. E2E tests (optional, requires Docker + local Supabase)
if docker info > /dev/null 2>&1; then
  echo ""
  echo "[6/6] E2E tests (Docker available)..."
  cd "$PROJECT_ROOT"
  bash scripts/run-e2e.sh
  echo "  ✓ E2E tests OK"
else
  echo ""
  echo "[6/6] E2E tests SKIPPED (Docker not running)"
fi

echo ""
echo "========================================="
echo "  ALL CHECKS PASSED"
echo "========================================="
