#!/bin/bash
set -e

echo "RelayKit Auth Setup"
echo "==================="

DOKPLOY_BASE_URL="${DOKPLOY_BASE_URL:-http://localhost:3020}"

# Get owner npub
if [ -z "$OWNER_NPUB" ]; then
  echo "Error: OWNER_NPUB environment variable not set"
  echo "Usage: OWNER_NPUB=your_nostr_pubkey ADMIN_PASSWORD=your_password ./scripts/setup-relaykit-auth.sh"
  exit 1
fi

echo "Owner npub: $OWNER_NPUB"

# Wait for Dokploy to be ready
echo "Waiting for Dokploy to be ready..."
until curl -sf "$DOKPLOY_BASE_URL/" > /dev/null 2>&1; do
  echo "  Waiting for Dokploy..."
  sleep 2
done
echo "✓ Dokploy is ready"

# Try to detect which relaykit service is actually running (prefer dev locally).
if docker compose ps --status running --services | grep -qx "relaykit-dev"; then
  RELAYKIT_SERVICE="relaykit-dev"
elif docker compose ps --status running --services | grep -qx "relaykit-prod"; then
  RELAYKIT_SERVICE="relaykit-prod"
else
  echo "Error: No running relaykit service found."
  echo "Start one first, e.g. docker compose --profile dev up -d relaykit-dev"
  exit 1
fi

echo "Using service: $RELAYKIT_SERVICE"

# Reuse existing key if setup was already done previously.
BOOTSTRAP_KEY=$(docker compose exec -T "$RELAYKIT_SERVICE" sh -lc "cat /app/.relaykit/bootstrap-key 2>/dev/null || true" | tr -d '\r\n')

if [ -z "$BOOTSTRAP_KEY" ]; then
  # Get admin password only when initial bootstrap is needed.
  if [ -z "$ADMIN_PASSWORD" ]; then
    echo "Error: ADMIN_PASSWORD environment variable not set"
    echo "Usage: OWNER_NPUB=your_nostr_pubkey ADMIN_PASSWORD=your_password ./scripts/setup-relaykit-auth.sh"
    exit 1
  fi

  # Use provided credentials
  SYSTEM_EMAIL="system@relaykit.local"
  SYSTEM_PASSWORD="$ADMIN_PASSWORD"

  echo "Creating RelayKit system account in Dokploy..."

  # Register via Better-Auth endpoint
  REGISTER_RESPONSE=$(curl -s -X POST "$DOKPLOY_BASE_URL/api/auth/sign-up/email" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$SYSTEM_EMAIL\",\"password\":\"$SYSTEM_PASSWORD\",\"name\":\"System\",\"lastName\":\"User\"}" \
    2>&1)

  if echo "$REGISTER_RESPONSE" | grep -qiE "error"; then
    echo "⚠ Registration failed: $REGISTER_RESPONSE"
    exit 1
  fi

  echo "✓ System account created"
  echo "Email: $SYSTEM_EMAIL"
  echo "Password: $SYSTEM_PASSWORD"
  echo ""

  # Promote user to admin
  echo "Promoting user to admin..."
  docker compose exec -T dokploy-postgres psql -U dokploy -d dokploy -c "UPDATE \"user\" SET role = 'admin' WHERE email = '$SYSTEM_EMAIL';" > /dev/null 2>&1
  echo "✓ User promoted to admin"

  # Run browser automation to generate API key
  echo ""
  echo "Automating API key generation via browser..."
  docker compose exec -T -e SYSTEM_EMAIL="$SYSTEM_EMAIL" -e SYSTEM_PASSWORD="$SYSTEM_PASSWORD" -e OWNER_NPUB="$OWNER_NPUB" "$RELAYKIT_SERVICE" node /app/scripts/automate-dokploy-setup.js

  BOOTSTRAP_KEY=$(docker compose exec -T "$RELAYKIT_SERVICE" sh -lc "cat /app/.relaykit/bootstrap-key" | tr -d '\r\n')
else
  echo "✓ Reusing existing RelayKit bootstrap key"
fi

if [ -z "$BOOTSTRAP_KEY" ]; then
  echo "Error: Could not read bootstrap key from RelayKit container"
  exit 1
fi

echo ""
echo "✓ RelayKit setup complete"
