FROM node:24-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-bookworm-slim AS backend-build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=backend-build /app/backend/dist ./dist
COPY backend/scripts/run-migrations.js backend/scripts/sqlite-database.js backend/scripts/verify-sqlite-backup.js ./scripts/
COPY --from=frontend-build /app/frontend/dist ./public

EXPOSE 8080
CMD ["sh", "-c", "npm run migrate && npm run start:prod"]

FROM runtime AS production
