# FirstMove

A chess openings teaching app for beginner to intermediate players. Learn and practice openings through an interactive chessboard, guided move sequences, and a library organized by name and ECO code.

**Platforms:** Web · iOS · Android

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Web | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Mobile | Expo + React Native, TypeScript |
| Shared logic | `packages/core` — chess.js, openings data, shared types |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| Data fetching | TanStack Query |
| State | Zustand |
| Chess board (web) | react-chessboard |
| Chess board (mobile) | Custom SVG — react-native-svg |
| Chess logic | chess.js |
| Deployment | Vercel (web) · EAS Build (mobile) · Supabase cloud |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [pnpm](https://pnpm.io/) v9+
- [Git](https://git-scm.com/)
- [Expo Go](https://expo.dev/go) on your phone (for mobile development)
- A [Supabase](https://supabase.com/) account (free)

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/jsantos15/firstmove.git
cd firstmove
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up environment variables

```bash
cp .env.example apps/web/.env.local
```

Fill in your Supabase project URL and keys. Find these in your Supabase project → Settings → API.

### 4. Run the web app

```bash
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Run the mobile app

```bash
pnpm dev:mobile
```

Scan the QR code with Expo Go on your phone.

---

## Project Structure

```
firstmove/
├── apps/
│   ├── web/          → Next.js web app
│   └── mobile/       → Expo mobile app (iOS + Android)
├── packages/
│   ├── core/         → Shared chess logic, openings data, types
│   └── supabase/     → Supabase client, schema, migrations
├── docs/             → Architecture docs, decisions log
└── scripts/          → Build and deploy automation
```

---

## Development Workflow

All work starts on a `feature/*` branch. Never commit directly to `main` or `staging`.

```bash
git checkout -b feature/your-feature-name
# make changes
git commit -m "feat: describe what you added"
# merge to staging for review, then main for production
```

---

## License

MIT
