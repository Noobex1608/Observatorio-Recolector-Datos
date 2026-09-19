#!/bin/bash
set -euo pipefail

# Frontend helper for Angular forms SPA.
# Usage: ./scripts/frontend.sh <start|install|build|test|check|help>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_PATH="$SCRIPT_DIR/../frontend"
COMMAND="${1:-help}"

require_bun() {
  if ! command -v bun >/dev/null 2>&1; then
    echo "Bun is required. Install it from https://bun.sh and reopen the terminal." >&2
    exit 1
  fi
}

cd "$FRONTEND_PATH"

run_script() {
  local script_name="$1"
  require_bun
  bun run "$script_name"
}

case "$COMMAND" in
  start)
    echo "Starting Angular dev server at http://localhost:4200..."
    run_script start
    ;;
  install)
    echo "Installing frontend dependencies with Bun..."
    require_bun
    bun install
    ;;
  build)
    echo "Building Angular app..."
    run_script build
    ;;
  test)
    echo "Running frontend tests..."
    run_script test
    ;;
  check)
    echo "Running Angular compile check..."
    run_script check
    ;;
  help|*)
    echo "Frontend Scripts - commands:"
    echo "  start   - Start Angular dev server"
    echo "  install - Install frontend dependencies with Bun"
    echo "  build   - Production build"
    echo "  test    - Run tests"
    echo "  check   - Development compile check"
    ;;
esac
