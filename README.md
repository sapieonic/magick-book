<div align="center">
  <img src="public/logo.png" width="84" alt="MagickBook" />
  <h1>MagickBook CRM</h1>
  <p><em>Your whole book of business, in one place.</em></p>
  <p>Leads → accounts → invoices &amp; expenses. A full-stack Next.js CRM.</p>
</div>

---

MagickBook is a lightweight account-management CRM: capture and qualify leads on a
drag-and-drop pipeline, convert wins into accounts (contacts + history carry over),
then run each account — contacts, invoices and expenses — to see true margin.

## ✨ Features

- **Auth** — Firebase Auth (Google, Microsoft, email/password) with a passwordless **demo mode** for local dev.
- **Onboarding** — quick workspace setup.
- **Dashboard** — KPIs, pipeline funnel, revenue this month, and a "needs attention" feed.
- **Leads** — Kanban board with drag-between-stages + a table view, add-lead drawer, lead detail with an activity timeline, reach-out logging, mark-lost, and **convert to account**.
- **Accounts** — filterable list (Active / At risk / Churned), and a detailed account view with Overview / Contacts / Invoices / Expenses / Activity tabs.
- **Money** — workspace-wide invoices, expenses and margin.
- **Team & roles (RBAC)** — Admins see everything; Standard users see only the records they added. Invite teammates with a role.

## 🧱 Stack

| Layer | Choice |
| --- | --- |
| Framework | **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript |
| Styling | **Tailwind CSS v4** — clean modern SaaS; Bricolage Grotesque / Hanken Grotesk / JetBrains Mono |
| Database | **MongoDB** via Mongoose (MongoDB Atlas in prod; in-memory for local dev) |
| Auth | **Firebase Auth** (client + Admin SDK), JWT session cookies via `jose` |
| Drag & drop | `@dnd-kit` |

## 🚀 Getting started

```bash
npm install
npm run dev          # → http://localhost:3000
```

That's it. **With no configuration**, the app:

1. starts an **in-memory MongoDB** (no install needed),
2. seeds the sample workspace from the wireframes, and
3. lets you sign in via **demo mode** — sign in with `riya@acme.in` (admin/owner) to
   land in the seeded workspace, or `neha@acme.in` to experience a scoped **Standard** user.

> The demo login is passwordless and only active while Firebase isn't configured.

## 🔌 Connecting real services

Copy the example env file and fill in what you need:

```bash
cp .env.example .env.local
```

### MongoDB Atlas

Set a connection string and the app uses it instead of the in-memory DB:

```bash
MONGODB_URI="mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
```

Seed a real database (optional):

```bash
npm run seed          # seeds only if empty
npm run seed:force    # wipes domain collections and reseeds
```

### Firebase Auth

1. Create a Firebase project → enable **Google**, **Microsoft**, and **Email/Password** providers.
2. **Client** config (Project settings → Your apps → SDK setup):
   ```bash
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   ```
3. **Admin** credentials (Project settings → Service accounts → Generate new private key):
   ```bash
   FIREBASE_PROJECT_ID=...
   FIREBASE_CLIENT_EMAIL=...
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

Once the client vars are present the login screen swaps demo mode for the real Google /
Microsoft / email-password flows. Sign-in posts the Firebase ID token to
`/api/auth/session`, the server verifies it with the Admin SDK and mints a session cookie.

Also set a strong session secret in any non-local environment:

```bash
SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
```

## 🗂️ Project structure

```
src/
  app/
    login/                  # split-panel sign in / sign up
    onboarding/             # workspace setup
    (app)/                  # authenticated shell (sidebar) + pages
      dashboard/ leads/ accounts/ money/ settings/team/
    api/                    # route handlers (auth, leads, accounts, money, members…)
  components/
    ui/                     # Button, Field, Modal/Drawer, Badge, Avatar, Toast…
    layout/                 # Sidebar, SessionContext
    leads/  accounts/  settings/   ActivityTimeline
  lib/
    db.ts models.ts seed.ts services.ts rbac.ts
    auth/                   # firebase-client, firebase-admin, session, server helpers
    client.ts utils.ts constants.ts types.ts
  proxy.ts                  # route protection (Next 16 middleware)
```

## 🔐 How auth & RBAC work

- A signed **JWT session cookie** (`jose`, HS256) carries the user identity. `proxy.ts`
  guards every non-public route by verifying it on the edge.
- `getCurrentUser()` resolves the cookie to a MongoDB user; new users go through onboarding.
- Every list query is scoped by `src/lib/rbac.ts`: **admins** get the whole workspace,
  **standard** users get `ownerId === self`. Account sub-resources (contacts, invoices,
  expenses) inherit the parent account's visibility.

## 📜 Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run seed` / `seed:force` | Seed a real `MONGODB_URI` database |
