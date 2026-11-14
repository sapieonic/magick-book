<div align="center">
  <img src="src/app/icon.svg" width="84" alt="MagickBook" />
  <h1>MagickBook CRM</h1>
  <p><em>Your whole book of business, in one place.</em></p>
  <p>Leads → accounts → invoices &amp; expenses. A full-stack Next.js CRM.</p>
</div>

---

MagickBook is a lightweight account-management CRM: capture and qualify leads on a
drag-and-drop pipeline, convert wins into accounts (contacts + history carry over),
then run each account — contacts, invoices and expenses — to see true margin.

## Features

- **Today** (`/dashboard`): a work queue of due reminders, stale follow-ups and overdue
  invoices (oldest first); a pipeline ribbon and stage table; receivables aging, top
  debtors and collections this month against last; reminders due later this week.
- **Leads**: a drag-and-drop board and a table, with Lost and Archived views; an add-lead
  drawer; lead detail with a stage track, activity timeline, reach-out logging, reminders,
  mark-lost and **convert to account**.
- **Accounts**: a filterable list (Active / At risk / Churned / Archived) and an account
  page with Overview, Contacts, Documents, Invoices, Expenses, Activity and History tabs.
  Documents holds proposals and agreements; History is the account's audit trail.
- **Money**: billed, paid, outstanding and margin across visible accounts, outstanding
  aging, collected by month, and the invoice and expense ledgers (with CSV export).
- **Archive and restore**: deleting soft-deletes (archives). Archived leads and accounts
  have their own views and restore in one click; an archived account stays readable.
- **Audit log**: every create, edit, archive and restore is recorded with field-level
  changes, per record (History) and workspace-wide (Settings, admins only).
- **Reminders** with outbound webhooks, and **Slack** notifications on lead lifecycle events
  (both below).
- **Shell**: sidebar with live counts, a ⌘K command palette, a global "New" lead drawer,
  and a light or dark theme (follows the OS until chosen).
- **Team and roles (RBAC)**: admins see everything; standard users see only the records
  they own. Admins invite teammates with a role.
- **Business time zone**: "today", "this month" and "overdue" are India Standard Time
  (Asia/Kolkata) on the server and in every browser, and every date is shown in IST.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript |
| Styling | **Tailwind CSS v4** (CSS-first tokens in `globals.css`, light and dark); IBM Plex Sans, Plex Sans Condensed and Plex Mono; `lucide-react` icons |
| Database | **MongoDB** via Mongoose (MongoDB Atlas in prod; in-memory for local dev) |
| Auth | **Firebase Auth** (client + Admin SDK), JWT session cookies via `jose` |
| Files | **S3** (presigned URLs) for invoice files and account documents |
| Drag and drop | `@dnd-kit` |
| Tests | Vitest + Testing Library, hermetic in-memory MongoDB |

## Getting started

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

## Connecting real services

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

1. Create a Firebase project → enable the **Google** and **Email/Password** providers.
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

Once the client vars are present the login screen swaps demo mode for real Google and
email/password sign-in (the login screen offers no other provider). Sign-in posts the Firebase ID token to
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

## File storage (S3)

Invoice **records** live in MongoDB; the generated invoice **document** (PDF, produced
by an external system) is persisted in **S3**, as are the proposals and agreements on an
account's Documents tab (same bucket).

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
disabled gracefully with a 501 (the rest of the app is unaffected). Account documents
follow the same pattern at `/api/accounts/:id/documents`. Implemented in `src/lib/s3.ts`.

## Reminders (webhook + cron)

Each user can set **reminders** — from **Settings → Reminders**, or from any **lead**
or **account** page. When a reminder falls due, MagickBook **calls an outbound webhook**
the user configures in Settings (URL, HTTP method, custom headers, and a JSON payload
template with `{{title}}`, `{{dueAt}}`, `{{entityName}}`, `{{entityUrl}}`, … variables).
Point it at Slack, Zapier, n8n, or your own API. Config is **per-user**; reminders are
private to whoever created them.

Each user sets a **default** webhook in Settings, and any **lead can override** it from
its page ("Customize webhook for this lead") — reminders on that lead then call the lead's
webhook instead of the default. Resolution at delivery: enabled lead override → user default.

In a **lead or account note composer**, type **`/remind <text>`** and press Enter: the
composer switches to reminder mode and opens a reminder modal prefilled with your text as
the title (you confirm the time in the picker). Regular notes still post with ⌘/Ctrl+Enter.

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

## Slack notifications (lead lifecycle)

MagickBook posts a message to a dedicated Slack channel whenever a lead's status
shifts — so the team sees deals move in real time without watching the board:

- **Converted**: a lead became an account (with deal value + the new account link).
- **Lost**: a lead was marked lost (with the reason).
- **Lane move**: a lead changed pipeline stage (e.g. *Contacted → Qualified*).
- **Comment**: a note / call / email / WhatsApp / SMS was logged on a lead.

Set up an [**Incoming Webhook**](https://api.slack.com/messaging/webhooks) for the
target channel, then configure:

```bash
# required — enables notifications (when unset, the feature silently no-ops)
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX"
# optional — override the webhook's default channel by id
SLACK_CHANNEL="C0B8DKZ7PGF"
# optional — custom bot name + avatar shown in Slack
SLACK_BOT_NAME="MagickBook CRM"
SLACK_BOT_ICON=":crystal_ball:"          # emoji, or an https image URL
```

Deep-links back into the CRM reuse `APP_BASE_URL` / `NEXT_PUBLIC_APP_URL` (same as
reminders). Delivery is fire-and-forget with an 8s timeout and never throws, so a
Slack outage can't break a CRM action. Without `SLACK_WEBHOOK_URL` the app behaves
exactly as before. Implemented in `src/lib/slack.ts`.

## Project structure

```
src/
  app/
    login/                  # sign in / sign up
    onboarding/             # workspace setup
    (app)/                  # authenticated shell + pages
      dashboard/ leads/ accounts/ money/
      settings/             # team, categories, reminders, audit
    api/                    # route handlers (auth, leads, accounts, invoices, money,
                            # dashboard, nav, reminders, members, audit, workspace)
  components/
    ui/                     # the kit: Button, Field, Badge, Panel, Table, Tabs, Popover, Overlay, Money…
    layout/                 # AppShell, Sidebar, TopBar, MobileTabBar, CommandPalette,
                            # PageHeader, Page, SessionContext, ShellContext
    theme/                  # ThemeProvider, ThemeToggle
    dashboard/ leads/ accounts/ money/ invoices/ activity/ reminders/ settings/
    ActivityTimeline.tsx AuditTimeline.tsx
  lib/
    db.ts models.ts seed.ts services.ts rbac.ts api.ts types.ts constants.ts
    dates.ts                # IST calendar maths and date formatting
    receivables.ts money-charts.ts reminders.ts slack.ts s3.ts
    auth/                   # firebase-client, firebase-admin, session, whitelist, server helpers
    client.ts utils.ts
  proxy.ts                  # route protection (Next 16's renamed middleware)
test/                       # api/, lib/, components/ (Vitest)
```

## How auth and RBAC work

- A signed **JWT session cookie** (`jose`, HS256) carries the user identity. `proxy.ts`
  guards every non-public route by verifying it on the edge.
- `getCurrentUser()` resolves the cookie to a MongoDB user; new users go through onboarding.
- Every list query is scoped by `src/lib/rbac.ts`: **admins** get the whole workspace,
  **standard** users get `ownerId === self`. Account sub-resources (contacts, documents,
  invoices, expenses, activity) inherit the parent account's visibility. An archived
  account's sub-resources stay readable but can't change until the account is restored.
- Reminders are private to whoever created them, admins included.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build (also the typecheck) |
| `npm run start` | Run the production build |
| `npm run seed` / `seed:force` | Seed a real `MONGODB_URI` database |
| `npm test` | Run the Vitest suite once (`test:watch`, `test:coverage`) |
