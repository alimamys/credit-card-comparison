# TapWise UAE — one container serves the website and the API.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 TAPWISE_STORE=/data/store.json
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/core ./src/core
COPY tsconfig.json ./
# Mount a persistent volume here so admin edits and the audit log survive restarts.
VOLUME /data
EXPOSE 8787
CMD ["npm", "start"]
