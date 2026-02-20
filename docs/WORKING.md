# Darkroot Chat — Development Guide

**Status**: Active / Production ✅
**Live**: `https://chat.warrenmcgrail.com` (SSL, fully deployed)
**Dev server**: `http://192.168.1.161:5175`
**Last major update**: February 2026

---

## Current Features

### Authentication & Sessions
- Login with username/password
- Session persistence via localStorage (survives page refresh)
- Auto-restore session on load; redirect to /login if none found
- Logout clears credentials and stops sync
- Service worker auto-reloads page on new deploy (controllerchange event)

### Room Navigation (Left Sidebar)
- Path-notation header: `darkroot.chat.rooms`
- Room list with DS SVG icon, name, last message preview, member count
- Unread message badge (clears when room is viewed via read receipts)
- Invite badge + accept/decline flow for pending invites
- Discoverable public rooms section (rooms not yet joined)
- Create room modal (name, topic, public/private visibility)
- Room settings modal (name, topic, icon picker, visibility, members, danger zone)
- `darkroot.chat.users` panel with online/offline presence dots
  - User list sourced from Synapse Admin API (authoritative, matches admin panel)

### Messaging
- Dense IRC-log layout — full width, no bubble alignment flip for own messages
- Own messages: subtle 2px left-border green tint (no background bubble)
- Grouped messages collapse tightly (same sender within 5 min)
- Inline timestamps (hidden, revealed on row hover)
- Edit own messages — hover toolbar → pencil → inline textarea → Enter/Esc
  - `(edited)` indicator shown on edited messages
  - Sends `m.replace` relation; SDK auto-applies to original event
- Delete own messages — hover toolbar → trash → calls redactEvent()
  - Redaction listener calls fetchRoomMessages() so filter removes it immediately
- Markdown rendering: bold, italic, code blocks, blockquotes, links (via `marked`)
- Image and file message display
- Read receipts sent automatically; unread count clears live

### Message Reactions
- Darkroot-themed: 🗡️ Praise the Sun, 🤲 Humanity, 🧪 Estus, 🔥 Kindle Bonfire
- Hover "+" button to open picker; click to toggle (add/remove)
- Reaction counts shown below messages; hover for who reacted tooltip

### Link Sidebar
- Service links (YouTube, Instagram, Twitter/X, etc.) extracted from messages
- Right-hand panel toggle (link icon in header)
- Card shows thumbnail, title, URL, metadata (fetched on demand)
- X/Twitter links show a warning modal before sending

### Room Header
- DS SVG icon (themed per room name via `roomIcons.ts`)
- Room name (display font)
- Room topic/description (italic, muted; hint to set one if empty)
- Action buttons: stats (bar chart), room settings (gear), link panel toggle

### Stats Panel (`darkroot.chat.rooms.stats`)
- Opens as right-hand drawer (overlays chat)
- Paginates full room history via `paginateEventTimeline()` (100 events/page)
- Live-updating stats while loading; refresh button
- Overview: total messages, total words, avg words/msg, unique users
- Top voices: horizontal bar chart per user with message count + avg word length
- Last 14 days: column activity chart
- Hourly heatmap: 24-cell grid, opacity ∝ activity; labels at 6h intervals
- Longest message: quoted preview with word count

### Admin Panel (`darkroot.chat.admin`)
- User list (from Synapse Admin API) with active/deactivated status
- Deactivate users, reset passwords
- Registration token management: create, list, delete
- Generates shareable invite links: `https://chat.warrenmcgrail.com/register?token=...`

### User Settings (`darkroot.chat.user.settings`)
- Display name change
- Password change
- Avatar upload
- Path: `/settings`

### PWA
- Installable (manifest, icons)
- Offline shell (Workbox precache)
- Auto-update: service worker takes control → `controllerchange` → page reloads

---

## Development Setup

### 1. Start backend
```bash
cd /srv/dev/darkroot
docker compose -f docker-compose.dev.yml up -d
# PostgreSQL → localhost:5433
# Redis → localhost:6379
# Synapse → localhost:8008
```

### 2. Install dependencies
```bash
cd client && npm install
```

### 3. Start dev server
```bash
npm run dev -- --host 0.0.0.0 --port 5175
```

### 4. Login
- **Username**: `darkroot_admin`
- **Homeserver**: `http://localhost:8008`
- **Password**: see `synapse/homeserver.yaml` or reset via Admin API

---

## Key Architecture

### Stores (`lib/stores/matrix.ts`)
| Store | Type | Description |
|-------|------|-------------|
| `matrixClient` | `MatrixClient \| null` | SDK client instance |
| `rooms` | `Room[]` | Joined rooms, updated on sync |
| `messages` | `Message[]` | Current room messages |
| `currentRoomId` | `string \| null` | Selected room |
| `userPresence` | `Record<string, string>` | userId → 'online'\|'offline' |
| `typingUsers` | `string[]` | UserIDs currently typing |
| `isLoggedIn` | `boolean` | Auth state |
| `syncState` | `string` | 'PREPARED'\|'SYNCING'\|'ERROR' |

### Matrix module responsibilities
| File | Responsibility |
|------|---------------|
| `client.ts` | createClient (with `pendingEventOrdering: Detached`), login, restore, logout |
| `rooms.ts` | updateRoomList(), listeners for Timeline/Receipt/Redaction |
| `messages.ts` | fetchRoomMessages() + read receipt, send/edit/delete, setupMessageListeners() |
| `admin.ts` | listUsers(), deactivateUser(), token CRUD — all via Synapse Admin API |
| `stats.ts` | loadFullHistory() pagination, computeStats() aggregation |
| `reactions.ts` | addReaction(), removeReaction(), getMessageReactions() |
| `typing.ts` | handleTyping(), stopTyping() |
| `presence.ts` | setupPresenceListeners() |

### Known gotchas
- **`pendingEventOrdering: Detached`** must be set in `createClient()` — without it, `redactEvent()` throws `"Cannot call getPendingEvents with pendingEventOrdering == chronological"`
- **Read receipts**: never send for local echo events (IDs starting with `~`) — server returns 400
- **User list**: use `listUsers()` from `admin.ts`, NOT `client.getUsers()` (SDK cache is unreliable and uses different field names)
- **Svelte reactive statements**: `$: knownUsers = $matrixClient ? ...` only re-runs when `$matrixClient` changes. Add a dependency on `$rooms` to re-trigger after sync
- **Global CSS vs Svelte scoped**: Svelte only overrides explicitly declared properties. Always declare `flex-direction` explicitly when using flexbox

---

## Deploy

### Quick (most common — frontend changes only)
```bash
cd /srv/dev/darkroot/client && npm run build

TEMP=$(mktemp -d) && mkdir -p $TEMP/client
cp ../docker-compose.prod.yml $TEMP/
cp -r ../nginx $TEMP/
cp -r build $TEMP/client/build
rsync -avz $TEMP/ vps:/opt/darkroot/ && rm -rf $TEMP
# Host nginx serves files immediately — no restart needed
```

### Via script (interactive)
```bash
cd /srv/dev/darkroot && ./scripts/deploy.sh
# Prompts if uncommitted changes; builds + deploys
```

### Verify
```bash
curl -sf -o /dev/null -w "%{http_code}" https://chat.warrenmcgrail.com
ssh vps "docker compose -f /opt/darkroot/docker-compose.prod.yml ps"
```

---

## Troubleshooting

### Synapse won't start
```bash
ssh vps "docker logs darkroot-synapse-prod --tail 50"
```

### Messages not appearing
- Check browser console for SDK errors
- Verify `currentRoomId` matches the room
- Try `fetchRoomMessages()` manually in console

### User list empty in sidebar
- The reactive statement needs `$rooms` as a dependency to fire after sync
- If using `client.getUsers()` — switch to `listUsers()` from `admin.ts`

### Delete not working
- Confirm `pendingEventOrdering: Detached` is set in `createClient()`
- Check browser console for "getPendingEvents" error

### Build fails
```bash
cd /srv/dev/darkroot/client
npm ci && npm run build
```

---

## Roadmap / Ideas

- [ ] Desktop/push notifications
- [ ] Voice/video calls (Matrix VOIP)
- [ ] Message search
- [ ] More themes
- [ ] Pinned messages in room header
- [ ] Mobile app (Capacitor?)
- [ ] NAS backup of Synapse DB (daily pg_dump)
