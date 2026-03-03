#!/bin/bash
set -e

echo "RelayKit Auth Setup"
echo "==================="

# Get owner npub
if [ -z "$OWNER_NPUB" ]; then
  echo "Error: OWNER_NPUB environment variable not set"
  echo "Usage: OWNER_NPUB=your_nostr_pubkey ./scripts/setup-relaykit-auth.sh"
  exit 1
fi

echo "Owner npub: $OWNER_NPUB"

# Wait for Dokploy to be ready
echo "Waiting for Dokploy to be ready..."
until curl -sf http://localhost:3000/ > /dev/null 2>&1; do
  echo "  Waiting for Dokploy..."
  sleep 2
done
echo "✓ Dokploy is ready"

# Generate system credentials
SYSTEM_EMAIL="system@relaykit.local"
SYSTEM_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

echo "Creating RelayKit system account in Dokploy..."

# Register via Better-Auth endpoint
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/sign-up/email \
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
# Try to detect which relaykit service is running
if docker compose ps relaykit-prod >/dev/null 2>&1; then
  RELAYKIT_SERVICE="relaykit-prod"
elif docker compose ps relaykit-dev >/dev/null 2>&1; then
  RELAYKIT_SERVICE="relaykit-dev"
else
  echo "Error: No relaykit service found running"
  exit 1
fi

echo "Using service: $RELAYKIT_SERVICE"
docker compose exec -T -e SYSTEM_EMAIL="$SYSTEM_EMAIL" -e SYSTEM_PASSWORD="$SYSTEM_PASSWORD" -e OWNER_NPUB="$OWNER_NPUB" "$RELAYKIT_SERVICE" node /app/scripts/automate-dokploy-setup.js
