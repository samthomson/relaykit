#!/bin/bash
set -e

if [ -z "$OWNER_NPUB" ]; then
  echo "Error: OWNER_NPUB required"
  echo "Usage: OWNER_NPUB=your_npub ./scripts/install.sh"
  exit 1
fi

# Must be run from repo root (directory containing docker-compose.yml)
if [ ! -f docker-compose.yml ]; then
  echo "Error: Run this from the project root (directory containing docker-compose.yml)"
  exit 1
fi

if [ ! -f .env ] || ! grep -q 'JWT_SECRET=.\+' .env 2>/dev/null; then
  echo "Error: Create .env from .env.example and set JWT_SECRET"
  exit 1
fi

echo "Installing RelayKit..."
echo "Owner: $OWNER_NPUB"

docker compose up -d

echo "Waiting for Dokploy..."
until curl -sf http://localhost:3000/ > /dev/null 2>&1; do
  sleep 2
done

./scripts/setup-relaykit-auth.sh

echo ""
echo "Done. Open http://localhost:5173 and sign in with your Nostr extension."
