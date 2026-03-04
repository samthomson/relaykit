FROM node:20-alpine

# Install Playwright system dependencies
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

# Install root dependencies (concurrently)
COPY app/package.json app/yarn.lock* ./
RUN yarn install

# Install backend dependencies
COPY app/backend/package.json app/backend/yarn.lock* ./backend/
RUN cd backend && yarn install

# Install tsx globally so it's available even with volume mounts
RUN yarn global add tsx

# Copy app then install frontend deps (vite etc.) so build works in prod
COPY app .
RUN cd frontend && yarn install

# Copy scripts
COPY scripts/automate-dokploy-setup.js /app/scripts/
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 4000 5173

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["yarn", "dev"]

