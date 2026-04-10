FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY app/frontend/package.json app/frontend/yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000

COPY app/frontend .
COPY app/shared ../shared
RUN yarn build

FROM node:20-alpine

# Playwright/Chromium are required in prod for setup automation.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Install root deps needed at runtime (includes playwright, excludes dev deps).
COPY app/package.json app/yarn.lock* ./
RUN yarn install --production --frozen-lockfile

# Install backend runtime deps only.
COPY app/backend/package.json app/backend/yarn.lock* ./backend/
RUN cd backend && yarn install --production --frozen-lockfile

# Install tsx globally for backend runtime command.
RUN yarn global add tsx

# Copy only runtime sources and built frontend.
COPY app/backend ./backend
COPY app/shared ./shared
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy scripts
COPY scripts/automate-dokploy-setup.js /app/scripts/
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 4000 5173

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["yarn", "dev"]

