#!/usr/bin/env bash
# Deploy from local machine: SSH to server, git pull, restart (or rebuild) containers.
#
# One-time setup:
#   1. Copy .env.example to .env and set DEPLOY_HOST, DEPLOY_PATH (see .env.example).
#   2. Ensure you can SSH to the server (e.g. ssh "$DEPLOY_HOST").
#
# Usage:
#   ./scripts/deploy.sh           # git pull + restart
#   ./scripts/deploy.sh --rebuild # git pull + docker compose build + up

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  source "$REPO_ROOT/.env"
  set +a
fi

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_PATH="${DEPLOY_PATH:-}"

REBUILD=false
for arg in "$@"; do
  case "$arg" in
    --rebuild|-r) REBUILD=true ;;
  esac
done

if [[ -z "$DEPLOY_HOST" ]]; then
  echo "Error: DEPLOY_HOST is not set."
  echo "  export DEPLOY_HOST=your-server   # or use an SSH alias from ~/.ssh/config"
  echo "  export DEPLOY_PATH=/path/to/relaykit-proto   # path on the remote server"
  exit 1
fi

if [[ -z "$DEPLOY_PATH" ]]; then
  echo "Error: DEPLOY_PATH is not set (path to repo on remote server)."
  echo "  export DEPLOY_PATH=/root/relaykit-proto   # example"
  exit 1
fi

echo "Deploying to $DEPLOY_HOST:$DEPLOY_PATH (rebuild=$REBUILD)"
echo ""

if [[ "$REBUILD" == true ]]; then
  ssh "$DEPLOY_HOST" "cd $DEPLOY_PATH && git pull && docker compose --profile prod up -d --build"
else
  ssh "$DEPLOY_HOST" "cd $DEPLOY_PATH && git pull && docker compose --profile prod restart"
fi

echo ""
echo "Done."
