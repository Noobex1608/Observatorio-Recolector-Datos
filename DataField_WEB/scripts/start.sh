#!/bin/bash
set -euo pipefail

# Observatorio Forms Platform - development orchestrator
# Usage: ./scripts/start.sh <all|docker|backend|frontend|install|setup|stop|restart|migrate|clean|build|check|help>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMAND="${1:-help}"

run_script() {
  local script="$1"
  local arg="$2"
  bash "$SCRIPT_DIR/$script" "$arg"
}

show_help() {
  echo "Observatorio Forms Platform - commands:"
  echo "  all      - Start PostgreSQL, Laravel API and Angular SPA"
  echo "  docker   - Start PostgreSQL only"
  echo "  backend  - Start Laravel API in Docker"
  echo "  frontend - Start Angular dev server"
  echo "  install  - Install backend/frontend dependencies"
  echo "  setup    - Install dependencies, migrate and seed"
  echo "  stop     - Stop backend container and PostgreSQL"
  echo "  restart  - Stop then start all services"
  echo "  migrate  - Run Laravel migrations"
  echo "  clean    - Clear Laravel caches"
  echo "  build    - Build Angular app"
  echo "  check    - Run Angular compile check"
  echo ""
  echo "URLs:"
  echo "  Frontend: http://localhost:4200"
  echo "  API:      http://localhost:8000/api"
  echo "  Swagger:  http://localhost:8000/api/docs"
}

case "$COMMAND" in
  all)
    run_script docker.sh up
    run_script backend.sh start
    run_script frontend.sh start
    ;;
  docker) run_script docker.sh up ;;
  backend) run_script backend.sh start ;;
  frontend) run_script frontend.sh start ;;
  install) bash "$SCRIPT_DIR/install.sh" ;;
  setup)
    bash "$SCRIPT_DIR/install.sh"
    run_script backend.sh migrate-fresh-seed
    ;;
  stop)
    run_script backend.sh stop
    run_script docker.sh down
    ;;
  restart)
    run_script backend.sh stop
    run_script docker.sh restart
    run_script backend.sh start
    run_script frontend.sh start
    ;;
  migrate) run_script backend.sh migrate ;;
  clean) run_script backend.sh cache-clear ;;
  build) run_script frontend.sh build ;;
  check) run_script frontend.sh check ;;
  help|*) show_help ;;
esac
