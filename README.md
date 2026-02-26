# relaykit-proto

## What It Is

A simple UI for deploying Nostr services (relays, blossom servers, etc.) using Dokploy under the hood.

User deploys RelayKit once, then uses it to spin up Nostr services without touching Dokploy directly.

## Architecture

```
Browser → RelayKit App → Dokploy API
```

**Stack:**
- Frontend: Vite + React + tRPC client
- Backend: Node.js + TypeScript + tRPC server (serves frontend in prod)
- Communication: tRPC
- Auth: Nostr (NIP-07 browser extension)
- Presets: Docker-compose templates in `/presets/` directory
- State: PostgreSQL if needed (or just query Dokploy API)

**docker-compose.yml runs:**
- Dokploy + its Postgres/Redis
- dokploy-traefik (in prod: listens on 80 and 443, routes to services; in dev: no ports, Caddy in front)
- Caddy (dev only: listens on 80 and 443, terminates HTTPS with mkcert, forwards HTTP to Traefik)
- RelayKit app (one container: backend serves frontend)

## How It Works

1. Backend reads preset docker-compose templates from `/presets/{service}/`
2. User clicks "add service", selects service type, provides config (domain, etc.)
3. Backend calls Dokploy REST API to create and deploy the service
4. Dokploy handles actual container orchestration
5. User sees their deployed services and can manage them

## Project Structure

```
relaykit-proto/
├── docker-compose.yml
├── Dockerfile.dev
├── start-dev.sh
├── README.md
└── app/
    ├── frontend/     (React + tRPC client)
    ├── backend/      (Node.js + tRPC server)
    └── presets/      (service docker-compose templates)
        └── stirfry-relay/
            ├── docker-compose.yml
            └── metadata.json
```

## Install (Fresh)

```bash
OWNER_NPUB=your_npub ./scripts/install.sh
```

This starts containers, creates Dokploy admin account, generates API key, and sets your npub as owner.

## Development

**Prerequisites:** Docker. For local HTTPS: `brew install mkcert && mkcert -install`, then `./scripts/gen-dev-certs.sh`.

**Start:**
```bash
docker compose up --build
```

**Set owner (if not using install script):**
```bash
docker exec relaykit-proto-relaykit-1 sh -c "echo 'YOUR_NPUB' > /app/.relaykit/owner-npub"
```

**Access:**
- Dokploy: http://localhost:3000
- RelayKit: http://localhost:5173 (sign in with Nostr extension like Alby or nos2x)
- Backend: http://localhost:4000

## Auth

**User-facing:** Nostr-only (NIP-07 browser extension). Owner npub set at install.

**Under the hood:** All users share one Dokploy admin account. Nostr auth controls access to RelayKit. Storage: `/app/.relaykit/owner-npub` (who can login) and `/app/.relaykit/bootstrap-key` (shared Dokploy API key).

**Why not per-user Dokploy accounts?** Dokploy doesn't expose APIs to create users programmatically.

## Production

```bash
docker compose -f docker-compose.prod.yml up -d
```

No Caddy; Traefik on 80/443 with real certs. Change `dokploy_secret` in `docker-compose.prod.yml` before first run.

## Local HTTPS (dev)

The cert covers hostnames in `scripts/dev-domains.txt`. To add a relay with custom domain:

1. Add domain to `/etc/hosts` (e.g. `127.0.0.1 reallyrelay.io`)
2. Add to `scripts/dev-domains.txt`
3. Run `./scripts/gen-dev-certs.sh` and restart compose
4. Create relay in RelayKit with that domain, choose "No SSL"

## Key Technical Details

**Dokploy Integration:**
- Backend calls Dokploy's REST API
- Dokploy runs on `http://dokploy:3000` (Docker network)

RelayKit has two domain flows: **create service** and **change domain**.

| RelayKit action | Dokploy APIs |
|-----------------|--------------|
| **List services** | `project.all` → build list from projects/environments/composes |
| **Create service** | `project.all` or `project.create` → `compose.create` → `compose.update` → `domain.create` → `compose.deploy` |
| **Change domain** | `domain.delete` → `domain.create` → `compose.redeploy` |

**Presets:**
- Each service: `/app/presets/{service}/docker-compose.yml` + `metadata.json`
- Backend passes user config as env vars to Dokploy
- Use `{{DEPLOY_SUFFIX}}` in volume names for unique data per instance

**State:** Query Dokploy API (no separate DB for now)

## Todo

- [ ] get it running the service properly
- [ ] convey real deployment status in UI (not assumed success)
- [ ] prod deployment
- [ ] blossom?
- [ ] one other relay type
- [ ] dns record instructions for after adding a domain?
- [ ] link/iframe two shakespeare apps I made
- [ ] change default project group for all projects to go into
- [ ] let user specify a project/group for projects to go into
- [ ] tidy ui, for how we present projects
- [ ] can more things be exposed from stirfry, like whitelist kinds and users (and default blacklist all). and then how to reload to get this config?
- [ ] expose volumes to user so they can manage (view/delete/optional: create service from volume)
- [ ] what happens if I try to create a project with a domain already in use on another project?
- [ ] some high level things per service (disk space used, maybe cpu/mem usage too? network traffic?)
