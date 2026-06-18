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
- App Router, **Turbopack**, TypeScript, Tailwind **v4** (CSS-first `@theme` in `src/app/globals.css` — no `tailwind.config`). Design tokens (colors, fonts, radii, shadows) are CSS vars there; fonts wired in `src/app/layout.tsx`.
- Route handler `params` and `cookies()` are **async** (`await ctx.params`, `await cookies()`).
- Route protection lives in **`src/proxy.ts`** (Next 16 renamed `middleware` → `proxy`). It guards pages on the edge; **API handlers guard themselves** via `requireUser()` (matcher excludes `/api`).

## Data & auth
- DB: Mongoose. `connectDB()` (`src/lib/db.ts`) uses `MONGODB_URI`, else spins an **in-memory MongoDB** and auto-seeds (`src/lib/seed.ts`). Connection is cached on `globalThis`.
- Models + interfaces (`I*`): `src/lib/models.ts`. DTOs sent to the client: `src/lib/types.ts`.
- Auth: Firebase (client `src/lib/auth/firebase-client.ts`, admin `firebase-admin.ts`) + signed JWT cookie (`jose`, HS256, `session.ts`). Passwordless **demo mode** when Firebase env is absent. Sign-in domain allow-list in `auth/whitelist.ts` (`DOMAIN_WHITELIST`).
- Server auth helpers (`src/lib/auth/server.ts`): `requireUser()` (throws `UnauthorizedError`), `getCurrentUser()`, `getSessionUser()`, `upsertUserFromIdentity()` (find-or-create; first user of an email domain becomes admin/owner, later ones auto-join as standard).
- **RBAC**: always scope queries via `src/lib/rbac.ts`. `leadScope`/`accountScope` return Mongoose filter fragments pinned to `workspaceId`; admins see the whole workspace, standard users get `ownerId === self`. Account sub-resources inherit the parent's visibility. Use `canEditOwned()` before mutating.
- **Soft-delete**: all domain docs carry `deletedAt`/`deletedBy` (`SoftDelete` mixin in `models.ts`). `leadScope`/`accountScope` exclude soft-deleted by default; pass `{ archived: true }` for the trash view (`?archived=1` on list endpoints). Sub-resource queries (contacts/invoices/expenses/documents) filter `deletedAt: null` directly. DELETE handlers **stamp `deletedAt`, never `deleteOne`**; restore via `PATCH … { action: "restore" }` (loads from the archived scope). Archiving an account just stamps the account — children stay put and reappear on restore.
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
- Cross-cutting domain logic lives in `src/lib/services.ts`: `logActivity()` (timeline entries), `accountFinance()` (billed/paid/outstanding/margin rollup), `nextInvoiceNumber()`.
- **Slack notifications** (`src/lib/slack.ts`): fire-and-forget Incoming-Webhook posts on lead lifecycle events — convert (`leads/[id]/convert`), lost / lane-move (`leads/[id]/stage`), comment (`leads/[id]/activities`). Gated on `SLACK_WEBHOOK_URL` (no-ops when unset, like `INVOICES_BUCKET`); optional `SLACK_CHANNEL` / `SLACK_BOT_NAME` / `SLACK_BOT_ICON`. Notifiers never throw — call them after the audit/activity writes, don't let them block the mutation.

## Frontend
- Pages are client components using `useApi`/`api` from `src/lib/client.ts` (`useApi` = fetch-on-mount + loading/error/refresh + optimistic set). The `(app)` server layout injects the session via `SessionContext`.
- Reusable UI in `src/components/ui/*`. Money is INR — use `formatINR` / `formatINRCompact` and the `tnum` class for figures. Drag-and-drop via `@dnd-kit`.
- Invoice files: records in Mongo, PDFs in **S3** (`src/lib/s3.ts`, presigned URLs). Disabled gracefully without `INVOICES_BUCKET`.

## Testing
- Vitest. Default env is **node**; React component tests opt in per-file with a `// @vitest-environment jsdom` pragma at the top.
- `server-only` is aliased to a no-op stub (`test/stubs/server-only.ts`) so lib modules import outside a Next bundle.
- DB tests use the **hermetic** harness in `test/helpers/db.ts` (`startTestDB`/`clearDB`/`stopTestDB`) — a dedicated in-memory Mongo, never the real cluster, no auto-seed. First run downloads the mongodb-memory-server binary (timeouts are set high).
