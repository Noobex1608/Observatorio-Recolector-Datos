#!/bin/bash
set -euo pipefail

# Backend helper for Laravel API running in Docker.
# Usage: ./scripts/backend.sh <start|stop|logs|worker|scheduler|install|migrate|seed|migrate-fresh|migrate-fresh-seed|cache-clear|swagger|routes|tinker|help>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PATH="$SCRIPT_DIR/../backend"
IMAGE_NAME="backend-backend"
CONTAINER_NAME="observatorio-backend-dev"
WORKER_CONTAINER_NAME="observatorio-backend-worker"
SCHEDULER_CONTAINER_NAME="observatorio-backend-scheduler"
POSTGRES_CONTAINER_NAME="observatorio_db"
ENV_FILE="$BACKEND_PATH/.env"
COMPOSE_NETWORK="observatirio_default"
HOST_DB_PORT="5433"
COMMAND="${1:-help}"

cd "$BACKEND_PATH"

ensure_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    cp "$BACKEND_PATH/.env.example" "$ENV_FILE"
    echo "Created backend/.env from .env.example"
  fi
}

ensure_backend_image() {
  if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "Docker image $IMAGE_NAME not found. Building..."
    docker build -t "$IMAGE_NAME" -f Dockerfile .
  fi
}

docker_db_args() {
  local networks network

  if networks="$(docker inspect "$POSTGRES_CONTAINER_NAME" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' 2>/dev/null)" && [ -n "$networks" ]; then
    network="$(printf '%s\n' "$networks" | awk -v preferred="$COMPOSE_NETWORK" '$0 == preferred { print; found=1; exit } END { if (!found) exit 1 }')" || true
    if [ -z "$network" ]; then
      network="$(printf '%s\n' "$networks" | sed '/^$/d' | head -n 1)"
    fi

    if [ -n "$network" ]; then
      DB_HOST_VALUE="postgres"
      DB_PORT_VALUE="5432"
      DB_RUNTIME_LABEL="Docker network $network"
      DOCKER_DB_ARGS=(--network "$network")
      return
    fi
  fi

  DB_HOST_VALUE="host.docker.internal"
  DB_PORT_VALUE="$HOST_DB_PORT"
  DB_RUNTIME_LABEL="host port fallback"
  DOCKER_DB_ARGS=(--add-host=host.docker.internal:host-gateway)
}

dev_mount_args() {
  DOCKER_DEV_MOUNT_ARGS=(
    -v "$BACKEND_PATH/app:/var/www/html/app"
    -v "$BACKEND_PATH/bootstrap:/var/www/html/bootstrap"
    -v "$BACKEND_PATH/config:/var/www/html/config"
    -v "$BACKEND_PATH/database:/var/www/html/database"
    -v "$BACKEND_PATH/resources:/var/www/html/resources"
    -v "$BACKEND_PATH/routes:/var/www/html/routes"
    -v "$BACKEND_PATH/storage:/var/www/html/storage"
    -v "$BACKEND_PATH/composer.json:/var/www/html/composer.json"
    -v "$BACKEND_PATH/composer.lock:/var/www/html/composer.lock"
  )
}

run_artisan() {
  ensure_env_file
  ensure_backend_image
  docker_db_args
  dev_mount_args
  docker run --rm \
    "${DOCKER_DB_ARGS[@]}" \
    "${DOCKER_DEV_MOUNT_ARGS[@]}" \
    --env-file "$ENV_FILE" \
    -e DB_HOST="$DB_HOST_VALUE" \
    -e DB_PORT="$DB_PORT_VALUE" \
    --entrypoint php \
    "$IMAGE_NAME" artisan "$@"
}

case "$COMMAND" in
  start)
    ensure_env_file
    ensure_backend_image
    docker_db_args
    dev_mount_args
    echo "Starting Laravel API at http://127.0.0.1:8000 using DB_HOST=$DB_HOST_VALUE, DB_PORT=$DB_PORT_VALUE ($DB_RUNTIME_LABEL)..."
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker run -d \
      --name "$CONTAINER_NAME" \
      --rm \
      -p 8000:8000 \
      "${DOCKER_DB_ARGS[@]}" \
      "${DOCKER_DEV_MOUNT_ARGS[@]}" \
      --env-file "$ENV_FILE" \
      -e DB_HOST="$DB_HOST_VALUE" \
      -e DB_PORT="$DB_PORT_VALUE" \
      --entrypoint php \
      "$IMAGE_NAME" artisan serve --host=0.0.0.0 --port=8000 >/dev/null
    echo "Backend started. Use './scripts/backend.sh logs' to inspect output."
    ;;
  stop)
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm -f "$WORKER_CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm -f "$SCHEDULER_CONTAINER_NAME" >/dev/null 2>&1 || true
    echo "Backend stopped."
    ;;
  logs) docker logs -f "$CONTAINER_NAME" ;;
  worker)
    ensure_env_file
    ensure_backend_image
    docker_db_args
    dev_mount_args
    docker rm -f "$WORKER_CONTAINER_NAME" >/dev/null 2>&1 || true
    docker run -d \
      --name "$WORKER_CONTAINER_NAME" \
      --rm \
      "${DOCKER_DB_ARGS[@]}" \
      "${DOCKER_DEV_MOUNT_ARGS[@]}" \
      --env-file "$ENV_FILE" \
      -e DB_HOST="$DB_HOST_VALUE" \
      -e DB_PORT="$DB_PORT_VALUE" \
      --entrypoint php \
      "$IMAGE_NAME" artisan queue:work database --sleep=2 --tries=1 --timeout=120 >/dev/null
    echo "Worker started."
    ;;
  scheduler)
    ensure_env_file
    ensure_backend_image
    docker_db_args
    dev_mount_args
    docker rm -f "$SCHEDULER_CONTAINER_NAME" >/dev/null 2>&1 || true
    docker run -d \
      --name "$SCHEDULER_CONTAINER_NAME" \
      --rm \
      "${DOCKER_DB_ARGS[@]}" \
      "${DOCKER_DEV_MOUNT_ARGS[@]}" \
      --env-file "$ENV_FILE" \
      -e DB_HOST="$DB_HOST_VALUE" \
      -e DB_PORT="$DB_PORT_VALUE" \
      --entrypoint php \
      "$IMAGE_NAME" artisan schedule:work >/dev/null
    echo "Scheduler started."
    ;;
  install)
    ensure_env_file
    docker build -t "$IMAGE_NAME" -f Dockerfile .
    ;;
  migrate) run_artisan migrate --force ;;
  seed) run_artisan db:seed --force ;;
  migrate-fresh) run_artisan migrate:fresh --force ;;
  migrate-fresh-seed) run_artisan migrate:fresh --seed --force ;;
  cache-clear)
    run_artisan config:clear
    run_artisan cache:clear
    run_artisan route:clear
    run_artisan view:clear
    ;;
  swagger) run_artisan swagger:generate ;;
  routes) run_artisan route:list --path=api ;;
  tinker) run_artisan tinker ;;
  help|*)
    echo "Backend Scripts - commands:"
    echo "  start              - Start Laravel API in Docker"
    echo "  stop               - Stop Laravel API container"
    echo "  logs               - Follow backend logs"
    echo "  worker             - Start queue worker"
    echo "  scheduler          - Start Laravel scheduler"
    echo "  install            - Build backend Docker image"
    echo "  migrate            - Run migrations"
    echo "  seed               - Run seeders"
    echo "  migrate-fresh      - Drop and recreate database schema"
    echo "  migrate-fresh-seed - Drop, recreate and seed database"
    echo "  cache-clear        - Clear Laravel caches"
    echo "  swagger            - Generate Swagger docs"
    echo "  routes             - List API routes"
    echo "  tinker             - Start Laravel REPL"
    ;;
esac
