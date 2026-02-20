# Darkroot Chat — AI Agent Instructions

**Project**: Darkroot Chat
**Location**: `/srv/dev/darkroot/`
**Type**: Self-hosted Matrix homeserver + SvelteKit PWA client
**Production**: `https://chat.warrenmcgrail.com` (live, SSL, fully deployed)
**Theme**: Dark Souls / Darkroot Garden aesthetic (forest greens, mystical shadows)

---

## Quick Orientation

This is a **private group chat** for a small friend group. It runs a Matrix Synapse homeserver
on a VPS, with a custom SvelteKit frontend. Registration is invite-only (token-based).

**Active users (as of Feb 2026):**
- `@darkroot_admin:chat.warrenmcgrail.com` — server admin account
- `@unheardwar:chat.warrenmcgrail.com` — regular user

**Active rooms:**
- `The Bonfire` — the only room (all others deleted)

---

## Development Environment

### Start backend services (lordran-home)
```bash
cd /srv/dev/darkroot
docker compose -f docker-compose.dev.yml up -d
# Services: PostgreSQL (5433), Redis, Synapse (8008)
```

### Start frontend dev server
```bash
cd /srv/dev/darkroot/client
npm run dev -- --host 0.0.0.0 --port 5175
# Access: http://localhost:5175 or http://192.168.1.161:5175
```

### Dev admin login
- **Username**: `darkroot_admin`
- **Homeserver**: `http://localhost:8008`
- **Password**: check `synapse/homeserver.yaml` or reset via Synapse admin API

> ⚠️ The old `admin` user no longer exists. Always use `darkroot_admin`.

---

## Production

**URL**: `https://chat.warrenmcgrail.com`
**VPS**: `15.204.89.177` (accessible via `ssh vps` from lordran-home)
**Synapse version**: pinned at `matrixdotorg/synapse:v1.147.0` in `docker-compose.prod.yml`

### Production architecture
```
Internet → Host nginx (443, SSL) → /opt/darkroot/client/build/  (static SPA)
                                 → proxy /_matrix/* → localhost:8008 (Synapse)
                                 → proxy /_synapse/* → localhost:8008 (Admin API)

Docker (VPS): postgres, redis, synapse
No .env.prod file — containers use hardcoded values in docker-compose.prod.yml
```

### Deploy workflow (frontend only — most common)
```bash
# From lordran-home:
cd /srv/dev/darkroot/client
npm run build

# Package and transfer
TEMP=$(mktemp -d)
mkdir -p $TEMP/client
cp ../docker-compose.prod.yml $TEMP/
cp -r ../nginx $TEMP/
cp -r build $TEMP/client/build
rsync -avz $TEMP/ vps:/opt/darkroot/
rm -rf $TEMP

# No container restart needed — host nginx serves files directly from disk
```

Or use the interactive script (prompts if uncommitted changes):
```bash
cd /srv/dev/darkroot
./scripts/deploy.sh
```

### Check production status
```bash
ssh vps "docker compose -f /opt/darkroot/docker-compose.prod.yml ps"
curl -sf -o /dev/null -w "%{http_code}" https://chat.warrenmcgrail.com
```

---

## Key File Locations

### Client source (`client/src/`)
```
lib/
  matrix/
    client.ts       — createClient(), login, session restore, logout
                      IMPORTANT: pendingEventOrdering: Detached required for redactEvent()
    rooms.ts        — room list, listeners, updateRoomList(), RoomEvent.Receipt
    messages.ts     — fetchRoomMessages(), sendMessage(), editMessage(), deleteMessage()
                      Sends read receipt for last confirmed event (skips ~ local echoes)
    admin.ts        — Synapse Admin API: listUsers(), registration tokens, deactivate
    stats.ts        — loadFullHistory(), computeStats() — paginates full room history
    reactions.ts    — addReaction(), removeReaction(), getMessageReactions()
    typing.ts       — handleTyping(), stopTyping()
    presence.ts     — presence listeners, userPresence store

  stores/
    matrix.ts       — all Svelte stores: matrixClient, rooms, messages, currentRoomId,
                      userPresence, typingUsers, isLoggedIn, currentUser, syncState

  components/
    RoomList.svelte     — Left sidebar: room list + user list
                          User list uses listUsers() from admin.ts (NOT SDK cache)
    RoomView.svelte     — Main chat area: header, body, input dock
    MessageList.svelte  — Message rendering, edit/delete toolbar, reactions
    LinkSidebar.svelte  — Extracted service links (YouTube, Instagram, etc.)
    StatsPanel.svelte   — Room statistics drawer (bar charts, heatmap)
    AdminPanel.svelte   — Admin modal: users, registration tokens
    CreateRoomModal.svelte
    RoomSettingsModal.svelte

  utils/
    roomIcons.ts    — Dark Souls SVG icons keyed by room name
    media.ts        — fetchMediaUrl() for Matrix MXC URLs

routes/
  +layout.svelte    — Auth guard, session restore, SW controllerchange reload
  +page.svelte      — Main app shell (room list + room view)
  login/            — Login page
  register/         — Registration (invite token flow)
  settings/         — User profile, display name, password
```

---

## Current Features (Feb 2026)

### Chat
- Dense IRC-log layout (no bubble alignment flip for own messages)
- Own messages: subtle 2px left-border accent, no background bubble
- Message edit/delete for own messages (hover toolbar)
- Inline edit mode — Enter saves, Esc cancels; `(edited)` indicator shown
- Message reactions — Darkroot-themed (Praise the Sun, Humanity, Estus, Kindle Bonfire)
- Markdown rendering (bold, italic, code, blockquote, links)
- Real-time sync via Matrix SDK event listeners
- Read receipts sent automatically when room is viewed; unread badge clears live

### Navigation & UI
- Path-notation labels throughout: `darkroot.chat.rooms`, `darkroot.chat.users`,
  `darkroot.chat.rooms.settings`, `darkroot.chat.admin`, etc.
- Dim prefix + bright leaf node pattern (monospace font)
- Room header: DS SVG icon + room name + topic/description
- Member count shown in room list sidebar (not header)
- Dark Souls themed SVG room icons (keyed by room name)
- Bonfire emoji favicon (`/emoji/bonfire.png`)

### Sidebar & Panels
- Link sidebar: YouTube, Instagram, Twitter/X, etc. extracted to right panel
- Stats panel: full history pagination, bar charts, 14-day activity, 24h heatmap
- User list from Synapse Admin API (authoritative, matches Admin panel)

### Infrastructure
- PWA (installable, offline shell via Workbox)
- Service worker auto-reload on deploy (controllerchange → window.location.reload())
- Invite-only registration with token management in Admin panel
- Admin panel: user management, registration tokens

---

## Common Tasks

### Add a new feature to the client
1. Read this file and `WORKING.md`
2. Edit in `client/src/`
3. `npm run dev` for hot reload
4. Build + deploy (see above)
5. Update `WORKING.md` feature list
6. Log in `/opt/home-os/CHANGELOG.md`

### Get an admin access token (for raw API calls)
```bash
# From the Synapse postgres DB on VPS:
ssh vps "docker exec darkroot-postgres-prod psql -U synapse_user -d synapse \
  -c \"SELECT name, token FROM access_tokens at JOIN users u ON at.user_id=u.name WHERE u.admin=true LIMIT 5;\""
```

### Create a registration invite link
1. Login as `darkroot_admin` at chat.warrenmcgrail.com
2. Open Admin panel (gear icon, top right)
3. Generate token → copy invite URL
4. Send URL to invitee: `https://chat.warrenmcgrail.com/register?token=...`

### Reset a user's password
Available in Admin panel → Users tab (admin-only reset password feature).

### Check Synapse logs
```bash
ssh vps "docker logs darkroot-synapse-prod -f --tail 50"
```

---

## Design System

- **CSS variables**: defined in `/srv/dev/lordran-ui/src/variants/darkroot.css`
- **Font**: `--font-display` (decorative), `--font-body`, `--font-mono`
- **Colors**: `--accent-primary`, `--accent-primary-bright`, `--accent-primary-dim`,
  `--accent-gold`, `--bg-base`, `--bg-elevated`, `--bg-surface`, `--text-primary`, etc.
- **Global CSS imports**: `client/src/app.css` pulls in lordran-ui base + darkroot variant

### Svelte CSS gotcha
Svelte scoped CSS only overrides properties **explicitly declared** in the component.
Undeclared properties fall through to global CSS. Always explicitly declare `flex-direction`
when using flexbox if a global stylesheet might set it differently.

---

## File Ownership

**NEVER use `sudo` for project files.**
All files must be owned by `wmcgrail:staff`.

```bash
# Fix if needed:
sudo chown -R wmcgrail:staff /srv/dev/darkroot/
```

---

## Git

- **Repo**: `https://github.com/ur-mcgrail/darkroot-chat.git`
- **Branch**: `main`
- **Remote ahead**: normal — we commit and push periodically, not after every deploy

```bash
cd /srv/dev/darkroot
git status
git add -A && git commit -m "feat: ..."
git push origin main
```

---

## Related Docs

- `WORKING.md` — Full feature list and development guide
- `DEPLOYMENT.md` — Production deployment reference
- `/opt/home-os/CHANGELOG.md` — Session-by-session log of all changes
