# Darkroot Production Deployment Guide

**Status**: Deployed to VPS (2026-02-12)
**URL**: `http://chat.warrenmcgrail.com` (pending DNS + SSL)
**VPS IP**: `15.204.89.177`

## Architecture (Production)

The VPS uses the **host nginx** (not a Docker nginx container) for SSL termination and static file serving:

```
Internet → Host nginx (80/443) → Static files at /opt/darkroot/client/build/
                                → Proxy /_matrix/* to localhost:8008 (Synapse container)
                                → Proxy /_synapse/* to localhost:8008 (Admin API)
```

Docker services: PostgreSQL, Redis, Synapse (exposed on `127.0.0.1:8008` only)
Nginx config: `/etc/nginx/sites-enabled/chat.warrenmcgrail.com`
Frontend: `/opt/darkroot/client/build/` (SvelteKit static SPA)

## Prerequisites

1. **VPS Access** — direct SSH or via lordran-home jumpbox
   ```bash
   ssh vps 'echo Connected'
   ```

2. **Domain DNS** pointed to VPS IP
   - `chat.warrenmcgrail.com` → `15.204.89.177`

3. **Environment File** configured on VPS
   - `.env.prod` at `/opt/darkroot/.env.prod`

## Initial Setup (One-Time)

### 1. Prepare VPS

```bash
# SSH to VPS via jumpbox
ssh lordran-home "ssh vps"

# Create project directory
mkdir -p /opt/darkroot
cd /opt/darkroot

# Create .env.prod with production values
cat > .env.prod << 'EOF'
# PostgreSQL
POSTGRES_PASSWORD=<generate-strong-password>
POSTGRES_USER=synapse_user
POSTGRES_DB=synapse

# Synapse
SYNAPSE_SERVER_NAME=chat.warrenmcgrail.com
SYNAPSE_REPORT_STATS=no
REGISTRATION_SHARED_SECRET=<generate-strong-secret>

# Frontend
PUBLIC_HOMESERVER_URL=https://chat.warrenmcgrail.com
PUBLIC_APP_NAME=Darkroot Chat
PUBLIC_APP_VERSION=0.1.0
PUBLIC_DEFAULT_THEME=darkroot
EOF

# Generate strong passwords
openssl rand -base64 32  # For POSTGRES_PASSWORD
openssl rand -base64 64  # For REGISTRATION_SHARED_SECRET
```

### 2. Generate Synapse Config

```bash
# On VPS
cd /opt/darkroot

# Generate homeserver.yaml
docker run -it --rm \
  -v $(pwd)/synapse:/data \
  -e SYNAPSE_SERVER_NAME=chat.warrenmcgrail.com \
  -e SYNAPSE_REPORT_STATS=no \
  matrixdotorg/synapse:latest generate

# Update homeserver.yaml with database config
# (See synapse/homeserver.yaml in dev for reference)
```

### 3. Configure Synapse

Edit `/opt/darkroot/synapse/homeserver.yaml`:

```yaml
# Database
database:
  name: psycopg2
  args:
    user: synapse_user
    password: <your-postgres-password>
    database: synapse
    host: postgres
    port: 5432
    cp_min: 5
    cp_max: 10

# Registration
enable_registration: true
registration_requires_token: true
enable_registration_without_verification: true

# Federation (disabled for private server)
federation_enabled: false

# Max upload size
max_upload_size: 50M

# Public baseurl
public_baseurl: https://chat.warrenmcgrail.com
```

### 4. SSL/TLS Setup (Optional but Recommended)

```bash
# Install certbot on VPS
ssh lordran-home "ssh vps 'sudo apt update && sudo apt install certbot'"

# Get SSL certificate (DNS challenge)
ssh lordran-home "ssh vps 'sudo certbot certonly --manual --preferred-challenges dns -d chat.warrenmcgrail.com'"

# Copy certificates to nginx/ssl/
ssh lordran-home "ssh vps 'sudo cp /etc/letsencrypt/live/chat.warrenmcgrail.com/fullchain.pem /opt/darkroot/nginx/ssl/ && \
  sudo cp /etc/letsencrypt/live/chat.warrenmcgrail.com/privkey.pem /opt/darkroot/nginx/ssl/ && \
  sudo chown -R $(whoami):$(whoami) /opt/darkroot/nginx/ssl/'"
```

## Deployment Process

### Quick Deploy

From lordran-home:

```bash
cd /srv/dev/darkroot
./scripts/deploy.sh
```

The script will:
1. ✓ Build frontend locally
2. ✓ Create deployment package
3. ✓ Transfer to VPS via jumpbox
4. ✓ Deploy Docker services
5. ✓ Run health checks

### Manual Deploy

If you need more control:

```bash
# 1. Build frontend
cd /srv/dev/darkroot/client
npm run build

# 2. Transfer files
rsync -avz ../docker-compose.prod.yml lordran-home:/tmp/darkroot/
rsync -avz ../nginx/ lordran-home:/tmp/darkroot/nginx/
rsync -avz build/ lordran-home:/tmp/darkroot/client-build/

ssh lordran-home "rsync -avz /tmp/darkroot/ vps:/opt/darkroot/"

# 3. Deploy on VPS
ssh lordran-home "ssh vps 'cd /opt/darkroot && \
  mv client-build client/build && \
  docker compose -f docker-compose.prod.yml up -d --build'"
```

## Post-Deployment

### Create Admin User

```bash
ssh lordran-home "ssh vps 'docker exec -it darkroot-synapse-prod register_new_matrix_user \
  -c /data/homeserver.yaml \
  http://localhost:8008 \
  -u admin \
  -p <strong-password> \
  --admin'"
```

### View Logs

```bash
# All services
ssh lordran-home "ssh vps 'docker compose -f /opt/darkroot/docker-compose.prod.yml logs -f'"

# Specific service
ssh lordran-home "ssh vps 'docker logs darkroot-synapse-prod -f'"
ssh lordran-home "ssh vps 'docker logs darkroot-nginx-prod -f'"
```

### Health Checks

```bash
# Synapse API
curl http://chat.warrenmcgrail.com/_matrix/client/versions

# Nginx
curl http://chat.warrenmcgrail.com/health
```

## Updating

### Frontend Changes Only

```bash
cd /srv/dev/darkroot/client
npm run build

rsync -avz build/ lordran-home:/tmp/darkroot-build/
ssh lordran-home "scp -r /tmp/darkroot-build/* vps:/opt/darkroot/client/build/"

# Reload nginx (picks up new files via volume mount)
ssh lordran-home "ssh vps 'docker compose -f /opt/darkroot/docker-compose.prod.yml restart nginx'"
```

### Backend Changes

```bash
# Run full deployment
./scripts/deploy.sh
```

## Rollback

```bash
# Stop current deployment
ssh lordran-home "ssh vps 'docker compose -f /opt/darkroot/docker-compose.prod.yml down'"

# Restore from backup (if you have one)
# Or redeploy from known-good commit:
cd /srv/dev/darkroot
git checkout <good-commit>
./scripts/deploy.sh
```

## Troubleshooting

### Synapse won't start

```bash
# Check logs
ssh lordran-home "ssh vps 'docker logs darkroot-synapse-prod'"

# Common issues:
# - Database password mismatch
# - homeserver.yaml syntax error
# - Database not ready (wait for healthcheck)
```

### Can't connect to homeserver

```bash
# Check if Synapse is running
ssh lordran-home "ssh vps 'curl http://localhost:8008/health'"

# Check nginx proxy
ssh lordran-home "ssh vps 'curl http://localhost/_matrix/client/versions'"

# Check from outside
curl http://chat.warrenmcgrail.com/_matrix/client/versions
```

### SSL Issues

```bash
# Verify certificates exist
ssh lordran-home "ssh vps 'ls -la /opt/darkroot/nginx/ssl/'"

# Check nginx config
ssh lordran-home "ssh vps 'docker exec darkroot-nginx-prod nginx -t'"

# Renew certificates
ssh lordran-home "ssh vps 'sudo certbot renew'"
```

## Monitoring

### Docker Stats

```bash
ssh lordran-home "ssh vps 'docker stats'"
```

### Disk Usage

```bash
ssh lordran-home "ssh vps 'docker system df'"

# Clean up old images/volumes
ssh lordran-home "ssh vps 'docker system prune -a'"
```

### Database Size

```bash
ssh lordran-home "ssh vps 'docker exec darkroot-postgres-prod psql -U synapse_user -d synapse -c \"SELECT pg_size_pretty(pg_database_size(current_database()));\"'"
```

## Backup & Restore

### Backup Database

```bash
ssh lordran-home "ssh vps 'docker exec darkroot-postgres-prod pg_dump -U synapse_user synapse > /tmp/synapse-backup-$(date +%Y%m%d).sql'"
```

### Restore Database

```bash
ssh lordran-home "ssh vps 'docker exec -i darkroot-postgres-prod psql -U synapse_user synapse < /path/to/backup.sql'"
```

## Production Checklist

Before going live:

- [ ] Strong passwords in .env.prod
- [ ] SSL/TLS certificates configured
- [ ] DNS pointing to VPS
- [ ] Firewall rules configured (UFW)
- [ ] Admin user created
- [ ] Health checks passing
- [ ] Backups configured
- [ ] Monitoring set up
- [ ] Test login from external network
- [ ] Test sending messages
- [ ] Test creating rooms

## Performance Tuning

### PostgreSQL

Edit `docker-compose.prod.yml` postgres service:

```yaml
command: >
  postgres
  -c shared_buffers=256MB
  -c effective_cache_size=1GB
  -c maintenance_work_mem=64MB
  -c checkpoint_completion_target=0.9
```

### Nginx Caching

Already configured in `nginx/darkroot.conf` with:
- Static asset caching (1 year)
- Gzip compression
- Rate limiting

## Security

### Firewall (UFW)

```bash
ssh lordran-home "ssh vps 'sudo ufw allow 80/tcp'"
ssh lordran-home "ssh vps 'sudo ufw allow 443/tcp'"
ssh lordran-home "ssh vps 'sudo ufw enable'"
```

### Auto-Updates

```bash
ssh lordran-home "ssh vps 'sudo apt install unattended-upgrades'"
```

### Regular Maintenance

- Update Docker images monthly
- Renew SSL certificates (certbot auto-renews)
- Review logs for suspicious activity
- Backup database weekly
- Clean up old Docker volumes

---

**Need Help?** Check logs first, then consult:
- Matrix Synapse docs: https://matrix-org.github.io/synapse/
- Docker docs: https://docs.docker.com/
- Nginx docs: https://nginx.org/en/docs/
