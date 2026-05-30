@AGENTS.md

# MagickBook CRM — agent notes

Full-stack Next.js 16 CRM. Read `README.md` for the full picture. Key conventions:

## Stack & gotchas (Next 16 / React 19)
- App Router, **Turbopack**, TypeScript, Tailwind **v4** (CSS-first `@theme` in `src/app/globals.css` — no `tailwind.config`).
- Route handler `params` and `cookies()` are **async** (`await ctx.params`, `await cookies()`).
- Route protection lives in **`src/proxy.ts`** (Next 16 renamed `middleware` → `proxy`).
- Design tokens (colors, fonts, radii, shadows) are CSS vars in `globals.css`; fonts wired in `src/app/layout.tsx`.

## Data & auth
- DB: Mongoose. `connectDB()` uses `MONGODB_URI`, else spins an **in-memory MongoDB** and auto-seeds (`src/lib/seed.ts`).
- Models + serializers: `src/lib/models.ts`, serializers + `route()` wrapper in `src/lib/api.ts`.
- Auth: Firebase (client `src/lib/auth/firebase-client.ts`, admin `firebase-admin.ts`) + JWT cookie (`session.ts`). Server helpers in `src/lib/auth/server.ts`. Passwordless **demo mode** when Firebase env is absent.
- **RBAC**: always scope queries via `src/lib/rbac.ts` (`leadScope`/`accountScope`). Admin = whole workspace; standard = own records only.

## Frontend
- Pages are client components using `useApi`/`api` from `src/lib/client.ts`; the `(app)` server layout injects the session via `SessionContext`.
- Reusable UI in `src/components/ui/*`. Money is INR — use `formatINR` / `formatINRCompact` and the `tnum` class for figures.

## Verify
- `npm run build` typechecks everything. `npm run dev` then hit pages; demo-login: `riya@acme.in` (admin) / `neha@acme.in` (standard).
