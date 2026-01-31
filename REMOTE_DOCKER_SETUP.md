# LeForge Remote Docker Deployment

## 🎯 Setup Overview

Your Docker server is running on:
- **Host**: 10.0.0.166
- **User**: dan
- **Authentication**: SSH key

---

## 🔑 Step 1: Configure SSH Connection

### Test SSH Connection

```bash
# Test SSH access
ssh dan@10.0.0.166

# If successful, you should get a shell
# Type 'exit' to close
```

### Set Up Docker Context (Recommended)

This allows you to use `docker` commands locally that execute on the remote server:

```bash
# Create a Docker context for remote server
docker context create LeForge-remote \
  --docker "host=ssh://dan@10.0.0.166"

# List contexts
docker context ls

# Switch to remote context
docker context use LeForge-remote

# Test connection
docker ps
```

**Now all `docker` and `docker compose` commands will run on 10.0.0.166!**

---

## 📦 Step 2: Deploy LeForge

### Option A: Using Docker Context (Recommended)

```bash
# Make sure you're using the remote context
docker context use LeForge-remote

# Navigate to project
cd f:/Projects/lcncAK/LeForge

# Deploy to remote server
docker compose -f docker-compose.unified.yml up -d

# Check status
docker compose -f docker-compose.unified.yml ps

# View logs
docker compose -f docker-compose.unified.yml logs -f LeForge
```

### Option B: Using DOCKER_HOST Environment Variable

```bash
# Set Docker host for this session
export DOCKER_HOST="ssh://dan@10.0.0.166"

# Or on Windows (PowerShell)
$env:DOCKER_HOST = "ssh://dan@10.0.0.166"

# Now deploy
cd f:/Projects/lcncAK/LeForge
docker compose -f docker-compose.unified.yml up -d
```

### Option C: Direct SSH Deployment

```bash
# Copy project to remote server
scp -r f:/Projects/lcncAK/LeForge dan@10.0.0.166:~/

# SSH into server
ssh dan@10.0.0.166

# On remote server:
cd ~/LeForge
docker compose -f docker-compose.unified.yml up -d
```

---

## 🌐 Step 3: Access LeForge

After deployment, LeForge will be accessible at:

- **Web UI**: http://10.0.0.166:3000
- **API**: http://10.0.0.166:3000/api/v1/...
- **Kong Gateway**: http://10.0.0.166:8000

### Update Frontend API Configuration

Since the server is remote, you need to update the frontend to call the correct API URL.

**Option 1: Use environment variable** (at build time)

Edit `docker-compose.unified.yml`:

```yaml
LeForge:
  build:
    context: ./web-ui
    dockerfile: Dockerfile.unified
    args:
      VITE_API_HOST: 10.0.0.166  # Add this
  environment:
    # ... existing vars
```

**Option 2: Configure at runtime** (recommended)

The frontend is already set up to use the same origin, so if you access LeForge at `http://10.0.0.166:3000`, it will automatically call APIs at `http://10.0.0.166:3000/api/v1/...`.

**No changes needed!** Just access via the server IP.

---

## 🧪 Step 4: Test Deployment

### From Your Local Machine

```bash
# Test health endpoint
curl http://10.0.0.166:3000/api/v1/health | jq

# Test registry
curl http://10.0.0.166:3000/api/v1/registry/stats | jq

# Open web UI in browser
start http://10.0.0.166:3000
```

### Check Container Status (Remote)

```bash
# Using Docker context
docker context use LeForge-remote
docker compose -f docker-compose.unified.yml ps

# Or via SSH
ssh dan@10.0.0.166 "docker ps"
```

### View Logs (Remote)

```bash
# Using Docker context
docker context use LeForge-remote
docker logs LeForge -f

# Or via SSH
ssh dan@10.0.0.166 "docker logs LeForge -f"
```

---

## 🔧 Common Operations

### Deploy/Update

```bash
# Switch to remote context
docker context use LeForge-remote

# Navigate to project
cd f:/Projects/lcncAK/LeForge

# Pull latest changes, rebuild, restart
docker compose -f docker-compose.unified.yml up -d --build
```

### Stop Services

```bash
docker context use LeForge-remote
docker compose -f docker-compose.unified.yml down
```

### View Logs

```bash
docker context use LeForge-remote
docker compose -f docker-compose.unified.yml logs -f
```

### Restart Single Service

```bash
docker context use LeForge-remote
docker compose -f docker-compose.unified.yml restart LeForge
```

### Access Server Shell

```bash
# SSH into server
ssh dan@10.0.0.166

# Or execute remote command
ssh dan@10.0.0.166 "docker exec -it LeForge sh"
```

---

## 🐛 Troubleshooting

### SSH Connection Issues

**Error**: `Permission denied (publickey)`

**Solution**:
```bash
# Specify SSH key explicitly
ssh -i ~/.ssh/your_key dan@10.0.0.166

# Add key to SSH agent
ssh-add ~/.ssh/your_key

# Or create Docker context with key
docker context create LeForge-remote \
  --docker "host=ssh://dan@10.0.0.166" \
  --ssh-key ~/.ssh/your_key
```

### Port Forwarding (Optional)

If you want to access the remote server as if it were local:

```bash
# Forward port 3000 from remote to local
ssh -L 3000:localhost:3000 dan@10.0.0.166

# Now access at http://localhost:3000 (forwarded to remote)
```

### Firewall Issues

Make sure ports are open on the remote server:

```bash
# On remote server, check firewall
ssh dan@10.0.0.166 "sudo ufw status"

# Allow ports if needed
ssh dan@10.0.0.166 "sudo ufw allow 3000/tcp"
ssh dan@10.0.0.166 "sudo ufw allow 8000/tcp"
```

### Docker Socket Permissions

If you get "permission denied" errors:

```bash
# Add dan user to docker group on remote server
ssh dan@10.0.0.166 "sudo usermod -aG docker dan"

# Logout and login again for changes to take effect
```

---

## 📋 Quick Reference

### Set Remote Context

```bash
docker context create LeForge-remote --docker "host=ssh://dan@10.0.0.166"
docker context use LeForge-remote
```

### Deploy

```bash
cd f:/Projects/lcncAK/LeForge
docker compose -f docker-compose.unified.yml up -d
```

### Check Status

```bash
docker compose -f docker-compose.unified.yml ps
```

### View Logs

```bash
docker logs LeForge -f
```

### Access UI

http://10.0.0.166:3000

### Test API

```bash
curl http://10.0.0.166:3000/api/v1/health
```

### Stop

```bash
docker compose -f docker-compose.unified.yml down
```

---

## 🌐 Cloudflare Tunnel (cloudflared)

LeForge uses Cloudflare Tunnel for public access via `app.leforge.io`. The tunnel runs in a separate container (`cloudflared`) on the `LeForge-backend` network.

### Network Configuration

The `cloudflared` container expects to reach the LeForge app at hostname `leforge-app:4000`. After deploying the `leforge` container, you must connect it to the cloudflared network with the correct alias:

```bash
# Connect leforge container to cloudflared's network with alias
docker network connect --alias leforge-app LeForge-backend leforge
```

### Verify Tunnel Connectivity

```bash
# Check cloudflared logs for errors
docker logs cloudflared --tail 50

# Test public endpoint
curl https://app.leforge.io/health
```

### Troubleshooting 502 Bad Gateway

If you see 502 errors on `app.leforge.io`:

1. **Check container is running**:
   ```bash
   docker ps | grep leforge
   ```

2. **Verify network connectivity**:
   ```bash
   # Check leforge is on LeForge-backend network
   docker inspect leforge --format '{{json .NetworkSettings.Networks}}' | jq
   ```

3. **Reconnect to network**:
   ```bash
   docker network connect --alias leforge-app LeForge-backend leforge
   ```

4. **Check cloudflared logs**:
   ```bash
   docker logs cloudflared --tail 30
   ```
   
   Look for: `lookup leforge-app on 127.0.0.11:53: server misbehaving` - this means the alias isn't set up.

### After Each Redeployment

When you redeploy the `leforge` container (e.g., `docker compose down/up`), you must reconnect it to the cloudflared network:

```bash
docker network connect --alias leforge-app LeForge-backend leforge
```

Consider adding this to your deployment script or docker-compose configuration.

---

## 🔐 Security Considerations

### SSH Key Security

- Keep your SSH key secure
- Use `ssh-agent` to avoid typing passphrase repeatedly
- Consider using `~/.ssh/config` for easier access:

```
# ~/.ssh/config
Host LeForge
    HostName 10.0.0.166
    User dan
    IdentityFile ~/.ssh/your_key
```

Then simply: `ssh LeForge`

### Network Security

- Consider using VPN if 10.0.0.166 is not on your local network
- Use HTTPS/SSL in production (configure Kong or add reverse proxy)
- Restrict Docker API access to trusted IPs

### Environment Variables

- Update `.env` with strong passwords
- Don't commit `.env` to git
- Use secrets management for production

---

## 📊 Architecture (Remote Deployment)

```
┌──────────────────────────────────────────────────────┐
│  Your Machine (Windows)                              │
│  f:/Projects/lcncAK/LeForge                        │
│                                                      │
│  Docker Context: LeForge-remote                   │
│  Commands executed via SSH                          │
└───────────────────────┬──────────────────────────────┘
                        │ SSH (dan@10.0.0.166)
                        │
                        ▼
┌──────────────────────────────────────────────────────┐
│  Remote Docker Server (10.0.0.166)                  │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  LeForge Container (Port 3000)               │ │
│  │  - Frontend (React)                            │ │
│  │  - Backend (Fastify)                           │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  PostgreSQL, Redis, Qdrant, Kong              │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  ForgeHook Containers (Dynamic)                │ │
│  │  Port range: 4001-4999                         │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
                        │
                        │ HTTP
                        ▼
            Access from any machine on network:
            http://10.0.0.166:3000
```

---

## ✅ Deployment Checklist

- [ ] SSH key is set up for dan@10.0.0.166
- [ ] Can SSH into server: `ssh dan@10.0.0.166`
- [ ] Docker context created: `docker context create LeForge-remote`
- [ ] Context switched: `docker context use LeForge-remote`
- [ ] Test Docker connection: `docker ps` (should show remote containers)
- [ ] `.env` file configured
- [ ] Deploy: `docker compose -f docker-compose.unified.yml up -d`
- [ ] Check status: `docker compose ps`
- [ ] Test API: `curl http://10.0.0.166:3000/api/v1/health`
- [ ] Access UI: http://10.0.0.166:3000

---

## 🚀 Ready to Deploy!

Your remote Docker setup is ready. Follow these steps:

```bash
# 1. Create Docker context
docker context create LeForge-remote --docker "host=ssh://dan@10.0.0.166"

# 2. Switch to remote context
docker context use LeForge-remote

# 3. Test connection
docker ps

# 4. Deploy LeForge
cd f:/Projects/lcncAK/LeForge
docker compose -f docker-compose.unified.yml up -d

# 5. Access
# http://10.0.0.166:3000
```

**Note**: All Docker commands will now execute on the remote server automatically!
