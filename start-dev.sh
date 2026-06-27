#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

RESET_MOCK_DATA="false"
if [[ "${1:-}" == "--reset-mock-data" ]]; then
  RESET_MOCK_DATA="true"
fi

run_step() {
  local name="$1"
  shift
  echo
  echo "==> ${name}"
  "$@"
}

stop_port_processes() {
  local port="$1"
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser "$port"/tcp 2>/dev/null || true)"
  fi

  if [[ -n "$pids" ]]; then
    echo "Stopping existing process(es) on port ${port}: ${pids}"
    kill $pids 2>/dev/null || true
  fi
}

if [[ ! -d node_modules ]]; then
  run_step "Install npm dependencies" npm install
else
  echo "node_modules exists, skipping npm install."
fi

run_step "Start local PostgreSQL Docker container" npm run db:dev:up
run_step "Deploy Prisma migrations" npm run prisma:migrate:deploy
echo
echo "==> Stop existing dev servers on ports 3000 and 5173"
stop_port_processes 3000
stop_port_processes 5173

if [[ "$RESET_MOCK_DATA" == "true" ]]; then
  run_step "Reset local dev DB" npm run db:dev:reset
  run_step "Seed mock data" npm run db:seed:mock
else
  run_step "Bootstrap admin account without resetting data" npm run db:bootstrap
fi

echo
echo "==> Start API and Web dev servers"
echo "API: http://127.0.0.1:3000/api/v1/me"
echo "Web: http://127.0.0.1:5173"
echo
echo "Default admin login:"
echo "  username: admin"
echo "  password: admin-dev-password"
echo
echo "Use './start-dev.sh --reset-mock-data' to reset and reseed local mock data."
echo

npm run api:dev &
API_PID=$!
npm run web:dev -- --host 127.0.0.1 &
WEB_PID=$!

cleanup() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM
wait
