# Security Guide

This guide covers security best practices and configurations for LeForge deployments.

## Table of Contents

- [Security Overview](#security-overview)
- [Authentication & Authorization](#authentication--authorization)
- [Network Security](#network-security)
- [Database Security](#database-security)
- [Redis Security](#redis-security)
- [MQTT Security](#mqtt-security)
- [Environment Variables](#environment-variables)
- [Production Hardening Checklist](#production-hardening-checklist)

## Security Overview

LeForge implements multiple layers of security:

| Layer | Technology | Status |
|-------|------------|--------|
| Password Hashing | bcrypt (cost factor 12) | ✅ Enabled |
| Session Management | JWT with crypto-random secret | ✅ Enabled |
| Authorization | Role-Based Access Control (RBAC) | ✅ Enabled |
| API Authentication | Session tokens + API keys | ✅ Enabled |
| Enterprise Auth | OIDC/SSO | ✅ Available |

## Authentication & Authorization

### Password Security

All passwords are hashed using **bcrypt** with a cost factor of 12:

```typescript
bcrypt.hash(password, 12)
```

This provides:
- Slow hashing (~250ms per hash) to resist brute-force attacks
- Built-in salt to prevent rainbow table attacks
- Industry-standard algorithm

### JWT Configuration

JWT tokens are signed with a 64-byte cryptographically random secret:

| Setting | Default | Recommended Production |
|---------|---------|----------------------|
| Secret Length | 64 bytes (auto-generated) | 64+ bytes (set via env) |
| Expiration | 24 hours | 1-8 hours |
| Algorithm | HS256 | HS256 or RS256 |

**Important:** Set `LEFORGE_JWT_SECRET` in production to ensure session persistence across container restarts.

```bash
# Generate a secure JWT secret
openssl rand -hex 64
```

### Role-Based Access Control (RBAC)

LeForge supports three roles with granular permissions:

| Role | Permissions |
|------|-------------|
| `admin` | Full access - manage users, plugins, agents, settings |
| `user` | Use agents, view plugins, manage own API keys |
| `guest` | Read-only access to public resources |

### Admin Account

**Default credentials (development only):**
- Username: `admin`
- Password: `admin`

**For production:**
```bash
# Set strong admin password via environment variable
LEFORGE_ADMIN_PASSWORD=your-secure-password-here
```

## Network Security

### Exposed Ports

| Port | Service | Internal Use | Production Exposure |
|------|---------|--------------|-------------------|
| 4000 | LeForge API | ✅ Required | Via reverse proxy only |
| 5432 | PostgreSQL | ✅ Plugins | ❌ Do not expose |
| 6379 | Redis | ✅ Plugins | ❌ Do not expose |
| 1883 | MQTT TCP | ✅ IoT/Events | Firewall or VPN only |
| 9001 | MQTT WebSocket | ✅ Browser | Via reverse proxy with auth |

### Recommended Firewall Rules

```bash
# Allow only HTTPS traffic (port 443) from internet
# All other ports should be internal network only

# UFW example (Ubuntu)
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 443/tcp  # HTTPS only
ufw enable

# For Cloudflare Tunnel users: No inbound ports needed
```

### TLS/SSL

LeForge supports TLS for encrypted connections:

```bash
# Environment variables for TLS
LEFORGE_SECURE_COOKIES=true  # Enable secure cookies for HTTPS
```

For external access, use a reverse proxy (nginx, Traefik, Cloudflare Tunnel) with TLS termination.

## Database Security

### PostgreSQL Configuration

**Default (development):**
- User: `leforge`
- Password: `leforge_password`
- SSL: Disabled

**Production recommendations:**

1. **Set strong password:**
```bash
# Generate secure password
openssl rand -base64 32

# Set via environment
POSTGRES_PASSWORD=your-generated-password
```

2. **Restrict network access:**

The PostgreSQL port (5432) is exposed for plugin containers to connect. For enhanced security:

```yaml
# Option 1: Bind to Docker network only (in docker-compose.yml)
services:
  leforge:
    ports:
      - "4000:4000"
      # Remove: - "5432:5432"  # Don't expose to host
```

```yaml
# Option 2: Bind to localhost only
services:
  leforge:
    ports:
      - "127.0.0.1:5432:5432"
```

3. **Enable SSL (optional):**

For PostgreSQL SSL, add certificates to the container and configure:
```
POSTGRES_SSL_MODE=require
```

### Connection String Security

Never hardcode database passwords. Use environment variables:

```bash
# Bad
POSTGRES_PASSWORD=hardcoded_password

# Good - use secrets management
POSTGRES_PASSWORD=${DB_PASSWORD_FROM_VAULT}
```

## Redis Security

### Default Configuration

Redis runs embedded with:
- No password (authenticated via Docker network isolation)
- AOF persistence enabled
- 256MB memory limit with LRU eviction

### Production Hardening

1. **Enable password authentication:**

Update [supervisord.conf](../app/supervisord.conf):
```ini
[program:redis]
command=/usr/bin/redis-server --bind 0.0.0.0 --port 6379 --dir /var/lib/redis --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru --requirepass ${REDIS_PASSWORD}
```

2. **Set password in environment:**
```bash
REDIS_PASSWORD=your-secure-redis-password
```

3. **Restrict network access:**
```yaml
# Don't expose Redis to host
ports:
  # Remove: - "6379:6379"
```

## MQTT Security

### Default Configuration

Mosquitto MQTT broker runs with:
- Anonymous access enabled
- TCP on port 1883
- WebSocket on port 9001

### Production Hardening

1. **Enable authentication:**

Create a password file:
```bash
# Inside container
mosquitto_passwd -c /etc/mosquitto/passwd mqtt_user
```

Update [mosquitto.conf](../app/mosquitto.conf):
```ini
# Disable anonymous access
allow_anonymous false

# Enable password file
password_file /etc/mosquitto/passwd

# Optional: Enable ACL for topic restrictions
acl_file /etc/mosquitto/acl
```

2. **Enable TLS:**
```ini
# TLS listener
listener 8883
cafile /etc/mosquitto/certs/ca.crt
certfile /etc/mosquitto/certs/server.crt
keyfile /etc/mosquitto/certs/server.key
require_certificate false
```

3. **Restrict network access:**

For internal-only MQTT:
```yaml
ports:
  # Remove: - "1883:1883"
  # Remove: - "9001:9001"
```

## Environment Variables

### Required for Production

| Variable | Description | How to Generate |
|----------|-------------|-----------------|
| `LEFORGE_JWT_SECRET` | JWT signing secret | `openssl rand -hex 64` |
| `LEFORGE_ADMIN_PASSWORD` | Admin account password | Strong unique password |
| `POSTGRES_PASSWORD` | Database password | `openssl rand -base64 32` |

### Recommended for Production

| Variable | Description | Default |
|----------|-------------|---------|
| `LEFORGE_SECURE_COOKIES` | Enable secure cookies | `true` for HTTPS |
| `LEFORGE_JWT_EXPIRES_IN` | Token expiration | `24h` |
| `REDIS_PASSWORD` | Redis authentication | (none) |
| `LOG_LEVEL` | Logging verbosity | `info` |

### Production Environment Template

Create a `.env.production` file:

```bash
# ===========================================
# LeForge Production Configuration
# ===========================================

# Environment
NODE_ENV=production
LOG_LEVEL=info

# ===========================================
# REQUIRED: Authentication
# ===========================================

# Admin credentials - CHANGE THESE!
LEFORGE_ADMIN_USER=admin
LEFORGE_ADMIN_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# JWT Secret - Generate with: openssl rand -hex 64
LEFORGE_JWT_SECRET=CHANGE_ME_GENERATED_SECRET

# Token expiration (reduce for higher security)
LEFORGE_JWT_EXPIRES_IN=8h

# Enable secure cookies (requires HTTPS)
LEFORGE_SECURE_COOKIES=true

# ===========================================
# REQUIRED: Database
# ===========================================

# PostgreSQL - Generate with: openssl rand -base64 32
POSTGRES_USER=leforge
POSTGRES_PASSWORD=CHANGE_ME_DB_PASSWORD
POSTGRES_DB=leforge

# ===========================================
# OPTIONAL: Redis
# ===========================================

# Uncomment to enable Redis authentication
# REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD

# ===========================================
# OPTIONAL: OIDC/SSO
# ===========================================

# LEFORGE_AUTH_MODE=oidc
# LEFORGE_OIDC_ISSUER=https://your-idp.com
# LEFORGE_OIDC_CLIENT_ID=your-client-id
# LEFORGE_OIDC_CLIENT_SECRET=your-client-secret
# LEFORGE_OIDC_REDIRECT_URI=https://app.yourdomain.com/auth/callback
```

## Production Hardening Checklist

### Before Deployment

- [ ] Change default admin password (`LEFORGE_ADMIN_PASSWORD`)
- [ ] Generate and set JWT secret (`LEFORGE_JWT_SECRET`)
- [ ] Set strong database password (`POSTGRES_PASSWORD`)
- [ ] Enable secure cookies (`LEFORGE_SECURE_COOKIES=true`)
- [ ] Configure TLS/HTTPS via reverse proxy

### Network Security

- [ ] Remove PostgreSQL port exposure (5432) or bind to localhost
- [ ] Remove Redis port exposure (6379) or bind to localhost
- [ ] Configure firewall to allow only 443 (HTTPS)
- [ ] Use Cloudflare Tunnel or VPN for remote access

### Optional Enhancements

- [ ] Enable Redis password authentication
- [ ] Enable MQTT password authentication
- [ ] Configure OIDC/SSO for enterprise environments
- [ ] Set up monitoring and alerting
- [ ] Implement backup strategy
- [ ] Enable audit logging

### Container Security

- [ ] Scan images with Trivy or similar
- [ ] Keep base images updated
- [ ] Review and minimize exposed ports

## Incident Response

### Credential Rotation

If credentials are compromised:

1. **Rotate JWT secret:**
```bash
# Generate new secret
LEFORGE_JWT_SECRET=$(openssl rand -hex 64)
# Restart container - all sessions will be invalidated
```

2. **Rotate database password:**
```bash
# Update PostgreSQL password
docker exec leforge psql -U postgres -c "ALTER USER leforge PASSWORD 'new_password';"
# Update environment variable and restart
```

3. **Rotate API keys:**
```bash
# Via API - revoke compromised key
curl -X DELETE https://app.leforge.io/api/v1/api-keys/{key-id} \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Security Logging

Monitor these log entries for security events:
- Failed login attempts
- API key creation/deletion
- Admin actions
- Unusual error patterns

```bash
# View security-related logs
docker logs leforge 2>&1 | grep -E "auth|login|unauthorized|forbidden"
```

## Support

For security issues:
- Report vulnerabilities via private disclosure
- Check for security updates regularly
- Join the community for security discussions
