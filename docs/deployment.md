# Deployment Guide

This guide covers deploying FlowForge to various environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Server](#development-server)
- [Docker Compose Deployment](#docker-compose-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Cloud Deployments](#cloud-deployments)
- [Security Considerations](#security-considerations)
- [Monitoring & Logging](#monitoring--logging)
- [Backup & Recovery](#backup--recovery)
- [Scaling](#scaling)

## Prerequisites

### Hardware Requirements

| Environment | CPU | RAM | Storage |
| ----------- | --- | --- | ------- |
| Development | 2 cores | 4 GB | 20 GB |
| Staging | 4 cores | 8 GB | 50 GB |
| Production | 8+ cores | 16+ GB | 100+ GB |

### Software Requirements

- Docker 20.10+
- Docker Compose 2.0+ (for Compose deployments)
- Kubernetes 1.25+ (for K8s deployments)
- SSL certificates for production

## Development Server

### Server Details

| Setting | Value |
| ------- | ----- |
| **IP Address** | `10.0.0.166` |
| **SSH User** | `dan` |
| **SSH Port** | 22 (default) |
| **SSH Key** | Uses SSH key authentication (no password needed for SSH) |
| **FlowForge Source** | `~/flowforge` |

### Quick Access

```bash
# SSH to development server (uses SSH key)
ssh dan@10.0.0.166

# Check running containers
ssh dan@10.0.0.166 "sudo docker ps"

# View plugin manager logs
ssh dan@10.0.0.166 "sudo docker logs flowforge-plugin-manager -f"

# Restart plugin manager
ssh dan@10.0.0.166 "sudo docker restart flowforge-plugin-manager"
```

### Service URLs (from dev server)

| Service | URL |
| ------- | --- |
| Plugin Manager API | `http://10.0.0.166:4000` |
| Web UI | `http://10.0.0.166:3000` |
| Kong Gateway | `http://10.0.0.166:8000` |
| Kong Admin | `http://10.0.0.166:8001` |
| PostgreSQL | `10.0.0.166:5432` |
| Redis | `10.0.0.166:6379` |

### Deploying Updates

```bash
# Copy updated source files to server
scp -r ./app/src/client/hooks/*.ts dan@10.0.0.166:~/flowforge/app/src/client/hooks/
scp -r ./app/src/client/pages/*.tsx dan@10.0.0.166:~/flowforge/app/src/client/pages/
scp -r ./app/src/client/components/ui/*.tsx dan@10.0.0.166:~/flowforge/app/src/client/components/ui/

# Rebuild Docker image on server
ssh dan@10.0.0.166 "cd ~/flowforge/app && docker build -t flowforge:latest ."

# Restart container with new image
ssh dan@10.0.0.166 "docker stop flowforge-api && docker rm flowforge-api && docker run -d --name flowforge-api --network flowforge-network -p 4000:4000 -e POSTGRES_HOST=flowforge-postgres -e POSTGRES_PASSWORD=flowforge_password -v /var/run/docker.sock:/var/run/docker.sock -v flowforge_plugin_data:/app/data flowforge:latest"

# Verify deployment
Invoke-RestMethod -Uri "http://10.0.0.166:4000/health"
```

### Database Access

```bash
# Connect to PostgreSQL
ssh dan@10.0.0.166 "sudo docker exec -it flowforge-postgres psql -U flowforge -d flowforge"

# Database credentials (development only)
# Host: flowforge-postgres (internal) or 10.0.0.166 (external)
# User: flowforge
# Password: flowforge_password
# Database: flowforge
```

## Docker Compose Deployment

### Production Setup

1. **Prepare the server**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin
```

2. **Clone and configure**

```bash
git clone https://github.com/LeForgeio/leforge.git
cd flowforge

# Create production environment file
cp .env.example .env

# Generate secure passwords
openssl rand -base64 32  # Use for POSTGRES_PASSWORD
openssl rand -base64 32  # Use for REDIS_PASSWORD
openssl rand -base64 64  # Use for JWT_SECRET
```

3. **Configure environment**

Edit `.env` with production values:

```bash
# Environment
ENVIRONMENT=production
LOG_LEVEL=info

# Database - use strong passwords
POSTGRES_PASSWORD=<generated-secure-password>
REDIS_PASSWORD=<generated-secure-password>

# Security
JWT_SECRET=<generated-secure-secret>

# Disable debug ports
```

4. **Start services**

```bash
# Build and start
docker-compose up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Using a Reverse Proxy

For production, use nginx or Traefik as a reverse proxy:

**nginx configuration:**

```nginx
server {
    listen 80;
    server_name flowforge.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name flowforge.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/flowforge.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/flowforge.yourdomain.com/privkey.pem;

    # API Gateway
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Web UI
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Kubernetes Deployment

### Helm Chart (Recommended)

```bash
# Add FlowForge Helm repository
helm repo add flowforge https://charts.flowforge.io
helm repo update

# Install with custom values
helm install flowforge flowforge/flowforge \
  --namespace flowforge \
  --create-namespace \
  --values values-production.yaml
```

**values-production.yaml:**

```yaml
global:
  environment: production

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: flowforge.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: flowforge-tls
      hosts:
        - flowforge.yourdomain.com

postgresql:
  auth:
    password: <secure-password>
  primary:
    persistence:
      size: 50Gi

redis:
  auth:
    password: <secure-password>

services:
  cryptoService:
    replicas: 2
    resources:
      requests:
        cpu: 100m
        memory: 256Mi
      limits:
        cpu: 500m
        memory: 512Mi

  mathService:
    replicas: 2
    resources:
      requests:
        cpu: 200m
        memory: 512Mi
      limits:
        cpu: 1000m
        memory: 1Gi
```

### Manual Kubernetes Deployment

Create Kubernetes manifests in `k8s/` directory:

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: flowforge
---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: flowforge-config
  namespace: flowforge
data:
  ENVIRONMENT: "production"
  LOG_LEVEL: "info"
---
# k8s/deployment-crypto-service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: crypto-service
  namespace: flowforge
spec:
  replicas: 2
  selector:
    matchLabels:
      app: crypto-service
  template:
    metadata:
      labels:
        app: crypto-service
    spec:
      containers:
        - name: crypto-service
          image: flowforge/crypto-service:latest
          ports:
            - containerPort: 3001
          envFrom:
            - configMapRef:
                name: flowforge-config
            - secretRef:
                name: flowforge-secrets
          livenessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 5
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
```

```bash
# Apply all manifests
kubectl apply -f k8s/
```

## Cloud Deployments

### AWS (ECS/EKS)

1. **Using ECS with Fargate**

```bash
# Create ECR repositories
aws ecr create-repository --repository-name flowforge/crypto-service
aws ecr create-repository --repository-name flowforge/math-service
# ... repeat for other services

# Build and push images
docker build -t flowforge/crypto-service ./services/crypto-service
docker tag flowforge/crypto-service:latest <account>.dkr.ecr.<region>.amazonaws.com/flowforge/crypto-service:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/flowforge/crypto-service:latest
```

2. **Using EKS**

```bash
# Create EKS cluster
eksctl create cluster \
  --name flowforge \
  --region us-east-1 \
  --nodegroup-name standard-workers \
  --node-type t3.medium \
  --nodes 3

# Deploy with Helm
helm install flowforge flowforge/flowforge -f values-aws.yaml
```

### Google Cloud (GKE)

```bash
# Create GKE cluster
gcloud container clusters create flowforge \
  --num-nodes=3 \
  --machine-type=e2-medium \
  --region=us-central1

# Get credentials
gcloud container clusters get-credentials flowforge --region=us-central1

# Deploy
helm install flowforge flowforge/flowforge -f values-gcp.yaml
```

### Azure (AKS)

```bash
# Create resource group
az group create --name flowforge --location eastus

# Create AKS cluster
az aks create \
  --resource-group flowforge \
  --name flowforge-cluster \
  --node-count 3 \
  --node-vm-size Standard_D2_v2

# Get credentials
az aks get-credentials --resource-group flowforge --name flowforge-cluster

# Deploy
helm install flowforge flowforge/flowforge -f values-azure.yaml
```

## Security Considerations

### Network Security

1. **Firewall rules**
   - Only expose ports 80, 443 (via reverse proxy)
   - Keep internal ports (5432, 6379, etc.) private

2. **TLS/SSL**
   - Use TLS 1.3 for all external connections
   - Use Let's Encrypt for free certificates

### Application Security

1. **Secrets management**
   ```bash
   # Use environment variables, not files
   # Consider HashiCorp Vault or AWS Secrets Manager
   ```

2. **API Key rotation**
   - Rotate API keys regularly
   - Implement key expiration

3. **Rate limiting**
   - Enable Kong rate limiting plugins
   - Set appropriate limits per tier

### Container Security

1. **Image scanning**
   ```bash
   # Scan images with Trivy
   trivy image flowforge/crypto-service:latest
   ```

2. **Non-root users**
   - All containers run as non-root users
   - Read-only file systems where possible

## Monitoring & Logging

### Prometheus + Grafana

```yaml
# Add to docker-compose.yml
prometheus:
  image: prom/prometheus:latest
  volumes:
    - ./infrastructure/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
  ports:
    - "9090:9090"

grafana:
  image: grafana/grafana:latest
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
  ports:
    - "3001:3000"
  volumes:
    - grafana_data:/var/lib/grafana
```

### Centralized Logging

```yaml
# Using Loki
loki:
  image: grafana/loki:latest
  ports:
    - "3100:3100"

promtail:
  image: grafana/promtail:latest
  volumes:
    - /var/log:/var/log
    - ./infrastructure/monitoring/promtail.yml:/etc/promtail/config.yml
```

## Backup & Recovery

### Database Backup

```bash
# PostgreSQL backup
docker-compose exec postgres pg_dump -U flowforge flowforge > backup.sql

# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec -T postgres pg_dump -U flowforge flowforge | gzip > backups/flowforge_$DATE.sql.gz

# Keep last 7 days
find backups/ -name "*.sql.gz" -mtime +7 -delete
```

### Redis Backup

```bash
# Trigger RDB snapshot
docker-compose exec redis redis-cli -a $REDIS_PASSWORD BGSAVE

# Copy RDB file
docker cp flowforge-redis:/data/dump.rdb backups/redis_backup.rdb
```

### Disaster Recovery

1. **Regular backups**: Daily database backups
2. **Offsite storage**: Store backups in S3/GCS
3. **Recovery testing**: Test restores monthly

## Scaling

### Horizontal Scaling

```yaml
# Scale specific services
docker-compose up -d --scale crypto-service=3 --scale math-service=2
```

### Vertical Scaling

Adjust resource limits in docker-compose:

```yaml
services:
  crypto-service:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Auto-scaling (Kubernetes)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: crypto-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: crypto-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## Health Checks

Monitor service health:

```bash
# Check all services
curl http://localhost:8000/api/v1/crypto/health
curl http://localhost:8000/api/v1/math/health
# ... etc

# Aggregate health check script
#!/bin/bash
SERVICES=("crypto" "math" "pdf" "ocr" "image" "llm" "vector" "data")
for service in "${SERVICES[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/api/v1/$service/health")
  echo "$service: $status"
done
```

## Troubleshooting

### Common Issues

1. **Service won't start**
   ```bash
   docker-compose logs <service-name>
   docker-compose restart <service-name>
   ```

2. **Database connection errors**
   ```bash
   # Check PostgreSQL
   docker-compose exec postgres psql -U flowforge -c "SELECT 1"
   ```

3. **Out of memory**
   - Increase Docker memory limit
   - Scale down concurrent services

### Support

- Check the [Troubleshooting Guide](getting-started.md#troubleshooting)
- Open a GitHub issue
- Join the community chat
