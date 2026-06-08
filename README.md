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

### Restricting who can sign in (domain allow-list)

Gate sign-in to one or more email domains with `DOMAIN_WHITELIST` (unset = anyone):

```bash
DOMAIN_WHITELIST=@magickvoice.com            # single domain
DOMAIN_WHITELIST=@magickvoice.com, @acme.in  # several, comma-separated
```

It's enforced server-side on **Firebase sign-in**, **demo sign-in**, and **teammate invites** —
a blocked user gets a clear "Only @magickvoice.com email addresses can sign in" message, and
the login screen shows the allowed domain as a hint. Implemented in `src/lib/auth/whitelist.ts`.

## 🧾 Invoice file storage (S3)

Invoice **records** live in MongoDB; the generated invoice **document** (PDF, produced
by an external system) is persisted in **S3**.

1. Provision the bucket (CloudFormation via the **Serverless Framework v4**):
   ```bash
   # one-time: v4 requires a free Serverless account to authenticate
   npx serverless login                     # or: export SERVERLESS_ACCESS_KEY=<key>
   # make sure your AWS creds are available (env vars, profile, or SSO), then:
   npx serverless deploy --stage dev --region ap-south-1
   ```
   It's defined in [`serverless.yaml`](./serverless.yaml) — a private, encrypted bucket
   with public access blocked; files are only reached through short-lived presigned URLs.

   > Prefer a license-free / offline tool? The same `serverless.yaml` deploys with the
   > community fork: `npx osls deploy --stage dev` (no login required).

   The bucket name is **`<base>-<stage>`** — the stage is always postfixed, so each
   environment gets its own bucket:

   | Deploy command | Bucket created |
   | --- | --- |
   | `serverless deploy --stage dev` | `magickbook-invoices-dev` |
   | `serverless deploy --stage staging` | `magickbook-invoices-staging` |
   | `serverless deploy --stage prod` | `magickbook-invoices-prod` |

   S3 bucket names are globally unique — if `magickbook-invoices` is taken, override the
   base: `INVOICES_BUCKET_BASE=acme-magickbook-invoices serverless deploy --stage dev`.

2. Set the app env to the **deployed bucket name for that stage** (+ AWS creds / region) — see `.env.example`:
   ```bash
   INVOICES_BUCKET="magickbook-invoices-dev"   # must match the stage you deployed
   AWS_REGION="ap-south-1"
   ```

**Flow:** attach a file in the *New invoice* modal (or the *Upload* action on an invoice
row) → `POST /api/invoices/:id/document` streams it to S3 → `GET /api/invoices/:id/document`
redirects to a presigned URL to view/download. Without `INVOICES_BUCKET` set, uploads are
disabled gracefully (the rest of the app is unaffected). Implemented in `src/lib/s3.ts`.

## ⏰ Reminders (webhook + cron)

Each user can set **reminders** — from **Settings → Reminders**, or from any **lead**
or **account** page. When a reminder falls due, MagickBook **calls an outbound webhook**
the user configures in Settings (URL, HTTP method, custom headers, and a JSON payload
template with `{{title}}`, `{{dueAt}}`, `{{entityName}}`, `{{entityUrl}}`, … variables).
Point it at Slack, Zapier, n8n, or your own API. Config is **per-user**; reminders are
private to whoever created them.

Each user sets a **default** webhook in Settings, and any **lead can override** it from
its page ("Customize webhook for this lead") — reminders on that lead then call the lead's
webhook instead of the default. Resolution at delivery: enabled lead override → user default.

**Delivery** is done by a sweep endpoint that finds due reminders and fires each webhook:

```
GET|POST /api/reminders/dispatch     # cron secret → all users; signed-in user → their own
```

Set a shared secret so only your scheduler can trigger the full sweep:

```bash
CRON_SECRET="<a long random string>"
# optional: absolute base URL used to build {{entityUrl}} deep-links in payloads
APP_BASE_URL="https://your-app.vercel.app"
```

The scheduler must send it as `Authorization: Bearer $CRON_SECRET` (Vercel Cron does this
automatically). Without `CRON_SECRET`, the endpoint still works for a signed-in user's own
reminders (the "Run due now" button), and runs an open full sweep in non-production for the
in-memory demo.

- **Vercel free (Hobby):** [`vercel.json`](./vercel.json) ships a built-in cron, but Hobby
  crons only run **once per day**. For to-the-minute delivery, also point a **free external
  scheduler** at the dispatch URL every few minutes:
  - [cron-job.org](https://cron-job.org) — add the URL, set an `Authorization: Bearer …` header.
  - **GitHub Actions** — a `schedule:` workflow (min ~5 min) that `curl`s the URL with the secret.
- **Vercel Pro:** bump the `vercel.json` schedule to e.g. `*/5 * * * *`.

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
