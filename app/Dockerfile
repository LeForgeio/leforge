# =============================================================================
# LeForge Unified Application
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

# Install runtime dependencies:
# - curl for healthcheck
# - docker-cli for container management
# - openssl for SSL certs
# - redis for embedded caching/queuing
# - postgresql for embedded database
# - mosquitto for embedded MQTT broker
# - supervisor to manage multiple processes
# - git, build-base, postgresql-dev for building pgvector
RUN apk add --no-cache curl docker-cli openssl redis supervisor postgresql postgresql-contrib \
    mosquitto mosquitto-clients \
    git build-base postgresql-dev && \
    # Build and install pgvector extension (master has PG18 support)
    cd /tmp && \
    git clone https://github.com/pgvector/pgvector.git && \
    cd pgvector && \
    make && \
    make install && \
    cd / && \
    rm -rf /tmp/pgvector && \
    # Clean up build dependencies
    apk del git build-base postgresql-dev

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

# Copy supervisord configuration
COPY supervisord.conf /etc/supervisord.conf

# Copy mosquitto configuration
COPY mosquitto.conf /etc/mosquitto/mosquitto.conf

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh

# Create directories for Redis, PostgreSQL, Mosquitto, and supervisor
RUN mkdir -p /var/lib/redis /var/lib/postgresql/data /var/log/supervisor /var/run/supervisor /run/postgresql \
    /var/lib/mosquitto /var/log/mosquitto /etc/mosquitto /var/run/mosquitto && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app /var/lib/redis /var/log/supervisor /var/run/supervisor && \
    chown -R postgres:postgres /var/lib/postgresql /run/postgresql && \
    chown -R mosquitto:mosquitto /var/lib/mosquitto /var/log/mosquitto /var/run/mosquitto && \
    chmod +x /docker-entrypoint.sh

# Expose ports (HTTP, HTTPS, Redis, PostgreSQL, and MQTT for plugin containers)
# 4000 = HTTP, 1883 = MQTT TCP, 9001 = MQTT WebSocket
EXPOSE 4000 6379 5432 1883 9001

# Health check (checks Node app, Redis, PostgreSQL, and MQTT PID file)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:4000/health && redis-cli ping && pg_isready -U leforge && test -f /var/run/mosquitto/mosquitto.pid || exit 1

# Entrypoint handles runtime configuration (MQTT auth, etc.)
ENTRYPOINT ["/docker-entrypoint.sh"]
