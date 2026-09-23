#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME=${1:-jpa-test-db}
POSTGRES_USER=${2:-jpa}
POSTGRES_PASSWORD=${3:-pass}
POSTGRES_DB=${4:-jpa}
IMAGE=${5:-postgres:15}

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found; please install Docker or run this script on a machine with Docker." >&2
  exit 1
fi

if [ "$(docker ps -a --format '{{.Names}}' | grep -x "$CONTAINER_NAME" || true)" = "" ]; then
  docker run --name "$CONTAINER_NAME" -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" -e POSTGRES_USER="$POSTGRES_USER" -e POSTGRES_DB="$POSTGRES_DB" -p 5432:5432 -d "$IMAGE"
else
  if [ "$(docker ps --format '{{.Names}}' | grep -x "$CONTAINER_NAME" || true)" = "" ]; then
    docker start "$CONTAINER_NAME"
  fi
fi

echo "Waiting for Postgres to accept connections..."
for i in $(seq 1 30); do
  if docker exec -i "$CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; then
    echo "Postgres ready"
    break
  fi
  sleep 1
done

echo "Applying migrations..."
for f in lib/db/migrations/*.sql; do
  echo "Applying $f"
  cat "$f" | docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
done

echo "Migrations applied. Export DATABASE_URL like:"
echo "export DATABASE_URL=postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$POSTGRES_DB"
