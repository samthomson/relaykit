FROM node:20-alpine AS builder

WORKDIR /build

COPY app/package.json app/yarn.lock ./
COPY app/shared/package.json ./shared/
COPY app/shared/ui/package.json ./shared/ui/
COPY app/apps/notif-hub/package.json ./apps/notif-hub/
RUN yarn install --frozen-lockfile --network-timeout 600000 2>/dev/null || yarn install --network-timeout 600000

COPY app/shared ./shared
COPY app/apps/notif-hub ./apps/notif-hub
# The deployed service owns its domain, so the SPA is served from the root path.
RUN cd apps/notif-hub && NH_BASE=/ yarn build

FROM node:20-alpine

WORKDIR /app

COPY app/package.json app/yarn.lock ./
COPY app/shared/package.json ./shared/
COPY app/shared/ui/package.json ./shared/ui/
COPY app/apps/notif-hub/package.json ./apps/notif-hub/
RUN yarn install --production --frozen-lockfile --network-timeout 600000 2>/dev/null || yarn install --production --network-timeout 600000

COPY app/shared ./shared
COPY app/apps/notif-hub/server ./apps/notif-hub/server
COPY app/apps/notif-hub/types.ts ./apps/notif-hub/types.ts
COPY --from=builder /build/apps/notif-hub/dist ./apps/notif-hub/dist

ENV NODE_ENV=production
ENV NH_PORT=3200
ENV DATA_DIR=/data

WORKDIR /app/apps/notif-hub
EXPOSE 3200
CMD ["yarn", "start"]
