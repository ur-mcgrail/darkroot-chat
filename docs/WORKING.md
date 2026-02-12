# Darkroot - Development Guide

**Status**: Phase 4 Complete ✅ - Production deployed! 🎉
**Live**: `http://chat.warrenmcgrail.com` (pending DNS A record)
**Dev**: `http://192.168.1.161:5175`

## Current Features

✅ **Authentication & Sessions**
- Login with username/password
- Session persistence (survives page refresh)
- Logout functionality

✅ **Room Navigation**
- Room list sidebar with real-time updates
- Room avatars (first letter of name)
- Last message preview
- Unread message badges
- Click to select room

✅ **Messaging** (Phase 3)
- Send text messages (Enter to send, Shift+Enter for new line)
- View message history
- Real-time message sync
- Markdown support (bold, italic, code blocks, links)
- Auto-scroll to latest message
- Timestamps with smart formatting
- Message differentiation (own messages on right, others on left)
- Image/file attachment support (backend ready)

✅ **Room Management** (Phase 4 - NEW!)
- Create new rooms with + button
- Beautiful modal dialog for room creation
- Set room name and topic
- Automatic room selection after creation
- Real-time room list updates

✅ **Production Deployment** (Phase 4 - NEW!)
- Environment-based configuration (dev/prod)
- Production Docker Compose with Nginx
- One-command deployment script
- SSL/TLS ready (Let's Encrypt)
- Volume-mounted frontend (no rebuild for updates!)
- Health checks and monitoring

## Prerequisites

- Docker & Docker Compose
- Node.js 20+
- Git

## Development Setup

### 1. Start Backend Services

```bash
cd /srv/dev/darkroot
docker compose -f docker-compose.dev.yml up -d
```

This starts:
- PostgreSQL (port 5433)
- Redis
- Matrix Synapse (port 8008)

### 2. Install Client Dependencies

```bash
cd client
npm install
```

### 3. Start Development Server

```bash
# Start with network binding for LAN/Tailscale access
npm run dev -- --host 0.0.0.0 --port 5175
```

Access at:
- **Local**: http://localhost:5175
- **LAN**: http://192.168.1.161:5175
- **Tailscale**: http://100.119.125.74:5175

### 4. Login

**Admin credentials:**
- Username: `admin`
- Password: `darkroot_admin_2026`
- Homeserver: `http://localhost:8008`

## Development Workflow

### Making Changes

1. Edit files in `client/src/`
2. Changes hot-reload automatically
3. Test in browser

### Testing Matrix API

```bash
# Check API is running
curl http://localhost:8008/_matrix/client/versions

# View Synapse logs
docker logs darkroot-synapse-dev -f
```

### Database Access

```bash
# Connect to PostgreSQL
docker exec -it darkroot-postgres-dev psql -U synapse_user -d synapse
```

### Stop Services

```bash
docker compose -f docker-compose.dev.yml down
```

## Common Tasks

### Create New User (Registration Token)

```bash
# Generate token via Synapse API (requires admin)
curl -X POST http://localhost:8008/_synapse/admin/v1/registration_tokens/new \
  -H "Authorization: Bearer <admin_token>" \
  -d '{"uses_allowed": 5}'
```

### Reset Development Environment

```bash
# Warning: Deletes all data
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
```

## Troubleshooting

### Synapse won't start
- Check logs: `docker logs darkroot-synapse-dev`
- Verify database password in `synapse/homeserver.yaml` matches `.env`

### Can't connect from client
- Ensure Synapse is running: `curl http://localhost:8008/_matrix/client/versions`
- Check CORS settings (disabled in homeserver.yaml for dev)

### File ownership issues
- Fix: `sudo chown -R wmcgrail:staff /srv/dev/darkroot/`

## Testing Messaging (Phase 3)

### Send a Message

1. Login at http://192.168.1.161:5175
2. Select a room from the sidebar
3. Type in the message box at the bottom
4. Press **Enter** to send (Shift+Enter for new line)
5. Message appears instantly in the chat!

### Test Markdown

Try these in the message box:
```
**Bold text**
_Italic text_
`Inline code`
[Link](https://example.com)

```code block```
```

### View Message History

- Messages load automatically when you select a room
- Scroll up to see older messages
- Auto-scrolls to bottom when new messages arrive
- Stay scrolled up to prevent auto-scroll

### Real-time Sync

- Open the app in two browser windows
- Send a message in one window
- Watch it appear instantly in the other!

## Architecture

### Frontend (`/client`)
- **SvelteKit** - Web framework with TypeScript
- **Matrix JS SDK** - Matrix client library
- **Lordran UI** - Design system with Darkroot variant
- **marked** - Markdown rendering

### Backend Services (Docker)
- **Matrix Synapse** - Homeserver (Python)
- **PostgreSQL 16** - Database
- **Redis 7** - Caching and presence

### Key Files
```
client/src/
├── lib/
│   ├── matrix/
│   │   ├── client.ts          # Client wrapper, auth, session
│   │   ├── rooms.ts           # Room management, listeners
│   │   └── messages.ts        # Message sending/receiving (Phase 3)
│   ├── stores/
│   │   └── matrix.ts          # Reactive Svelte stores
│   └── components/
│       ├── RoomList.svelte    # Sidebar with rooms
│       ├── RoomView.svelte    # Main chat view
│       └── MessageList.svelte # Message display (Phase 3)
├── routes/
│   ├── +layout.svelte         # Root layout, session restore
│   ├── +page.svelte           # Main app (room list + view)
│   └── login/
│       └── +page.svelte       # Login page
└── app.css                    # Global styles, Lordran UI imports
```

## Invite Link Flow

**How token-based invites work (no email system needed):**

1. Admin opens Admin Panel (gear icon in top bar)
2. Clicks "Generate Invite Link" (creates token: 5 uses, 7-day expiry)
3. Link auto-copied to clipboard: `https://chat.warrenmcgrail.com/register?token=ABC123`
4. Share link via text, DM, etc.
5. New user clicks link → sees "Welcome to the Forest" page
6. User picks username + password → account created → auto-login → chat

**Two registration modes:**
- **Invite link** (`/register?token=...`): Token pre-filled, hidden from UI, welcoming messaging
- **Manual token** (`/register`): User must paste token into a visible field

**Key files:**
- `lib/matrix/admin.ts` — Token CRUD via Synapse Admin API
- `lib/components/AdminPanel.svelte` — Token management UI
- `routes/register/+page.svelte` — Registration page (both modes)
- `routes/+layout.svelte` — Auth guard with public route allowlist

## Next Steps

**Remaining polish:**
- [ ] DNS A record for `chat.warrenmcgrail.com → 15.204.89.177`
- [ ] SSL via `sudo certbot --nginx -d chat.warrenmcgrail.com` on VPS
- [ ] Update env.js to `https://` after SSL
- [ ] PWA configuration (manifest, service worker, offline)
- [ ] User settings and profile editing
- [ ] Desktop notifications
- [ ] Backup strategy
