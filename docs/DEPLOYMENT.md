# Darkroot — Production Deployment

**Live URL**: `https://chat.warrenmcgrail.com` (SSL via Let's Encrypt)
**VPS IP**: `15.204.89.177`
**VPS access**: `ssh vps` from lordran-home (jumpbox)
**Synapse version**: pinned at `v1.147.0` in `docker-compose.prod.yml`

---

## Production Architecture

```
Internet (443)
    ↓
Host nginx on VPS  (/etc/nginx/sites-enabled/chat.warrenmcgrail.com)
    ├── Static SPA → /opt/darkroot/client/build/
    ├── /_matrix/* → proxy → localhost:8008  (Synapse)
    └── /_synapse/* → proxy → localhost:8008  (Synapse Admin API)

Docker containers on VPS:
    darkroot-postgres-prod  (postgres:16-alpine)
    darkroot-redis-prod     (redis:7-alpine)
    darkroot-synapse-prod   (matrixdotorg/synapse:v1.147.0)

No nginx container — host nginx handles SSL and static files directly.
No .env.prod file — values are in docker-compose.prod.yml directly.
```

---

## Standard Deploy (Frontend Changes)

This is the common case — Synapse/DB don't need restarting for client-only changes.

```bash
# 1. Build on lordran-home
cd /srv/dev/darkroot/client
npm run build

# 2. Package and rsync to VPS
TEMP=$(mktemp -d)
mkdir -p $TEMP/client
cp /srv/dev/darkroot/docker-compose.prod.yml $TEMP/
cp -r /srv/dev/darkroot/nginx $TEMP/
cp -r build $TEMP/client/build
rsync -avz $TEMP/ vps:/opt/darkroot/
rm -rf $TEMP

# 3. No restart needed — host nginx serves /opt/darkroot/client/build/ directly
# Verify:
curl -sf -o /dev/null -w "%{http_code}" https://chat.warrenmcgrail.com
```

Or use the script (asks about uncommitted changes):
```bash
cd /srv/dev/darkroot && ./scripts/deploy.sh
```

---

## Check Production Status

```bash
# Container health
ssh vps "docker compose -f /opt/darkroot/docker-compose.prod.yml ps"

# Synapse health
ssh vps "curl -sf http://localhost:8008/health"

# Site reachable
curl -sf -o /dev/null -w "%{http_code}" https://chat.warrenmcgrail.com

# Synapse logs
ssh vps "docker logs darkroot-synapse-prod --tail 50"

# Nginx status
ssh vps "systemctl status nginx"
```

---

## Synapse Configuration

Config lives **only on the VPS** (never overwrite from dev):
```
/opt/darkroot/synapse/homeserver.yaml   — main config
/opt/darkroot/synapse/*.signing.key     — server signing key (DO NOT DELETE)
```

To edit:
```bash
ssh vps "nano /opt/darkroot/synapse/homeserver.yaml"
ssh vps "docker restart darkroot-synapse-prod"
```

Key settings in `homeserver.yaml`:
- `server_name: chat.warrenmcgrail.com`
- `public_baseurl: https://chat.warrenmcgrail.com`
- `enable_registration: true` + `registration_requires_token: true`
- `federation_enabled: false` (private server)
- `max_upload_size: 50M`

---

## Admin Access

### Get admin access token (for raw API calls)
```bash
# Query the DB directly
ssh vps "docker exec darkroot-postgres-prod psql -U synapse_user -d synapse \
  -c \"SELECT u.name, at.token FROM access_tokens at \
       JOIN users u ON at.user_id = u.name \
       WHERE u.admin = true \
       ORDER BY at.last_validated DESC LIMIT 3;\""
```

### List all users
```bash
TOKEN=<admin-token>
ssh vps "curl -s -H 'Authorization: Bearer $TOKEN' \
  http://localhost:8008/_synapse/admin/v2/users?limit=50 | python3 -m json.tool"
```

### Create registration invite token
```bash
TOKEN=<admin-token>
ssh vps "curl -s -X POST -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{\"uses_allowed\": 1}' \
  http://localhost:8008/_synapse/admin/v1/registration_tokens/new"
# Use token at: https://chat.warrenmcgrail.com/register?token=<TOKEN>
```

---

## Restarting Services

```bash
# All containers
ssh vps "docker compose -f /opt/darkroot/docker-compose.prod.yml restart"

# Just Synapse
ssh vps "docker restart darkroot-synapse-prod"

# Host nginx (after config changes)
ssh vps "sudo nginx -t && sudo systemctl reload nginx"
```

---

## Database

```bash
# Connect
ssh vps "docker exec -it darkroot-postgres-prod psql -U synapse_user -d synapse"

# Size
ssh vps "docker exec darkroot-postgres-prod psql -U synapse_user -d synapse \
  -c \"SELECT pg_size_pretty(pg_database_size('synapse'));\""

# Backup
ssh vps "docker exec darkroot-postgres-prod pg_dump -U synapse_user synapse \
  > /tmp/synapse-backup-\$(date +%Y%m%d).sql"
```

---

## SSL / Let's Encrypt

Certificates managed by certbot on the VPS:
```bash
# Check expiry
ssh vps "sudo certbot certificates"

# Renew (certbot runs automatically via cron)
ssh vps "sudo certbot renew --dry-run"
```

Nginx cert paths: `/etc/letsencrypt/live/chat.warrenmcgrail.com/`

---

## Logs

```bash
# Synapse (most useful)
ssh vps "docker logs darkroot-synapse-prod -f --tail 100"

# Postgres
ssh vps "docker logs darkroot-postgres-prod --tail 50"

# Nginx access log
ssh vps "sudo tail -f /var/log/nginx/access.log"

# Nginx error log
ssh vps "sudo tail -f /var/log/nginx/error.log"
```

---

## Updating Synapse Version

Edit `docker-compose.prod.yml` on lordran-home:
```yaml
synapse:
  image: matrixdotorg/synapse:v1.XXX.0  # update version
```

Then deploy:
```bash
cd /srv/dev/darkroot
# Transfer updated compose file
rsync docker-compose.prod.yml vps:/opt/darkroot/

# Pull new image and restart
ssh vps "docker compose -f /opt/darkroot/docker-compose.prod.yml pull synapse"
ssh vps "docker compose -f /opt/darkroot/docker-compose.prod.yml up -d synapse"
```

> Check [Synapse releases](https://github.com/element-hq/synapse/releases) before updating.
> Breaking changes are documented in upgrade notes.

---

## Nginx Config

Config on VPS: `/etc/nginx/sites-enabled/chat.warrenmcgrail.com`

The config in the repo (`nginx/darkroot.conf`) is deployed on each rsync
but the live config on VPS may have diverged. Check before deploying nginx changes:

```bash
ssh vps "cat /etc/nginx/sites-enabled/chat.warrenmcgrail.com"
```

---

## Rollback

```bash
cd /srv/dev/darkroot
git log --oneline -10          # find a good commit
git checkout <hash> -- client/ # restore client files
cd client && npm run build     # rebuild
# then deploy as normal
git checkout main              # restore branch
```

---

## Disk Usage

```bash
ssh vps "df -h /opt"
ssh vps "docker system df"

# Clean unused images
ssh vps "docker image prune -f"
```
