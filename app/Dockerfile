# =============================================================================
# FlowForge Unified Application
# Multi-stage build: Frontend (Vite/React) + Backend (Node/Fastify)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build Frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Build argument for API host (for Vite build)
ARG VITE_API_HOST=localhost
ENV VITE_API_HOST=${VITE_API_HOST}

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy frontend source and configs
COPY src/client ./src/client
COPY public ./public
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.client.json ./
COPY tsconfig.node.json ./

# Build frontend
RUN npm run build:client

# -----------------------------------------------------------------------------
# Stage 2: Build Backend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS backend-builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy backend source
COPY src/server ./src/server
COPY tsconfig.server.json ./

# Build backend
RUN npm run build:server

# -----------------------------------------------------------------------------
# Stage 3: Production Image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Install runtime dependencies (curl for healthcheck, docker-cli for container management, openssl for SSL certs)
RUN apk add --no-cache curl docker-cli openssl

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built backend
COPY --from=backend-builder /app/dist/server ./dist/server

# Copy built frontend
COPY --from=frontend-builder /app/dist/client ./dist/client

# Copy runtime files (migrations and registry to dist folder where code expects them)
COPY migrations ./dist/migrations
COPY registry ./dist/registry

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Expose ports (HTTP and HTTPS)
EXPOSE 3000 3443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start server
CMD ["node", "dist/server/index.js"]
