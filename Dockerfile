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

# Install frontend dependencies
COPY app/frontend/package.json app/frontend/yarn.lock* ./frontend/
RUN cd frontend && yarn install

# Copy everything
COPY app .

# Copy scripts
COPY scripts/automate-dokploy-setup.js /app/scripts/
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 4000 5173

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["yarn", "dev"]

