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

# Register system account (only works if no admin exists yet)
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SYSTEM_EMAIL\",\"password\":\"$SYSTEM_PASSWORD\"}" \
  2>&1)

if echo "$REGISTER_RESPONSE" | grep -q "error"; then
  echo "⚠ Registration failed or admin already exists"
  echo "Response: $REGISTER_RESPONSE"
  echo ""
  echo "If Dokploy is already set up, you can manually:"
  echo "1. Login to Dokploy at http://localhost:3000"
  echo "2. Go to Settings → Profile → API/CLI"
  echo "3. Generate an API key"
  echo "4. Store it in: docker exec relaykit-relaykit-1 sh -c 'echo YOUR_KEY > /app/.relaykit/bootstrap-key'"
  exit 1
fi

echo "✓ System account created"

# Login to get session token
echo "Logging in to get session token..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth.login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SYSTEM_EMAIL\",\"password\":\"$SYSTEM_PASSWORD\"}")

# Extract token (assuming it's in response as "token" or "accessToken")
SESSION_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$SESSION_TOKEN" ]; then
  SESSION_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
fi

if [ -z "$SESSION_TOKEN" ]; then
  echo "⚠ Failed to extract session token"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✓ Logged in"

# Generate API key
echo "Generating bootstrap API key..."
API_KEY_RESPONSE=$(curl -s -X POST http://localhost:3000/api/user.generateToken \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SESSION_TOKEN")

# Extract API key
BOOTSTRAP_KEY=$(echo "$API_KEY_RESPONSE" | grep -o '"key":"[^"]*"' | cut -d'"' -f4)
if [ -z "$BOOTSTRAP_KEY" ]; then
  BOOTSTRAP_KEY=$(echo "$API_KEY_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
fi
if [ -z "$BOOTSTRAP_KEY" ]; then
  BOOTSTRAP_KEY=$(echo "$API_KEY_RESPONSE" | grep -o '"apiKey":"[^"]*"' | cut -d'"' -f4)
fi

if [ -z "$BOOTSTRAP_KEY" ]; then
  echo "⚠ Failed to extract API key"
  echo "Response: $API_KEY_RESPONSE"
  exit 1
fi

echo "✓ Bootstrap API key generated"

# Store bootstrap key in RelayKit container
echo "Storing bootstrap key..."
docker exec relaykit-relaykit-1 sh -c "mkdir -p /app/.relaykit && echo '$BOOTSTRAP_KEY' > /app/.relaykit/bootstrap-key"

# Store system password (for potential future use)
docker exec relaykit-relaykit-1 sh -c "echo '$SYSTEM_PASSWORD' > /app/.relaykit/system-password"

# Store owner npub
docker exec relaykit-relaykit-1 sh -c "echo '$OWNER_NPUB' > /app/.relaykit/owner-npub"

echo "✓ Bootstrap key and owner npub stored"
echo ""
echo "✅ RelayKit auth setup complete!"
echo ""
echo "System account: $SYSTEM_EMAIL"
echo "Owner npub: $OWNER_NPUB"
echo "Bootstrap key stored in container at: /app/.relaykit/bootstrap-key"
echo ""
echo "Owner can now login with Nostr at http://localhost:5173"
