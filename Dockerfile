# LykkeSpillet: builds the game and runs the small Node server with accounts and cloud saves.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./
# Runs as root on purpose: hosts like Sliplane mount the /data volume owned by root,
# and a non-root user can't write there (the server then crashes and health checks fail).
RUN mkdir -p /data
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server/index.js"]
