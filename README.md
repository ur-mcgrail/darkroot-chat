# Darkroot

> Self-hosted Matrix chat platform with a forest-themed custom client

![Status](https://img.shields.io/badge/status-alpha-orange)
![Version](https://img.shields.io/badge/version-0.1.0-green)

Darkroot is a private Matrix homeserver for a small group of friends, featuring a beautiful custom web client themed around Dark Souls' Darkroot Garden.

---

## 🌲 What is Darkroot?

A self-hosted chat platform that combines:
- **Matrix Synapse** homeserver for secure, decentralized messaging
- **Custom SvelteKit** client with the Lordran UI design system
- **Darkroot Garden theme** - deep forest greens, mystical shadows, and organic textures
- **Progressive Web App** - installable on iOS, Android, and desktop

---

## ✨ Features (Alpha MVP)

- ✅ Secure login (registration tokens, no email required)
- ✅ Create/join rooms
- ✅ Send/receive messages (real-time sync)
- ✅ Markdown rendering
- ✅ User profiles (avatar, display name)
- ✅ File/image sharing
- ✅ Darkroot forest theme
- ✅ PWA installable (iOS/Android/Desktop)
- ✅ Desktop web browser access

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ and npm
- Docker and Docker Compose
- Git

### Development Setup

1. **Clone the repository**
   ```bash
   cd /srv/dev/darkroot
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   cp client/.env.example client/.env
   # Edit .env files with your configuration
   ```

3. **Start development services**
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

4. **Install client dependencies**
   ```bash
   cd client
   npm install
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Access the app**
   - Client: http://localhost:5173
   - Synapse API: http://localhost:8008

See [docs/WORKING.md](docs/WORKING.md) for detailed development instructions.

---

## 📦 Project Structure

```
darkroot/
├── client/                 # SvelteKit application
├── synapse/                # Matrix Synapse configuration
├── nginx/                  # Reverse proxy configs
├── scripts/                # Utility scripts
├── docs/                   # Documentation
├── docker-compose.dev.yml  # Development stack
├── docker-compose.prod.yml # Production stack (VPS)
└── README.md
```

---

## 🎨 Design

Darkroot uses the **Lordran UI** design system with the **Darkroot Garden** variant:
- Deep forest greens (`#4a7c59`)
- Mystical gold accents (`#8b9556`)
- Shadowy depths and organic textures
- Premium typography (Cormorant Garamond + Inter)

---

## 🛠️ Tech Stack

**Backend:**
- Matrix Synapse (Python)
- PostgreSQL 16
- Redis 7
- Nginx (reverse proxy)

**Frontend:**
- SvelteKit (TypeScript)
- Matrix JS SDK
- Vite + PWA plugin
- Lordran UI (CSS)

**Deployment:**
- Docker Compose
- Let's Encrypt (SSL)
- VPS at chat.warrenmcgrail.com

---

## 📚 Documentation

- [WORKING.md](docs/WORKING.md) - Development guide
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment instructions
- [DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) - Darkroot variant guide
- [MATRIX-SETUP.md](docs/MATRIX-SETUP.md) - Synapse configuration

---

## 🗺️ Roadmap

**Alpha MVP (Current)**
- ✅ Text messaging
- ✅ File sharing
- ✅ PWA support
- ✅ Basic profiles

**Future Enhancements**
- Voice & video calls
- Screen sharing
- Multiple theme variants
- Message reactions
- Read receipts
- Native mobile apps

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---

## 🙏 Credits

**Built with:**
- [Matrix](https://matrix.org/) - Open network for secure, decentralized communication
- [SvelteKit](https://kit.svelte.dev/) - Web framework
- [Lordran UI](../lordran-ui/) - Design system

**Inspired by:**
- Dark Souls' Darkroot Garden
- Self-hosting and digital privacy

---

**Darkroot - Where the forest breathes with ancient magic** 🌲✨
