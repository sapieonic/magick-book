# MagickBook — TODO / revisit later

## Admin approval for new domain-joiners
When a new user from a whitelisted domain signs in, they currently **auto-join the
shared workspace as a Standard user and can immediately see that role's data**
(their own records; admins see everything).

Revisit: add an **approval gate** so a new domain-joiner lands in a `pending` state
and can't see anything until an admin approves them (or auto-approve but with no
data access until a role is confirmed).

Touch points when we pick this up:
- `src/lib/models.ts` — add a `pending` value to member `status` (currently `active | invited`).
- `src/lib/auth/server.ts` → `upsertUserFromIdentity` — set new domain-joiners to `pending` instead of `active`.
- Gate the app: block `pending` users in `src/app/(app)/layout.tsx` (show a "waiting for approval" screen).
- `src/app/(app)/settings/team/page.tsx` + `src/app/api/members/[id]` — let admins approve/assign role.

_Logged 2026-05-30._
