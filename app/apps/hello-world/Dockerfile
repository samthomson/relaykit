FROM node:20-alpine AS builder

WORKDIR /build

COPY app/package.json app/yarn.lock ./
COPY app/shared/package.json ./shared/
COPY app/shared/ui/package.json ./shared/ui/
COPY app/apps/hello-world/package.json ./apps/hello-world/
RUN yarn install --frozen-lockfile --network-timeout 600000 2>/dev/null || yarn install --network-timeout 600000

COPY app/shared ./shared
COPY app/apps/hello-world ./apps/hello-world
RUN cd apps/hello-world && yarn build

FROM node:20-alpine

WORKDIR /app

COPY app/package.json app/yarn.lock ./
COPY app/shared/package.json ./shared/
COPY app/shared/ui/package.json ./shared/ui/
COPY app/apps/hello-world/package.json ./apps/hello-world/
RUN yarn install --production --frozen-lockfile --network-timeout 600000 2>/dev/null || yarn install --production --network-timeout 600000
RUN yarn global add tsx

COPY app/shared ./shared
COPY app/apps/hello-world/server ./apps/hello-world/server
COPY app/apps/hello-world/types.ts ./apps/hello-world/types.ts
COPY --from=builder /build/apps/hello-world/dist ./apps/hello-world/dist

ENV NODE_ENV=production
ENV HW_PORT=3100
ENV DATA_DIR=/data

WORKDIR /app/apps/hello-world
EXPOSE 3100
CMD ["yarn", "start"]
