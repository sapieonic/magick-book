# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# MagickBook CRM — agent notes

Full-stack Next.js 16 CRM: leads → accounts → invoices/expenses → margin. Read `README.md` for product scope. Key conventions below.

## Commands
- `npm run dev` — dev server (Turbopack) at :3000. Demo-login: `riya@acme.in` (admin/owner) or `neha@acme.in` (standard).
- `npm run build` — production build; **this is the typecheck** (no separate `tsc`/`lint` script).
- `npm test` — Vitest run-once. `npm run test:watch`, `npm run test:coverage`.
  - Single file: `npx vitest run test/api/leads.test.ts`. By name: `npx vitest run -t "converts a lead"`.
- `npm run seed` / `seed:force` — seed a real `MONGODB_URI` DB (seed-if-empty / wipe+reseed). Not needed for in-memory dev (auto-seeds).

## Stack & gotchas (Next 16 / React 19)
- App Router, **Turbopack**, TypeScript, Tailwind **v4** (CSS-first `@theme` in `src/app/globals.css` — no `tailwind.config`). The **Daybook** glass design system lives there: tokens (`ground`, `glass*`, `ink-1/2/3`, `line`, `accent`, status `paid|due|overdue|lost` each with `-fill`/`-tint`, `stage-1..5`, radii `bar|control|card|panel|shell`) plus a few component classes (`.glass`, `.glass-lane`, `.glass-card`, `.glass-pop`, `.tnum`, `.figure`, `.ledger`, `.hatch`). Dark theme = the same tokens redefined under `:root[data-theme="dark"]` (`dark:` variant follows `data-theme`). Breakpoints: `md` = 720px, `xl` = 1280px.
- Fonts (wired in `src/app/layout.tsx` via `next/font/google`): IBM Plex Sans (`font-sans`), Plex Sans Condensed (`font-condensed`, large figures), Plex Mono (`font-mono`, invoice numbers and keys).
- Route handler `params` and `cookies()` are **async** (`await ctx.params`, `await cookies()`).
- **Dates: `src/lib/dates.ts` is the only place for calendar maths and date display**, in the business time zone (IST, Asia/Kolkata, fixed +05:30): `calendarDaysBetween`, `daysSince`, `businessDay`, `endOfBusinessDay`, `startOfBusinessMonth`, `monthKey`, `isoDay`, and the formatters (`shortDate`, `longDate`, `absoluteTime`, `dueWords`…). Server and browser agree whatever their own zone. No `date-fns` calendar helpers, server-local `setHours`/`getMonth()`, UTC-day maths or bare `toLocaleString()`.
- Route protection lives in **`src/proxy.ts`** (Next 16 renamed `middleware` → `proxy`). It guards pages on the edge; **API handlers guard themselves** via `requireUser()` (matcher excludes `/api`).

## Data & auth
- DB: Mongoose. `connectDB()` (`src/lib/db.ts`) uses `MONGODB_URI`, else spins an **in-memory MongoDB** and auto-seeds (`src/lib/seed.ts`). Connection is cached on `globalThis`.
- Models + interfaces (`I*`): `src/lib/models.ts`. DTOs sent to the client: `src/lib/types.ts`.
- Auth: Firebase (client `src/lib/auth/firebase-client.ts`, admin `firebase-admin.ts`) + signed JWT cookie (`jose`, HS256, `session.ts`). Passwordless **demo mode** when Firebase env is absent. Sign-in domain allow-list in `auth/whitelist.ts` (`DOMAIN_WHITELIST`).
- Server auth helpers (`src/lib/auth/server.ts`): `requireUser()` (throws `UnauthorizedError`), `getCurrentUser()`, `getSessionUser()`, `upsertUserFromIdentity()` (find-or-create; first user of an email domain becomes admin/owner, later ones auto-join as standard).
- **RBAC**: always scope queries via `src/lib/rbac.ts`. `leadScope`/`accountScope` return Mongoose filter fragments pinned to `workspaceId`; admins see the whole workspace, standard users get `ownerId === self`. Account sub-resources inherit the parent's visibility: resolve the parent with `loadAccount(user, id, "read" | "write")` from `services.ts` (`"read"` also finds an archived account, so its tabs stay viewable; `"write"` is live-only, so an archived parent 404s every mutation). Leads resolve the same way with `loadLead(user, id, "read" | "write")`. Use `canEditOwned()` before mutating. Reminders are private to their creator (`reminderScope`), admins included.
- **Soft-delete**: all domain docs carry `deletedAt`/`deletedBy` (`SoftDelete` mixin in `models.ts`). `leadScope`/`accountScope` exclude soft-deleted by default; pass `{ archived: true }` for the trash view (`?archived=1` on list endpoints). Sub-resource queries (contacts/invoices/expenses/documents) filter `deletedAt: null` directly. DELETE handlers **stamp `deletedAt`, never `deleteOne`**; restore via `PATCH … { action: "restore" }` (loads from the archived scope). Archiving an account just stamps the account — children stay put, readable but frozen until restore.
- **Audit trail**: call `audit({ entity, entityId, entityLabel, action, actor, changes?, leadId?, accountId? })` from `services.ts` after every create/update/delete/restore. Use `diffChanges(before, patch, fields)` for field-level update diffs (it no-ops empty diffs). Tag entries with `leadId`/`accountId` so per-record history (`/api/leads|accounts/[id]/audit`) is a cheap indexed lookup; the workspace-wide log (`/api/audit`, admin-only) reads by `workspaceId`. Rendered by `src/components/AuditTimeline.tsx`.
- **Documents** (proposals/agreements): account-scoped, S3-backed (`Document` model, `documentKey()` in `s3.ts`, same bucket as invoices). CRUD at `/api/accounts/[id]/documents[/:docId]`. Uploads degrade to **501** when `INVOICES_BUCKET` is unset (mirrors invoice files).
- **`(app)` segment is `force-dynamic`** (auth + per-request session) — it is not statically prerendered.

## API route pattern
Every handler in `src/app/api/**` follows the same shape — copy an existing route (e.g. `src/app/api/leads/route.ts`):
1. Wrap with `route(...)` from `src/lib/api.ts` — centralizes auth/error handling (maps `UnauthorizedError`→401, `HttpError`→its status, else 500).
2. `const user = await requireUser()` then `await connectDB()`.
3. Filter list queries through the matching `*Scope(user)` from rbac.
4. Return data via `ok(data, status?)` / errors via `fail(msg, status)` or `throw new HttpError(msg, status)`.
5. Convert Mongoose docs to DTOs with the `serialize*` functions in `api.ts` — **never return raw Mongoose docs** (they leak `_id`/internal fields). Resolve owner display names in one query via `ownerNameMap()`.
- **Lane order**: one ordering everywhere — `order` asc, then `createdAt` asc, then id (`LANE_SORT` / `byLaneOrder` in `lib/leadFilters.ts`). Board drops send `{ stage, beforeId?, afterId? }` (the visible neighbours); the stage route places the lead between them across the whole workspace lane, writing one document unless the gap is exhausted (then it respaces the lane by 1024).
- Cross-cutting domain logic lives in `src/lib/services.ts`: `logActivity()` (timeline entries), `accountFinance()` / `accountFinances()` (billed/paid/outstanding/overdue/margin rollup), `nextInvoiceNumber()`.
- **Receivables rules** live in `src/lib/receivables.ts` (pure, IST days and months via `lib/dates`, works on docs and DTOs): `isOutstanding`, `daysPastDue` (due date, else issue date), `agingKey` (`AgingKey`: current/d30/d60/d60plus), `isOverdue`, `displayStatus`, `rollupMoney` (margin may be negative; 0 when nothing is billed), `buildOutstandingAging`, `collections`. `/api/dashboard`, `/api/money`, `accountFinances()` and the account screens all use them, so "overdue" means one thing everywhere. `lib/money-charts.ts` holds only Money-page builders (collected-by-month, ledger grouping/filters).
- **Slack notifications** (`src/lib/slack.ts`): Incoming-Webhook posts on lead lifecycle events — convert (`leads/[id]/convert`), lost / lane-move (`leads/[id]/stage`), activity/comment (`leads/[id]/activities`). Gated on `SLACK_WEBHOOK_URL` (no-ops when unset, like `INVOICES_BUCKET`); optional `SLACK_CHANNEL` / `SLACK_BOT_NAME` / `SLACK_BOT_ICON`. Call the notifiers after the audit/activity writes; they're `await`ed (so delivery completes before the serverless fn can freeze) but never throw, so a Slack outage can't fail the mutation. All user-supplied text (lead/company names, comment bodies) is mrkdwn-escaped via `esc()` before embedding.

## Frontend
- Pages are client components using `useApi`/`api` from `src/lib/client.ts` (`useApi` = fetch-on-mount + loading/error/refresh + optimistic set). The `(app)` server layout injects the session via `SessionContext`.
- **Refresh after mutations**: every successful `api.post/patch/put/delete` dispatches the window event `mb:data-changed` (`DATA_CHANGED` in `lib/dataChanged.ts`). The shell listens and refreshes `/api/nav`; pages never refresh the nav themselves. A page that must reload data changed elsewhere subscribes with `useDataChanged(refresh)` from `layout/ShellContext`.
- **App shell** (`src/components/layout/*`, mounted by `AppShell`): glass sidebar with live counts from `GET /api/nav` (56px icon rail below `xl`, bottom tab bar below `md`), top bar with the ⌘K command palette and the ink "New" (global add-lead drawer). Pages don't render their own header: `<PageHeader title actions breadcrumb />` portals into the top bar. Lay pages out edge to edge with `<Page>` / `<PageSplit rail>` (`layout/Page.tsx`) — no centred max-width.
- Reusable UI in `src/components/ui/*` (Button/LinkButton, Badge/StatusPill/StageLabel, Avatar/OwnerCell, Panel, Table, Tabs, SegmentedControl, ProportionBar (`size="md"` for the 36px statement bar), Overlay, OverflowMenu, OwnerFilter, Staleness, Field/AmountInput…). In panels use `EmptyState` / `ErrorState` / `RowsSkeleton` / `DatedList` from `ui/Misc`. Helpers: `plural`, `agoInWords`, `parseAmount` (`lib/utils`), `useMediaQuery` (`lib/useMediaQuery`), `deriveOwners`/`filterByOwners` (`lib/leadFilters`). No hex colours or gradients in components: tokens live in `globals.css`. Overlays portal to `<body>` (glass panels trap `position: fixed`); popovers and menus (`OverflowMenu`, `OwnerFilter`…) go through the shared `ui/Popover`. Icons: `lucide-react` at `strokeWidth={1.5}`. Drag-and-drop via `@dnd-kit`.
- Money is INR — render amounts with `<Money>` (muted ₹, tabular, "–" for zero; `compact` for lakh shorthand) or `formatMoney`/`formatINR`/`formatINRCompact` for strings.
- Invoice files: records in Mongo, PDFs in **S3** (`src/lib/s3.ts`, presigned URLs). Disabled gracefully without `INVOICES_BUCKET`.

## Testing
- Vitest. Default env is **node**; React component tests opt in per-file with a `// @vitest-environment jsdom` pragma at the top.
- `server-only` is aliased to a no-op stub (`test/stubs/server-only.ts`) so lib modules import outside a Next bundle.
- DB tests use the **hermetic** harness in `test/helpers/db.ts` (`startTestDB`/`clearDB`/`stopTestDB`) — a dedicated in-memory Mongo, never the real cluster, no auto-seed. First run downloads the mongodb-memory-server binary (timeouts are set high).
