# Darkroot - AI Agent Instructions

**Project**: Darkroot Chat
**Location**: `/srv/dev/darkroot/`
**Type**: Matrix homeserver + SvelteKit client
**Theme**: Darkroot Garden (forest greens, mystical shadows)

## Project Overview

Darkroot is a self-hosted Matrix chat platform with:
- **Backend**: Matrix Synapse + PostgreSQL + Redis
- **Frontend**: SvelteKit + Matrix JS SDK
- **Design**: Lordran UI + Darkroot variant
- **Deployment**: Dev (lordran-home), Prod (VPS at chat.warrenmcgrail.com)

## Development Environment

**Start services:**
```bash
cd /srv/dev/darkroot
docker compose -f docker-compose.dev.yml up -d
```

**Access:**
- Client dev server: http://localhost:5173
- Synapse API: http://localhost:8008
- Admin user: `admin` / `darkroot_admin_2026`

## Key Locations

- **Client code**: `/srv/dev/darkroot/client/src/`
- **Synapse config**: `/srv/dev/darkroot/synapse/homeserver.yaml`
- **Design system**: `/srv/dev/lordran-ui/src/variants/darkroot.css`
- **Chat components**: `/srv/dev/lordran-ui/src/components/chat/`
- **Documentation**: `/srv/dev/darkroot/docs/` (auto-syncs to NAS nightly)

## Common Tasks

### Add New Feature to Client
1. Read relevant docs in `/srv/dev/darkroot/docs/`
2. Make changes in `client/src/`
3. Test with `npm run dev` in client directory
4. Update documentation

### Modify Synapse Config
1. Edit `synapse/homeserver.yaml`
2. Restart Synapse: `docker compose -f docker-compose.dev.yml restart synapse`
3. Check logs: `docker logs darkroot-synapse-dev`

### Update Design System
1. Edit `/srv/dev/lordran-ui/src/variants/darkroot.css`
2. Changes reflect immediately in client (hot reload)

## File Ownership CRITICAL

**NEVER use sudo for project files!**
- All files MUST be owned by `wmcgrail:staff`
- If sudo needed: `sudo chown -R wmcgrail:staff /srv/dev/darkroot/`

## Documentation System

**Update docs after significant changes:**
- `/srv/dev/darkroot/docs/` - Project documentation
- `/opt/home-os/CHANGELOG.md` - Session logging (MANDATORY)

**Docs sync to NAS nightly at 2:00 AM**

## Deployment

**Production VPS:**
- Domain: chat.warrenmcgrail.com
- Access: Via lordran-home jumpbox
- Deploy script: `/srv/dev/darkroot/scripts/deploy-to-vps.sh` (to be created)

## Next Steps (Post-Alpha)

- Voice/video calls
- Multiple theme variants
- Native mobile apps
- Message reactions

## Help

- [WORKING.md](WORKING.md) - Development guide
- [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment
- [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) - Theme customization
- [MATRIX-SETUP.md](MATRIX-SETUP.md) - Synapse configuration
