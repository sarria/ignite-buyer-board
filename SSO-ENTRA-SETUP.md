# Microsoft SSO (Entra ID) — reusable setup guide

How Stephen Alba wired Microsoft SSO into Ignite Buyer Board (PR #1, 2026-09-12),
written up so the same pattern can be dropped into another app. It replaced a
temporary shared-password gate; the architecture itself has nothing
board-specific in it.

## Why this shape

- **Stateless.** A serverless host (Vercel functions, or pods behind a load
  balancer) shares no session store. So instead of a server-side session, the
  server mints a signed JWT after the Entra exchange, and that token **is** the
  session. The browser holds it (localStorage) and sends `Authorization: Bearer`.
- **The client secret never reaches the browser.** The SPA only ever calls our
  own `/api/auth/*`; the server does the code exchange with Entra.
- **Role/deactivation are re-read from the DB on every request, not carried in
  the JWT.** The token proves identity only. This means promoting or
  deactivating someone takes effect on their very next request instead of
  waiting out the token's TTL.
- **Existing users are matched by email, case-insensitively**, not created
  fresh — useful any time users already exist in your DB from a prior import
  or manual seeding and you don't want SSO to spawn duplicates. Entra returns
  the UPN in whatever case it was typed, so an exact-case match would silently
  fragment one person into two records.
- **Unconfigured MSAL never silently opens the app in production.** Locally
  (no `MSAL_CLIENT_ID`/`SECRET` set) it falls back to a hardcoded dev user, so
  a fresh checkout runs with zero Entra setup. In production, the same
  unconfigured state returns `503`. This asymmetry is deliberate — the
  previous password-gate's "unset env var = open" behavior was the exact
  footgun this avoids.

## Files (server)

| File | Role |
|---|---|
| `server/lib/msal.js` | `@azure/msal-node` `ConfidentialClientApplication`, built lazily. Derives the redirect URI from the request host so one deploy works on localhost / preview / prod without hardcoding it (override with `MSAL_REDIRECT_URI` when the derivation can't be trusted, e.g. behind a proxy that rewrites `Host`). |
| `server/lib/appToken.js` | Signs/verifies the app's own JWT (`jsonwebtoken`). Carries `sub`/`email`/`name`/`microsoftId` only — no role. |
| `server/controllers/auth.js` | `login` (hands the SPA the Microsoft auth URL), `callback` (Entra redirects the **browser** here with `?code=`; every exit is a redirect, never JSON, since the browser is mid-navigation), `me`, `config`. Owns `upsertUser`. |
| `server/middleware/auth.js` | `requireAuth` — verifies the JWT, then re-reads the user from the DB fresh every request. `requireAdmin` reads the fresh role. |
| `server/routes/auth.js` | `/auth/config`, `/auth/login`, `/auth/callback` are public (mounted **before** the global `requireAuth`); `/auth/me` requires auth. |

## Files (client)

| File | Role |
|---|---|
| `context/AuthContext.jsx` | Identity comes from `GET /auth/me`, never from decoding the JWT client-side — the server's answer is the only one that can't be stale. |
| `components/common/AuthWall.jsx` | Gate wrapping the app's routes; shows a spinner while checking rather than redirecting, so an already-signed-in user doesn't flash the login screen on load. |
| `pages/LoginPage.jsx` | Public. "Sign in with Microsoft" button → `GET /auth/login` → navigate to the returned URL. |
| `pages/LoginCallback.jsx` | Public. Lands here as `/login/callback?token=<jwt>`, stores the token, calls `/auth/me` to confirm it, then routes into the app. |
| `api/client.js` | Axios instance: request interceptor attaches `Authorization: Bearer`; response interceptor clears the token and fires a window event on `401` so the app drops to the login screen without fighting the router mid-request. |

## The bug we hit (know this before you copy the pattern)

`upsertUser`'s Mongo upsert put `role` in **both** `$set` and `$setOnInsert`:

```js
const $set = { name, lastLoginAt: new Date() };
if (isAdmin) $set.role = 'admin';
...
users.findOneAndUpdate(
  { email },
  { $set, $setOnInsert: { email, role: isAdmin ? 'admin' : 'member', createdAt } },
  { upsert: true }
);
```

Setting the same field via two different update operators in one upsert is
illegal in MongoDB — `MongoServerError: Updating the path 'role' would create
a conflict at 'role'` (`code: 40, ConflictingUpdateOperators`). It only fires
for a **brand-new** user who is **also** in the admin list — i.e. exactly the
people testing the SSO rollout (admins), on their **first** sign-in. A
non-admin's first sign-in doesn't hit it (no `role` in `$set` at all), which
is why it slipped through initial testing.

Fix: never let `$set` and `$setOnInsert` touch the same field.

```js
$setOnInsert: { email, createdAt: new Date(), ...(!isAdmin && { role: 'member' }) }
```

Now `role` comes from `$set` when admin (applies to both the update and the
upsert-created doc), and from `$setOnInsert` only in the non-admin branch —
never both.

## Environment variables

```
MSAL_CLIENT_ID=              # Entra app registration
MSAL_CLIENT_SECRET=          # SERVER-ONLY, never sent to the browser
MSAL_TENANT_ID=
MSAL_REDIRECT_URI=           # optional override; required if something between
                              #   the browser and the server rewrites Host
                              #   (e.g. a local dev proxy) — pin it to the
                              #   browser-facing origin in that case
MSAL_SCOPES=                  # optional, comma-separated. Default: user.read
ALLOWED_EMAIL_DOMAINS=       # comma-separated; blank = any account in the tenant
ADMIN_EMAILS=                 # comma-separated; promoted to admin on every sign-in
PUBLIC_PROTO=                 # 'https' only when TLS terminates upstream of the app
                              #   (e.g. k8s ingress) and the app would otherwise
                              #   build an http:// redirect URI
JWT_SECRET=                   # signs the session token; rotating it signs everyone out
JWT_TTL_SECONDS=              # optional, default 5 days
```

## Entra (Azure Portal) setup checklist

1. App registration in the target tenant → note Application (client) ID and
   Directory (tenant) ID.
2. Certificates & secrets → new client secret → copy the **value** immediately
   (shown once). Treat it as compromised if it's ever pasted anywhere outside
   a secrets manager (chat, screenshots, etc.) and rotate it.
3. Authentication → add a **Web** platform redirect URI for every environment
   that will use it: `https://<prod-host>/api/auth/callback`,
   `http://localhost:<port>/api/auth/callback`, and any preview-deploy pattern.
4. API permissions: `User.Read` (delegated) is enough for basic profile/email —
   add more only if you need Graph beyond identity.

## Deploy checklist

- Set all the env vars above in the hosting platform.
- Leave `MSAL_REDIRECT_URI`, `PUBLIC_PROTO` unset unless your specific
  deployment needs them (see the variable table) — setting them
  unnecessarily is what silently breaks the flow (wrong redirect / token sent
  to the wrong host).
- Delete whatever temporary auth gate this replaces once SSO is confirmed
  live — nothing should still read it.
- **Do one full end-to-end sign-in against a real account before calling it
  done.** Token exchange, domain check, and the user upsert are the one part
  of this that can't be verified by "the login screen renders" or "the client
  secret authenticates" — both of those were true here while the upsert bug
  above was still live.
