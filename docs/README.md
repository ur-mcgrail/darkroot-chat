# Darkroot - Project Documentation

> Self-hosted Matrix chat platform with Darkroot Garden theme

**Quick Links:**
- [Development Guide](WORKING.md) - How to develop Darkroot locally
- [Deployment Guide](DEPLOYMENT.md) - Deploy to production (VPS)
- [Design System](DESIGN-SYSTEM.md) - Darkroot variant and components
- [Matrix Setup](MATRIX-SETUP.md) - Synapse configuration details
- [AI Agent Guide](CLAUDE.md) - Instructions for AI assistants

---

## What is Darkroot?

Darkroot is a private, self-hosted Matrix homeserver with a custom web client themed around Dark Souls' Darkroot Garden. It's built for small groups of friends who want:

- **Privacy**: Self-hosted, no third-party services
- **Beautiful Design**: Forest-themed Lordran UI with mystical aesthetics
- **Modern Features**: Real-time messaging, file sharing, PWA support
- **Simplicity**: Easy to deploy, maintain, and use

---

## Features (Alpha MVP)

- ✅ **Secure Authentication** - Registration tokens, no email required
- ✅ **Real-time Messaging** - Instant message delivery via Matrix sync
- ✅ **Markdown Support** - Rich text formatting in messages
- ✅ **File Sharing** - Upload and share images/files
- ✅ **User Profiles** - Custom avatars and display names
- ✅ **Darkroot Theme** - Deep forest greens, mystical shadows
- ✅ **Progressive Web App** - Install on iOS, Android, Desktop
- ✅ **Private Server** - No federation, invite-only

---

## Tech Stack

**Backend:**
- Matrix Synapse 1.x (Python homeserver)
- PostgreSQL 16 (database)
- Redis 7 (caching, presence)
- Docker Compose (orchestration)

**Frontend:**
- SvelteKit + TypeScript
- Matrix JS SDK
- Vite PWA plugin
- Lordran UI design system

**Deployment:**
- Development: lordran-home (`/srv/dev/darkroot/`)
- Production: VPS (`chat.warrenmcgrail.com`)
- SSL: Let's Encrypt via nginx

---

## Quick Start

See [WORKING.md](WORKING.md) for complete development setup.

```bash
# 1. Start services
docker compose -f docker-compose.dev.yml up -d

# 2. Install client dependencies
cd client && npm install

# 3. Start dev server
npm run dev

# 4. Access app
open http://localhost:5173
```

Default admin user: `admin` / `darkroot_admin_2026`

---

## Project Structure

```
darkroot/
├── client/                 # SvelteKit web application
├── synapse/                # Matrix homeserver config
├── nginx/                  # Reverse proxy configs
├── scripts/                # Utility scripts
├── docs/                   # Documentation (you are here)
└── docker-compose.dev.yml  # Development services
```

---

## Roadmap

**Alpha (Current)**
- Text chat, file sharing, PWA

**Beta (Next)**
- Voice & video calls
- Multiple theme variants
- Message reactions

**v1.0 (Future)**
- Native mobile apps
- End-to-end encryption UI
- Open source release

---

## License

MIT - See LICENSE file

---

**Darkroot - Where the forest breathes with ancient magic** 🌲✨
