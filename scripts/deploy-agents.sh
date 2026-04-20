#!/usr/bin/env bash
#
# deploy-agents.sh — one-shot deployer for the CGT agent workflow.
#
# What it does:
#   1. Verifies supabase CLI is installed and the project is linked.
#   2. Ensures ANTHROPIC_API_KEY is set as a function secret (prompts if not).
#   3. Pushes pending migrations (agent_runs/signals + pg_cron scheduler).
#   4. Deploys the three new Edge Functions.
#   5. Runs a smoke test against signal-detection with the first active asset.
#
# Usage:
#   ./scripts/deploy-agents.sh
#
# Prereqs:
#   - supabase CLI installed (brew install supabase/tap/supabase)
#   - `supabase link --project-ref <ref>` already run in this repo
#   - You are authenticated: `supabase login`
#
# Optional env overrides:
#   SKIP_MIGRATIONS=1   skip `supabase db push`
#   SKIP_SMOKE=1        skip the smoke test
#   BATCH_LIMIT=1       how many companies to include in the smoke test

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { printf "${BLUE}▸${NC} %s\n" "$*"; }
ok()    { printf "${GREEN}✓${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}!${NC} %s\n" "$*"; }
fail()  { printf "${RED}✗${NC} %s\n" "$*" >&2; exit 1; }

cd "$(dirname "$0")/.."

# --- 1. Preflight ---------------------------------------------------------

info "Checking supabase CLI"
command -v supabase >/dev/null 2>&1 || fail "supabase CLI not installed. Run: brew install supabase/tap/supabase"

if [[ ! -f supabase/.temp/project-ref ]] && [[ ! -f .supabase/project-ref ]]; then
  # The CLI stores the linked ref in ~/.supabase/ or local; this is best-effort.
  if ! supabase projects list >/dev/null 2>&1; then
    fail "supabase CLI not authenticated. Run: supabase login"
  fi
  warn "Could not locate linked project ref locally. If deploy fails, run: supabase link --project-ref <ref>"
fi

ok "supabase CLI ready"

# --- 2. Secrets -----------------------------------------------------------

info "Checking ANTHROPIC_API_KEY secret"
if supabase secrets list 2>/dev/null | grep -q '^ANTHROPIC_API_KEY'; then
  ok "ANTHROPIC_API_KEY already set"
else
  if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    supabase secrets set "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
    ok "ANTHROPIC_API_KEY set from env"
  else
    read -r -s -p "Paste ANTHROPIC_API_KEY (input hidden): " ANTHROPIC_API_KEY
    echo
    [[ -n "$ANTHROPIC_API_KEY" ]] || fail "ANTHROPIC_API_KEY is required"
    supabase secrets set "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
    ok "ANTHROPIC_API_KEY set"
  fi
fi

# --- 3. Migrations --------------------------------------------------------

if [[ "${SKIP_MIGRATIONS:-0}" == "1" ]]; then
  warn "Skipping migrations (SKIP_MIGRATIONS=1)"
else
  info "Pushing migrations (includes pg_cron scheduler)"
  supabase db push
  ok "Migrations applied"

  warn "Reminder: the scheduler needs two DB settings. Run ONCE against your DB:"
  cat <<'SQL'

  ALTER DATABASE postgres SET app.functions_base_url = 'https://<PROJECT_REF>.functions.supabase.co';
  ALTER DATABASE postgres SET app.service_role_key    = '<SERVICE_ROLE_KEY>';
  SELECT pg_reload_conf();

SQL
fi

# --- 4. Deploy functions --------------------------------------------------

info "Deploying Edge Functions: signal-detection, discovery, monthly-reevaluation"
supabase functions deploy signal-detection
supabase functions deploy discovery
supabase functions deploy monthly-reevaluation
ok "Edge Functions deployed"

# --- 5. Smoke test --------------------------------------------------------

if [[ "${SKIP_SMOKE:-0}" == "1" ]]; then
  warn "Skipping smoke test (SKIP_SMOKE=1)"
  exit 0
fi

info "Running smoke test against signal-detection (1 active company)"

# Pull project ref + anon/service key from supabase status
STATUS_JSON=$(supabase status -o json 2>/dev/null || true)
if [[ -z "$STATUS_JSON" ]]; then
  warn "Could not read `supabase status` (is this a local dev or linked remote?). Skipping smoke test."
  exit 0
fi

PROJECT_URL=$(echo "$STATUS_JSON" | awk -F'"' '/API URL/ {print $4}' | head -1)
SERVICE_KEY=$(echo "$STATUS_JSON" | awk -F'"' '/service_role/ {print $4}' | head -1)

if [[ -z "$PROJECT_URL" || -z "$SERVICE_KEY" ]]; then
  warn "Could not parse project URL or service-role key. Run smoke test manually:"
  cat <<'EOF'

  curl -X POST "$PROJECT_URL/functions/v1/signal-detection" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"company_ids":["<one-active-uuid>"],"week_label":"2026-W16"}'

EOF
  exit 0
fi

# Find one active company to test against
COMPANY_ID=$(curl -s \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  "$PROJECT_URL/rest/v1/cgt_companies?status=eq.active&select=id&limit=${BATCH_LIMIT:-1}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')

if [[ -z "$COMPANY_ID" ]]; then
  warn "No active companies found in cgt_companies. Skipping smoke test."
  exit 0
fi

WEEK_LABEL=$(date -u +"%G-W%V")
info "POSTing signal-detection with company_id=$COMPANY_ID week=$WEEK_LABEL"

RESPONSE=$(curl -s -X POST "$PROJECT_URL/functions/v1/signal-detection" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"company_ids\":[\"$COMPANY_ID\"],\"week_label\":\"$WEEK_LABEL\"}")

echo "$RESPONSE" | python3 -m json.tool || echo "$RESPONSE"

if echo "$RESPONSE" | grep -q '"status":"succeeded"\|"status":"partial"'; then
  ok "Smoke test passed. Check cgt_agent_runs + cgt_signals for the run row."
else
  warn "Smoke test did not report success. Check function logs: supabase functions logs signal-detection"
fi
