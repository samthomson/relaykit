#!/bin/bash
set -e

# Interactive RelayKit installer. Prompts for the owner npub + instance domain,
# auto-generates JWT/admin secrets, writes .env, starts the prod stack, and runs auth setup.
# Re-run any time to change the domain or owner npub (existing values are offered as defaults).

# Must be run from repo root (directory containing docker-compose.yml)
if [ ! -f docker-compose.yml ]; then
  echo "Error: run this from the project root (directory containing docker-compose.yml)"
  exit 1
fi

# Read an existing .env value (for re-runs / defaults)
env_val() { [ -f .env ] && grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }

# Prompt with a default (env var wins for non-interactive use)
ask() { # ask VAR "prompt" "default"
  local var="$1" prompt="$2" def="$3" cur
  eval "cur=\${$var:-}"
  if [ -n "$cur" ]; then return; fi
  if [ -n "$def" ]; then read -rp "$prompt [$def]: " val; val="${val:-$def}"; else read -rp "$prompt: " val; fi
  eval "$var=\$val"
}

OWNER_NPUB="${OWNER_NPUB:-}"
RELAYKIT_HOST="${RELAYKIT_HOST:-}"

ask OWNER_NPUB    "Owner npub (only this key can log in)" "$(env_val OWNER_NPUB)"
ask RELAYKIT_HOST "Instance domain (e.g. rkit.example.com)" "$(env_val RELAYKIT_HOST)"

case "$OWNER_NPUB" in npub1*) ;; *) echo "Error: OWNER_NPUB must start with npub1"; exit 1;; esac
[ -n "$RELAYKIT_HOST" ] || { echo "Error: instance domain is required"; exit 1; }

# Reuse existing secrets or generate new ones
JWT_SECRET="$(env_val JWT_SECRET)"; [ -n "$JWT_SECRET" ] && [ "$JWT_SECRET" != "your-secret-here" ] || JWT_SECRET="$(openssl rand -base64 32)"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 18)}"
DEPLOY_HOST="$(env_val DEPLOY_HOST)"
DEPLOY_PATH="$(env_val DEPLOY_PATH)"

# Write .env (preserving deploy settings if present)
{
  echo "JWT_SECRET=$JWT_SECRET"
  echo "RELAYKIT_HOST=$RELAYKIT_HOST"
  echo "OWNER_NPUB=$OWNER_NPUB"
  [ -n "$DEPLOY_HOST" ] && echo "DEPLOY_HOST=$DEPLOY_HOST"
  [ -n "$DEPLOY_PATH" ] && echo "DEPLOY_PATH=$DEPLOY_PATH"
} > .env
echo "✓ wrote .env (owner=$OWNER_NPUB, domain=$RELAYKIT_HOST)"

echo "Starting RelayKit (prod)..."
docker compose --profile prod up -d

echo "Waiting for Dokploy..."
until curl -sf http://localhost:3020/ > /dev/null 2>&1; do sleep 2; done

# Sync the owner npub into the running instance (makes re-runs able to change the owner)
docker compose exec -T relaykit-prod sh -lc "mkdir -p /app/.relaykit && printf '%s' '$OWNER_NPUB' > /app/.relaykit/owner-npub"
echo "✓ owner npub synced"

OWNER_NPUB="$OWNER_NPUB" ADMIN_PASSWORD="$ADMIN_PASSWORD" ./scripts/setup-relaykit-auth.sh

echo ""
echo "Done. RelayKit will be live at https://$RELAYKIT_HOST once Traefik issues the cert (~30s)."
echo "Owner: $OWNER_NPUB"
