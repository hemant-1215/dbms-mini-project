FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:24.21.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY db/mysql ./migrations
ENV MIGRATION_DIR=/app/migrations MODEL_CACHE_DIR=/home/node/.cache/huggingface
RUN mkdir -p /home/node/.cache/huggingface && chown -R node:node /home/node/.cache
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
