#!/bin/bash
set -e

if [ -z "$OWNER_NPUB" ]; then
  echo "Error: OWNER_NPUB required"
  echo "Usage: OWNER_NPUB=your_npub ./scripts/install.sh"
  exit 1
fi

echo "Installing RelayKit..."
echo "Owner: $OWNER_NPUB"

# Start containers
docker compose -f docker-compose.prod.yml up -d

# Wait for Dokploy
echo "Waiting for Dokploy..."
until curl -sf http://localhost:3000/ > /dev/null 2>&1; do
  sleep 2
done

# Setup auth (creates Dokploy account, generates API key, stores owner npub)
OWNER_NPUB=$OWNER_NPUB ./scripts/setup-relaykit-auth.sh

echo ""
echo "✅ RelayKit installed!"
echo "Access at http://localhost:5173"
