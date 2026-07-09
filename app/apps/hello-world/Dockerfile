FROM node:20-alpine

WORKDIR /app

COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile --network-timeout 600000 2>/dev/null || yarn install --network-timeout 600000

COPY . .
RUN yarn build

ENV NODE_ENV=production
ENV HW_PORT=3100
ENV DATA_DIR=/data

EXPOSE 3100

CMD ["yarn", "start"]
