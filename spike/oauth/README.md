# DeepSearch sign-in spike

Worker-mediated DeepSeek account OAuth, runnable today on a loopback port.

## Why loopback

`POST https://platform.deepseek.com/auth-api/v0/dsh/auth_init` accepts only a
`redirect_uri` of the form `http://<127.0.0.1|localhost|[::1]>:<port>/…`.
Measured 2026-10-19:

| `redirect_uri` | result |
|---|---|
| `http://127.0.0.1:5173/cb` | `code 0` |
| `http://localhost:8787/oauth/callback` | `code 0` |
| `http://[::1]:3000/oauth/callback` | `code 0` |
| `http://127.0.0.1/oauth/callback` (no port) | `50005` |
| `https://127.0.0.1:8443/oauth/callback` | `50005` |
| `https://deepsearch.ing/oauth/callback` | `50005` |
| `http://deepsearch.ing/oauth/callback` | `50005` |
| `deepsearch://oauth/callback` | `50005` |

So the flow runs anywhere a loopback HTTP port is listening — including
`wrangler dev` — and nowhere else until DeepSeek allowlists a hosted origin.

`platform.deepseek.com` also sends no CORS headers (`OPTIONS /auth-api/v0/dsh/auth_init`
→ `403`), so the browser can never drive `auth_init`/`auth_exchange` itself. The
Worker must, which is why this is a BFF (backend-for-frontend) exchange rather
than a public-client flow.

## Run

```pwsh
cd spike/oauth
npx wrangler dev --port 8787
```

Open <http://localhost:8787>, click **Sign in with DeepSeek**, complete the login
in the popup. The popup posts the token back and closes; the token lands in
`localStorage["deepsearch.spike.account"]` and is shown truncated.

Set a real HMAC key before showing this to anyone:

```pwsh
# spike/oauth/.dev.vars
STATE_KEY="<32+ random bytes, base64>"
```

## Two modes

`CALLBACK_ORIGIN` selects the mode, so nothing else changes between dev and prod.

| mode | when | `redirect_uri` sent to `auth_init` | how the code returns |
|---|---|---|---|
| `loopback` | `CALLBACK_ORIGIN` is `http://…` | `http://localhost:8787/oauth/callback` — a real listener | Worker receives it directly |
| `hosted` | `CALLBACK_ORIGIN` is `https://…` | `RELAY_REDIRECT_URI` = `http://127.0.0.1:18765/oauth/callback` — nothing listens | user pastes that tab's address into `POST /api/auth/complete` |

Verified 2026-10-19 with `CALLBACK_ORIGIN=https://deepsearch.ing`: `auth_init` returned a live
`authorize_url` for the loopback relay origin, `mode: "hosted"`, and the paste endpoint rejects a
malformed address (`400 invalid_paste`) and a stale attempt (`410 expired`).

The paste cannot be removed by a deployment option. It disappears only when DeepSeek registers
`https://deepsearch.ing/oauth/callback`, after which `RELAY_REDIRECT_URI` is simply pointed at it and
`hosted` mode becomes a plain redirect.

## Deploy to Cloudflare

```pwsh
cd spike/oauth
wrangler login                       # device/browser login; not available non-interactively
wrangler secret put STATE_KEY        # 32+ random bytes, base64; do NOT reuse .dev.vars
# then set CALLBACK_ORIGIN to https://deepsearch.ing in wrangler.jsonc vars
wrangler deploy
```

`workers.dev` gives the Worker an origin immediately; `deepsearch.ing` needs a custom-domain route in
the same config once the zone is wired, and that hostname is also the value to request from DeepSeek.

Two runtime facts found the hard way: Workers rejects `redirect: "error"` on `fetch` (use
`"manual"` and check the status yourself), and local `workerd` caps `compatibility_date` at
`2026-08-18` — a newer date fails to boot with "newest date supported by this server binary".

## Flow

1. `POST /api/auth/start` — generate PKCE verifier + state, seal them in an
   HMAC-signed `HttpOnly` cookie, call `auth_init`, return `authorize_url`.
2. User authorizes at `platform.deepseek.com/dsh/authorize?authorize_id=…`.
3. `GET /oauth/callback?code&state` — verify state against the cookie, call
   `auth_exchange` once, then post `{ token, authorizedUrl }` to the opener.
4. The tab stores the token locally. No server-side persistence at any point.

## What production needs

One config value: `CALLBACK_ORIGIN=https://deepsearch.ing`. It fails today with
`50005` until DeepSeek registers that origin as a redirect target.

## Known gaps (intentional, spike scope)

- `device_id` is regenerated per attempt. Production should persist a stable
  random UUID client-side, as the harness does, so the Platform sees one device.
- No token refresh: account tokens have no expiry/refresh flow, so a 401 means
  sign in again.
- The token transits the Worker for the duration of the exchange. That is the
  rule-6 tradeoff and is documented in `docs/00-research-and-architecture.md`.
