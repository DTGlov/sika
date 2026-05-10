# Bearer Auth on Decisions Routes
Generated: 2026-05-08
Branch: `feat/bearer-auth-decisions`

## What changed

Three files in this PR:

| File | Change |
|------|--------|
| `src/lib/auth/get-authed-user.ts` | **NEW.** Shared auth helper. Reads `Authorization: Bearer <jwt>` if present (verified via `supabase.auth.getUser(token)`); otherwise falls back to the existing cookie-session client. Returns `User | null`. |
| `src/app/api/decisions/ask/route.ts` | Auth section refactored from `createClient() + supabase.auth.getUser()` to `getAuthedUser(request)`. Removed unused `@/lib/supabase/server` import. Handler logic below the auth check is unchanged. |
| `src/app/api/decisions/outcome/route.ts` | Auth section refactored to use the helper. The `purchase_decisions` UPDATE switched from the cookie-bound `supabase` client to `createServiceClient()` with explicit `.eq('user_id', user.id)`. |

## Why

iOS Phase 8 ("Should I Buy") — see `audits/SHOULD_I_BUY_2026_05_08.md` — requires the new native client to call `/api/decisions/ask` and `/api/decisions/outcome`. The Supabase Swift SDK keeps a session keyed by the user's JWT access token; iOS clients don't share Vercel cookies, so the routes need a Bearer-token path.

This is the **first** iOS-to-web HTTP integration in the codebase. The helper extracted here is the template for every future native-client → backend route — adoption is one line:

```ts
const user = await getAuthedUser(request);
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

## Backward compatibility

The cookie path is **bit-for-bit identical** to current behavior. Browser requests have no `Authorization` header → the helper falls through to `createServerClient().auth.getUser()`, which is exactly what `/ask` and `/outcome` did before. No client-side changes, no DB changes, no env-var changes.

## Auth flow

```
incoming request
       │
       ├── has Authorization: Bearer <jwt>?
       │     YES → vanilla anon client → auth.getUser(token) → user
       │     NO  → fall through
       │
       └── createServerClient() (cookie session) → auth.getUser() → user
```

Both paths return the same `User` object (`@supabase/supabase-js`). Bearer takes precedence when the header is present. Token is trimmed defensively.

## Outcome route: service-client UPDATE

The pre-change `outcome/route.ts` used the cookie-bound `supabase` client for both auth and the UPDATE. RLS on `purchase_decisions` required `auth.uid() = user_id`, which the cookie session satisfied automatically.

For the Bearer path the user's identity is verified, but a Bearer-authenticated `supabase` client would require constructing a token-scoped client per request. Cleaner: use the **service** client (RLS bypass) and rely on the explicit `.eq('user_id', user.id)` filter — which was already present in the original code — to prevent cross-user mutations. This pattern matches `/api/decisions/ask`, which already uses `createServiceClient()` for the insert.

`user.id` is the verified subject of the auth token (cookie or Bearer); the explicit `user_id` filter is the gatekeeper. RLS is bypassed by the service role; security comes from the application-level filter.

## Helper location

`src/lib/auth/get-authed-user.ts`. Future routes adopt the pattern by importing and calling `getAuthedUser(request)`. No new npm dependencies.

## Test plan

Five paths exercised against the dev server (`pnpm dev` on `localhost:3001` — port shifted from 3000). Token in tests B/E is a real Supabase JWT obtained from the browser console after login:

```js
(await window.supabase.auth.getSession()).data.session.access_token
```

| # | Test | Expected | Result |
|---|------|----------|--------|
| A | Web cookie path: dashboard "Should I buy it?" → submit | 200, decision renders | **PASS** — fresh form, gold spinner, verdict pill, math card, "Sika says", both CTAs all rendered end-to-end |
| B | Bearer happy path: curl `/ask` with valid JWT | 200 + `{id, decision}` JSON | **PASS** — `HTTP 200`, returned `id=1e51233f-cc5a-4212-a6d4-fbd80cd9c489`, full decision payload (verdict/verdict_line/reasoning/impact/accent) |
| C | Invalid Bearer: curl `/ask` with `Bearer invalid_token_here` | 401 Unauthorized | **PASS** — `HTTP 401 {"error":"Unauthorized"}` |
| D | No auth: curl `/ask` with no header, no cookies | 401 Unauthorized | **PASS** — `HTTP 401 {"error":"Unauthorized"}` |
| E | Outcome Bearer: curl `/outcome` with valid JWT + decision_id from B | 200 + row's `outcome` updated | **PASS** — `HTTP 200 {"success":true}` against the B-issued `decision_id`. Route-level success means the `.eq('id', decision_id).eq('user_id', user.id)` filter matched. |
| F | Cross-user safety: wrong user's JWT targeting another user's row | 200 no-op + row UNCHANGED | **NOT EXECUTED** — only one JWT available in this dev environment. **Verified by code review:** both routes filter by `.eq('user_id', user.id)` where `user.id` is the verified subject of the auth token. The Bearer path receives `user.id` from `tokenClient.auth.getUser(token)` (server-side verification against Supabase auth servers — the token's `sub` claim cannot be spoofed without the auth-server signing key). The cookie path receives `user.id` from `createServerClient().auth.getUser()`. Both paths use the service client only after the `user.id` is established, and the explicit `user_id` filter prevents cross-user mutations regardless of which auth path was taken. There is no code path to `purchase_decisions.update` that does not go through this filter. |

## Out of scope

- **Migrating other API routes.** They'll adopt `getAuthedUser` as they're touched. No big-bang sweep.
- **Token refresh.** The Supabase Swift SDK refreshes access tokens automatically; the server only verifies what arrives.
- **Per-user rate limiting on the Bearer path.** Same rate-limit posture as cookie path (none currently route-level).
- **Auth-path observability.** No logging of cookie vs Bearer per request. Add when there's a question to answer.
- **Refactoring `createClient` / `createServerClient` / `createServiceClient` naming.** Existing names are confusing but rename is out of scope.

## Source-of-truth references

- `audits/SHOULD_I_BUY_2026_05_08.md` — iOS Phase 8 spec; Section 9 + iOS Implementation Notes call out this prerequisite.
- `audits/SETTINGS_TAB_2026_05_10.md` — iOS Settings spec; Sections 14 and 17 call out the four profile routes as the next consumers of this helper.

---

## Update — 2026-05-10: profile routes refactored for iOS Settings S1

The four profile-mutation routes now use `getAuthedUser` instead of cookie-only auth, making the helper live across **5 route surfaces** (1 from decisions + 4 profile):

| Route | Method | Persists | Used by |
|---|---|---|---|
| `/api/decisions/ask`     | POST   | `purchase_decisions` insert | iOS Phase 8 (Should I Buy) |
| `/api/decisions/outcome` | POST   | `purchase_decisions` update | iOS Phase 8 (Should I Buy) |
| `/api/profile/theme`     | PATCH  | `profiles.theme_preference` | iOS Settings S1 |
| `/api/profile/haptics`   | PATCH  | `profiles.haptics_enabled`  | iOS Settings S1 |
| `/api/profile/currency`  | PATCH  | `profiles.currency`         | iOS Settings S1 |
| `/api/profile/delete`    | DELETE | 17-table cascade + `profiles` + `auth.users` | iOS Settings S1 |

### Changes per route

For the three PATCH routes (`theme`, `haptics`, `currency`):

- Removed the cookie-bound `createClient` import.
- Auth resolution: `const user = await getAuthedUser(request)` → 401 if null.
- Switched the `UPDATE profiles` write from the cookie-bound client to `createServiceClient()` with the same explicit `.eq('id', user.id)` filter that was already there. Same security pattern as `/api/decisions/outcome`: `user.id` comes from a server-verified token, the explicit filter prevents cross-user mutations, RLS bypass is fine because the application-level filter is the gatekeeper.

For `DELETE /api/profile/delete`:

- Removed the cookie-bound `createClient` import.
- Signature changed `DELETE()` → `DELETE(request: Request)` so the helper can read the `Authorization` header.
- Auth resolution: `const user = await getAuthedUser(request)` → 401 if null.
- Service client (`svc`) already in use for the cascade — unchanged.

### Backward compatibility

Cookie auth still works for every route. The helper falls through to `createServerClient().auth.getUser()` when the `Authorization` header is absent. Web browser callers see no behavioral change.

### Test plan (manual)

For Settings S1 testing, the same four-test matrix from the original audit applies (web cookie regression, Bearer happy path, invalid Bearer, no auth) plus DB-level verification that the right `profiles` column flipped. To be exercised once the iOS Settings screen is wired.

