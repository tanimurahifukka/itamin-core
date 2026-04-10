#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================="
echo "  ITAMIN E2E Test Runner"
echo "========================================="

# 1. Docker check
echo ""
echo "[1/5] Checking Docker..."
if ! docker info > /dev/null 2>&1; then
  echo "  ✗ Docker is not running. Please start Docker Desktop first."
  exit 1
fi
echo "  ✓ Docker is running"

# 2. Start local Supabase
echo ""
echo "[2/5] Starting local Supabase..."
cd "$PROJECT_ROOT"
if curl -s http://127.0.0.1:54321/rest/v1/ > /dev/null 2>&1; then
  echo "  ✓ Supabase already running"
else
  npx supabase start
  echo "  ✓ Supabase started"
fi

# 3. Get Supabase service role key
echo ""
echo "[3/5] Getting Supabase credentials..."
SUPABASE_URL="http://127.0.0.1:54321"
SERVICE_KEY=$(npx supabase status --output json 2>/dev/null | grep -o '"service_role_key":"[^"]*"' | cut -d'"' -f4)
if [ -z "$SERVICE_KEY" ]; then
  SERVICE_KEY=$(npx supabase status 2>/dev/null | grep "service_role key" | awk '{print $NF}')
fi
if [ -z "$SERVICE_KEY" ]; then
  echo "  ✗ Could not get service role key. Run 'npx supabase status' manually."
  exit 1
fi
echo "  ✓ Credentials obtained"

# 4. Apply migrations
echo ""
echo "[4/5] Applying migrations..."
cd "$PROJECT_ROOT"
npx supabase db reset --local 2>&1 || true
echo "  ✓ Migrations applied"

# 5. Run E2E tests
echo ""
echo "[5/5] Running Playwright E2E tests..."
cd "$PROJECT_ROOT/frontend"
TEST_SUPABASE_URL="$SUPABASE_URL" \
TEST_SUPABASE_SERVICE_KEY="$SERVICE_KEY" \
npx playwright test --reporter=list

echo ""
echo "========================================="
echo "  E2E TESTS COMPLETE"
echo "========================================="
