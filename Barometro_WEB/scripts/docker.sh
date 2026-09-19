#!/bin/bash
set -euo pipefail

# Docker helper for PostgreSQL.
# Usage: ./scripts/docker.sh <up|down|restart|logs|status|help>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_PATH="$SCRIPT_DIR/.."
COMMAND="${1:-help}"

cd "$ROOT_PATH"

case "$COMMAND" in
  up)
    docker-compose up -d
    ;;
  down)
    docker-compose down
    ;;
  restart)
    docker-compose restart
    ;;
  logs)
    docker-compose logs -f postgres
    ;;
  status)
    docker-compose ps
    ;;
  help|*)
    echo "Docker Scripts - commands:"
    echo "  up      - Start PostgreSQL container"
    echo "  down    - Stop PostgreSQL container"
    echo "  restart - Restart PostgreSQL container"
    echo "  logs    - Follow PostgreSQL logs"
    echo "  status  - Show container status"
    ;;
esac
