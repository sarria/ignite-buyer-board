# Ignite Buyer Board

Kanban-style account management tool for Ignite buying teams. Replaces Asana.

---

## Quick start

```
# First time only
npm install
cd client && npm install && cd ..
cp .env.example .env   # then fill in MONGODB_URI (auth is a stub locally)

# Run — two terminals
npm run dev            # Terminal 1: API server  (port 3001)
cd client && npm run dev   # Terminal 2: frontend (port 5173)
```

Then open **http://localhost:5173**. Vite proxies `/api` → `http://localhost:3001` automatically.
Sanity-check the DB connection with `npm run test:db`.

> **Windows / PowerShell:** `&&` and `cp` are not available in Windows PowerShell 5.1. Use:
> ```powershell
> # First time only
> npm install
> cd client; npm install; cd ..
> Copy-Item .env.example .env   # then fill in MONGODB_URI
>
> # Run — two terminals
> npm run dev          # Terminal 1: API server (port 3001)
> cd client; npm run dev   # Terminal 2: frontend (port 5173)
> ```

---

## Prerequisites

- Node.js 18+
- MongoDB Atlas cluster (credentials in `.env`)
- A copy of `.env` with all secrets filled in (see `.env.example`)

---

## First-time setup

```
npm install
cd client && npm install && cd ..
```

---

## Running the app

Open **two terminals** and run one command in each.

**Terminal 1 — API server** (port 3001):
```
npm run dev
```

**Terminal 2 — Frontend** (port 5173):
```
cd client
npm run dev
```

Then open `http://localhost:5173` in your browser.

---

## Seeding data from Asana

Run this once to load the Team Rachel export into MongoDB.
Safe to re-run — it upserts, never duplicates.

```
node migration/asana-seed.js --auto
```

The `--auto` flag skips the interactive prompts and applies these defaults:
- **Archive**: Cancelled Clients, Completed Campaigns
- **Skip**: Duplicate Task Board
- **Keep**: everything else

To configure columns interactively instead (omit `--auto`):
```
node migration/asana-seed.js
```

---

## Testing the database connection

```
npm run test:db
```

---

## Project structure

```
/
├── client/          # React + Vite frontend (port 5173)
├── server/          # Express API (port 3001)
│   ├── controllers/ # Route handler logic
│   ├── db/          # MongoDB connection + indexes
│   ├── middleware/  # Auth (stub), error handler
│   └── routes/      # Express routers
├── migration/       # Asana export + seeder scripts
├── API.md           # Full API reference for Postman
├── SPEC.md          # Product specification
└── CLAUDE.md        # Build instructions
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values.

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `ANTHROPIC_API_KEY` | For AI agents (note formatting, health summary) |
| `ASANA_PAT` | Asana personal access token (revoke when migration is done) |
| `ASANA_SYNC_ENABLED` | Set to `false` when Asana is retired |
| `MSAL_CLIENT_ID` | Microsoft SSO — get from Stephen Alba |
| `MSAL_TENANT_ID` | Microsoft SSO — get from Stephen Alba |
| `MSAL_CLIENT_SECRET` | Microsoft SSO — get from Stephen Alba |
| `PORT` | API server port (default `3001`) |
| `CLIENT_URL` | Frontend URL for CORS (default `http://localhost:5173`) |

---

## API reference

See `API.md` for all endpoints with request bodies, ready to import into Postman.

---

## Build status

| Step | Description | Status |
|------|-------------|--------|
| 1 | Database — MongoDB connection + indexes | ✅ Done |
| 2 | Auth — Microsoft SSO (MSAL) | ⏭ Bypassed (stub) |
| 3 | Boards + Columns + Fields API | ✅ Done |
| 4 | Cards API | ✅ Done |
| 5 | Comments + Subtasks API | ✅ Done |
| 6 | Migration seeder | ✅ Done |
| 7 | Frontend: Board view (read-only) | ✅ Done |
| 8 | Frontend: Drag and drop | 🔲 Next |
| 9 | Frontend: Card detail drawer | 🔲 Todo |
| 10 | Frontend: Board settings | 🔲 Todo |
| 11 | Frontend: Auth — Microsoft SSO | 🔲 Todo |
| 12 | Frontend: Admin — user management | 🔲 Todo |
