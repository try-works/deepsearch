# DeepSearch — research & architecture brief

Status: research complete; **one blocker found that changes the auth design** (§4). Compiled
2026-10-19 from the Paper file `01M591M8BPD6PKW4YX6P07AP80`, the DeepSeek API docs, the
`deepseek-harness` sign-in implementation, the Alchemy docs, and **live probes** against
`api.deepseek.com` and `platform.deepseek.com`.

---

## 1. What the design specifies

Source of truth is the Paper file's **Specs** page (12 spec artboards), not the pixels. `DeepSearch
App` has 16 artboards; `Tablet` and `Mobile` mirror them; `Specs` carries the written contract.

Product: a search front-end over the **DeepSeek Search & Fetch API**, bring-your-own-credential.

| # | Screen | Spec content |
|---|--------|--------------|
| 01 | Home | Prompt 1–128 chars. `POST /v1/tools/search` with `query`, `count` (product default 25), `need_content=false`. No request until submit. |
| 02 | Results | `title, url, snippet, summary?, site_name, site_icon, date, authority, rerank_score, content?`. **No API offset** — pagination is client-side. |
| 02b/c | Loading + progress motion | Status writing entry, Live indicator (`--color-live`). |
| 03 | Sign in · Get started | OAuth card (whale) + escape hatch to API key. |
| 04 | Sign in · Waiting | Authorization in the **system browser**; app **polls**; "Copy sign-in link"; Cancel clears pending; timeout → Failed. |
| 05 | Sign in · API Key | Single secret field, `autocomplete=new-password`, show/hide while drafting, **write-only** after save (never echoed back). |
| 06 | Account | Session + "Manage key". |
| 07 | Operators | `site:`, `-site:`, `after:`, `before:`, `lang:`, `More`, help dialog. Operators are **query syntax only**. |
| 08 | Privacy | Where the credential lives. |
| 09 | How DeepSearch Works | Explainer. |

Forbidden by the specs: fake "About N results", Images/News tabs, **an AI overview built from Search
alone**, and any rendered key or token. Meta line is deliberately honest:
`SHOWING 1–25 · PAGE 1/2 · /V1/TOOLS/SEARCH · COUNT=25 · NEED_CONTENT=FALSE`.

Design system: Geist + Geist Mono; `--color-ink #0B1015`, `--color-blue #0562EF`, `--color-live
#00C763`, `--color-paper #F4F4F6`, `--color-rule #DFDFDF`; type 12/14/17/20/28/56; spacing 4…64;
radius 8/12/24/999.

### Design deltas implied by your decisions (§7)

- **No pagination, one page of 50.** Spec 02 and artboard 02 must lose the pagination footer, and the
  meta line becomes `SHOWING 1–50 · /V1/TOOLS/SEARCH · COUNT=50 · NEED_CONTENT=FALSE`.
- **An Ask/answer surface must be designed** — it does not exist in the Paper file yet, and spec 02
  currently forbids an AI overview. That prohibition needs a scoped exception (§7 D2).

---

## 2. Verified facts

Versions resolved from npm on 2026-10-19.

| Package | Latest | Note |
|---|---|---|
| `effect` | **4.0.5** | v4; HTTP/platform modules live in core (`effect/http`) |
| `alchemy` | **2.0.0-beta.83** | peer deps `effect ^4.0.0`, `@effect/platform-node ^4.0.0`, `vite ^8` |
| `@tanstack/react-start` | 1.169.3 | Start v1 |
| `@tanstack/ai` / `ai-react` / `ai-client` | 0.69.0 / 0.30.4 / 0.39.3 | 0.x |
| `wrangler` (local) | 4.123.0 | installed, **not authenticated** |

`@tanstack/stream` does not exist on npm — see §7 D2.

### 2.1 DeepSeek Search & Fetch API

`POST https://api.deepseek.com/v1/tools/search`:

```jsonc
{
  "query": "site:deepseek.com oauth",  // required, 1..128 chars, not all whitespace
  "count": 50,                          // 1..50, default 10
  "ori_question": "...",                // optional, <=128
  "localization": "1.2.3.4",            // optional IP
  "need_content": false
}
```

`{ results: [...] }`, each: `rerank_score` (0–3, **≥1.5 high quality**), `title`, `url`, `snippet`
(~100–200 chars, for display), `summary` (~600–800, for a model), `content` (empty unless
`need_content`), `site_name`, `site_icon`, `date` (RFC 3339 or null), `authority` (0–4, **≥3
authoritative**, −1 unknown). No offset parameter.

`POST /v1/tools/fetch` → `{ url }` (≤8192, http/https, no userinfo) → `{ title, content }` (Markdown).

**Two credentials are accepted on the Search endpoint — both verified by their distinct 401 bodies:**

| Credential | Header | Missing-auth message |
|---|---|---|
| Platform API key | `Authorization: Bearer sk-…` | `Authentication Fails (missing key)` |
| **DeepSeek account token** | `x-dsh-auth-token: dsh_…` | `Authentication Fails (invalid dsh token)` |

That second line is the important one: the account token from the sign-in flow **authenticates search
directly**, so a signed-in account needs no separately pasted API key.

### 2.2 CORS — two different answers on two hosts

**`api.deepseek.com` allows browser calls.** Preflight from `Origin: https://deepsearch.ing`:

```
OPTIONS /v1/tools/search → 200
  Access-Control-Allow-Origin: https://deepsearch.ing
  Access-Control-Allow-Methods: POST
  Access-Control-Allow-Headers: authorization, content-type
  Access-Control-Allow-Credentials: true
```

So a user's API key can be used from the tab without transiting our Worker. (Send `Authorization`,
never cookies — the server echoes the origin *and* allows credentials.)

**`platform.deepseek.com` allows none.** `OPTIONS /auth-api/v0/dsh/auth_init` → `403`, and a normal
response carries **no `Access-Control-*` headers at all**. The browser therefore cannot read the
sign-in endpoints. This is the crux of §4.

### 2.3 DeepSeek account sign-in — the real protocol

Implemented in `packages/credentials/deepseek-account-platform/src/index.ts` (+ `protocol.ts`), and
reflected by the UI in `packages/client/ui-settings-account`. All on `platformOrigin`
(default `https://platform.deepseek.com`), envelope `{ code, data: { biz_code, biz_data } }`:

| Step | Endpoint | Payload |
|---|---|---|
| init | `POST /auth-api/v0/dsh/auth_init` | `{ code_challenge, code_challenge_method:'S256', state, redirect_uri, locale, login_source }` → `{ authorize_url, authorize_id, expires_in }` |
| user | browser → `/dsh/authorize?authorize_id=…` | user approves; Platform redirects to `redirect_uri?code=…&state=…` |
| exchange | `POST /auth-api/v0/dsh/auth_exchange` | `{ code, code_verifier, redirect_uri, device_id, device_model, os_version }` → `{ token, authorized_url, user? }` |
| done | browser → `/dsh/authorized?result=…`, plus `login_source` | terminal page |
| cancel | `POST /auth-api/v0/dsh/auth_cancel` | `{ authorize_id, code_verifier }` |
| account | `GET /auth-api/v0/users/current` | header `x-dsh-auth-token` |
| balance | `GET /api/v0/users/get_user_summary` | header `x-dsh-auth-token` |
| logout | `POST /auth-api/v0/users/logout` | header `x-dsh-auth-token` |

PKCE S256, 32-byte verifier and state, `attemptTimeoutMs` covering the whole attempt, `expires_in`
600 s, and a single-use exchange. Five client headers are provider-owned:
`x-client-bundle-id` (empty), `x-client-platform` (`web` / `desktop-mac` / `desktop-win`),
`x-client-version`, `x-client-locale` (`zh_CN`/`en_US`), `x-client-timezone-offset` (seconds east).

Spec 04 is a faithful picture of this: the "Waiting" state polls because the app waits for a
**loopback** callback while the user authorizes in the system browser.

### 2.4 Alchemy v2 — IaC as Effect programs

```ts
// alchemy.run.ts
export default Alchemy.Stack("DeepSearch", {
  providers: Cloudflare.providers(),
  state: Cloudflare.state(),
}, Effect.gen(function* () {
  const site = yield* Cloudflare.Website.Vite("Web", { /* … */ })
  return { url: site.url }
}))
```

`alchemy deploy`; auth via `alchemy profile edit --add Cloudflare` (profile store
`~/.alchemy/profiles.json`, separate from Wrangler).

**TanStack Start is a verified target** ([docs](https://alchemy.run/cloudflare/frontend/tanstack-start/)):
`Cloudflare.Website.Vite` runs one `vite build` producing client assets *and* the SSR server bundle —
no adapter, no Wrangler config. Two hard requirements: **remove `@cloudflare/vite-plugin`** (the
TanStack CLI adds it; Alchemy is explicitly incompatible), and keep `vite.config.ts` to
`tanstackStart()` + `viteReact()`. An `examples/cloudflare-website-tanstack-start` example is checked
in and live-tested.

Domains are resources ([Domains & DNS](https://alchemy.run/cloudflare/networking/domains/)):
`Cloudflare.Zone.Zone` adopts the existing `deepsearch.ing` zone (opt-in adoption, so a deploy cannot
clobber DNS it does not own); Worker custom domains are declared beside it.

Without Alchemy, the canonical Start→Workers path is `@cloudflare/vite-plugin` +
`main: "@tanstack/react-start/server-entry"` + `nodejs_compat`. **Pick Alchemy's; do not mix.**

### 2.5 Effect 4 idioms to hold the codebase to

`Effect.gen` inline; `Effect.fn("name")` for reusable traced functions (`fnUntraced` in hot paths);
never wrap-and-return an `Effect.gen`; `Schema` for every untrusted input (no hand predicates — use
`Predicate`); `Schema.TaggedError`; `Context.Service` + static `layer`; `ManagedRuntime` as the seam
into non-Effect frameworks. That last one is the Start integration: server routes stay thin, build one
runtime from the app `Layer`, `runPromise` per request.

### 2.6 TanStack AI / shadcn

- shadcn TanStack Start install: `pnpm dlx shadcn@latest init -t start` (or `--preset` via
  shadcn/create) — [docs](https://ui.shadcn.com/docs/installation/tanstack).
- `@shadcn/helpers/tanstack-ai` replays **deterministic AG-UI streams through `useChat`** with no
  model, route, or key — the right tool for the Loading/motion states in 02b/02c and for tests.
- TanStack AI states the BYOK posture directly: *"Users can paste their own provider API keys in the
  browser"*, *"The key stays in the tab."*

---

## 3. Architecture

```
Browser  (TanStack Start SSR shell, hydrated at deepsearch.ing)
  ├─ credential vault — the ONLY module that touches storage (write-only UX, spec 05)
  ├─ fetch → https://api.deepseek.com/v1/tools/search     ← API key OR account token, direct
  ├─ fetch → https://api.deepseek.com/v1/chat/completions ← Ask surface, streamed, direct
  └─ fetch → https://deepsearch.ing/api/*                  ← NO credentials, ever
                                   │
Cloudflare Worker (Alchemy-managed)
  ├─ SSR + static assets (Cloudflare.Website.Vite)
  ├─ Effect services behind TanStack server routes (ManagedRuntime seam)
  └─ credential-free only: config/flags, health, OG cards, operator help,
     optional anonymous share links (D1/R2)
```

The Worker is deliberately **off the search path**. That is the cheapest bill and the strongest
privacy claim, and it is what makes rule 6 hold — provided the credential path in §4 is resolved.

### Package layout

```
deepsearch/
  alchemy.run.ts              # Stack: Website.Vite, Zone + custom domain, optional D1/R2
  apps/web/src/routes/        # _index, search, ask, account, privacy, how
  apps/web/src/lib/deepseek.ts     # search(), fetch(), chat() — Schema-decoded
  apps/web/src/lib/credentials.ts  # the only storage access; write-only API
  apps/web/src/lib/auth/           # AuthProvider seam: apiKey | accountToken | oauthPkce
  src/worker.ts               # Effect Layer + fetch handler
```

### Implementation rules

1. **One module owns credentials.** Never a React prop that renders, never a log, never an error body.
2. **Write-only, enforced**: after save the UI knows only `configured: boolean`.
3. **`Schema`-decode responses** — `authority` can be −1, `date` null, `site_icon`/`site_name` null.
4. **No pagination.** One request, `count: 50`, 50 cards, no Prev/Next.
5. **CSP with no `unsafe-inline`**; `connect-src` includes `https://api.deepseek.com`. Any XSS is key
   exfiltration — the highest-severity risk in the product.
6. **Render `snippet`/`summary` as text**, never as markup; they are third-party page content.

---

## 4. The blocker: sign-in cannot terminate on a hosted origin

Six probes against the real Platform (2026-10-19), all against `auth_init`:

| `redirect_uri` | `login_source` | Result |
|---|---|---|
| `https://deepsearch.ing/oauth/callback` | `web` | **50005 `PAYLOAD_SCHEMA_MISMATCH`** |
| `http://localhost:3000/oauth/callback` | `web` | `code 0` → `authorize_url` + `authorize_id`, `expires_in 600` |
| `http://127.0.0.1:8443/oauth/callback` | `web` | `code 0` |
| `http://127.0.0.1:5173/cb` (any path/query) | `web` | `code 0` |
| `https://127.0.0.1:8443/oauth/callback` | `web` | **50005** |
| `deepsearch://oauth/callback` | `desktop` | **50005** |

Plus: `OPTIONS /auth-api/v0/dsh/auth_init` from our origin → **403**, and no `Access-Control-*`
headers on normal responses.

Read together with §2.3, the flow is **strictly loopback HTTP**:

- `redirect_uri` must be `http://localhost|127.0.0.1|::1:<port>/…`. A hosted `https://deepsearch.ing`
  callback is schema-rejected, so the Platform will never redirect a user back to our site.
- `auth_init`/`auth_exchange` are not CORS-readable, so the browser cannot run them either.

Consequences for `deepsearch.ing` (hosted):

| Path | Possible? | Rule 6 |
|---|---|---|
| Browser performs init + exchange | ❌ no CORS | — |
| Worker performs init + exchange | ❌ still blocked: the *browser* must land on a loopback `redirect_uri` | — |
| User lands on `127.0.0.1` callback | only if something listens locally | #6 holds (localhost, not our server) |
| API-key search | ✅ verified CORS | #6 holds |

So **the account sign-in flow cannot be delivered on the hosted domain by any deployment choice.**
`login_source: 'web'` does not mean "public website" — DSH's web UI is itself served on loopback, and
the schema says loopback is the only place a callback may land. This is a platform capability gap, not
a design or infrastructure problem.

The design is not wrong, it is **local-app-shaped**. Spec 04 is an accurate picture of the harness's
desktop/local-web sign-in, and it cannot be reproduced at a public origin.

### Resolution options

1. **Hosted = API key only.** Ship spec 05, hide spec 04. Fully satisfies every constraint today; the
   Privacy page can then make an unusually strong claim ("your key never leaves this browser").
2. **Local companion for sign-in.** A tiny helper that binds `127.0.0.1:<port>`, runs init/exchange
   locally, and hands the resulting account token to the tab. Rule 6 still holds — the token goes
   through localhost, never our Worker — and spec 04 becomes reachable for users who run it. Highest
   effort, best fidelity.
3. **Ask DeepSeek to allow the hosted origin.** Allowing `https://deepsearch.ing/oauth/callback` and
   adding CORS to `auth-api/v0/dsh/*` makes the whole flow client-side and #6 holds exactly. Then
   spec 04 works as drawn. A platform change, not ours.
4. **Worker-mediated exchange.** Cannot work as described (the browser still has nowhere to land).
   Even if it could, the token would transit our server, violating #6.

**Recommendation: 1 now, 3 in parallel (file the request), 2 only if the signed-in account is a
must-have.** Because the account token also authenticates Search (§2.1), option 2 or 3 would let a
user search with no key at all — that is the real prize, and it is worth the platform ask.

### 4.1 Options 2 and 3, assessed in detail

**The Worker option (4) is not one option — it is two.** The naive version (Worker relays a hosted
callback) is impossible: `auth_init` rejects `https://deepsearch.ing/oauth/callback` with 50005, and
the browser must be *redirected*, not posted to. The only implementable variant is an **address-bar
relay**:

- Worker calls `auth_init` with `redirect_uri=http://127.0.0.1:8788/oauth/callback` (accepted).
- User approves; the browser lands on that loopback URL, **connects to nothing**, and shows
  "can't reach this page" — but the address bar still contains `?code=…&state=…`.
- User copies that whole URL back into our tab; the Worker validates `state`, exchanges the code
  (it holds the PKCE verifier), and returns the token.

| | Option 2 — local companion | Option 4 — Worker relay (address-bar variant) |
|---|---|---|
| Implementable today | ✅ | ✅ only via manual URL copy-paste |
| Rule 6 (never to our server) | ✅ token goes tab ↔ localhost only | ❌ token is minted inside the Worker and returned in a response body |
| Spec 04 fidelity | ✅ the Waiting/polling state is literally what the companion does | ⚠️ needs a new "paste the URL that failed" field; the waiting state becomes a paste prompt |
| UX hazard | "install and run this" — trusted-software problem | teaches users to copy credential-bearing URLs — a phishing habit, and the copyable URL is live for 600 s |
| Mobile (design has Mobile artboards) | ❌ impossible: no localhost listener on iOS/Android | ✅ works (any browser can copy a URL) |
| Distribution cost | installer, code signing, notarization, auto-update, three OSes | ~one Worker route + one input |
| Security surface | a local TCP listener (any local process can hit it; needs `state`, PKCE, short TTL, one-shot) | a token-minting endpoint on our origin; a compromised Worker = mass token theft |
| Ops/maintenance | second codebase, second release train | none beyond the route |
| Offline/mobile/desktop parity | account sign-in becomes desktop-only | parity preserved, at the cost of #6 |

Option 2's handoff can be made phishing-resistant: have the companion print a short one-time code
that the user types into the tab, instead of passing the token through a URL, clipboard, or fragment.
That is also the only handoff that survives strict enterprise clipboard policies.

**The decisive asymmetry is mobile.** The design ships Mobile and Tablet artboards; option 2 makes
account sign-in structurally unavailable there, so the product would have two credential stories
(desktop: sign in; mobile: paste a key) and two sets of copy on the Privacy page.

**The decisive asymmetry for the Worker option is trust.** Its only workable form asks users to copy a
URL containing an OAuth code out of a browser error page. That is a habit no security team should
teach, and it moves the token onto our infrastructure — the exact thing constraint 6 exists to
prevent.

**Therefore:** option 2 is the only way to deliver spec 04 as drawn *and* keep constraint 6, and it is
worth it only if (a) the account flow is a hard product requirement, and (b) desktop-only sign-in is
acceptable. Otherwise option 1 now + option 3 (the platform request) is strictly better. Effort,
coarsely: option 2 ≈ 1–2 focused weeks (companion + handoff + signing/notarization + docs + the
install-wall copy), plus a permanent maintenance tail; the Worker relay ≈ 1–2 days, and the cost is
paid by users and by the privacy claim rather than by the schedule.

### 4.2 What "getting OAuth working" actually takes — decided

The `redirect_uri` rule, mapped exhaustively against the live Platform:

| `redirect_uri` | result |
|---|---|
| `http://127.0.0.1:5173/cb` | `code 0` |
| `http://localhost:8787/oauth/callback` | `code 0` |
| `http://[::1]:3000/oauth/callback` | `code 0` |
| `http://127.0.0.1/oauth/callback` — no port | `50005` |
| `http://localhost/oauth/callback` — no port | `50005` |
| `https://127.0.0.1:8443/oauth/callback` | `50005` |
| `http://deepsearch.ing/oauth/callback` | `50005` |
| `http://192.168.1.10/oauth/callback` | `50005` |
| `deepsearch://oauth/callback` | `50005` |

So the grammar is exactly **`http` + loopback host + explicit port**. Nothing else, in any
`login_source`.

The harness's own code confirms why it works there: its web UI passes
`window.location.origin` (`packages/client/ui-settings-account/src/client/index.ts:229-231`) and the
provider immediately constrains it with `loginOrigin(callbackOrigin)`
(`packages/credentials/deepseek-account-platform/src/index.ts:404`), which throws `account: protocol`
for any non-loopback origin — pinned by its tests. **The harness has no hosted-OAuth path we lack; it
has a loopback one, and its web UI happens to be loopback.** (`apps/desktop/scripts/sign-primary-runtime.ts`
is unrelated: it is Windows Authenticode signing for the desktop build.)

**Decision.** Because a loopback HTTP port is exactly what a local dev server is, the flow runs today
with no platform change:

- `spike/oauth/` implements the whole thing Worker-mediated: `auth_init` → browser → `/oauth/callback`
  → `auth_exchange` → token handed to the tab once, never persisted server-side. Verified: `start`
  returns a live `authorize_url` with a 600 s TTL; wrong `state` → 400, missing cookie → 410, missing
  code → 400.
- Production is one config value — `CALLBACK_ORIGIN=https://deepsearch.ing` — which fails with `50005`
  until DeepSeek acts.

**Hosted mode exists, and it is deployed on Cloudflare in one config value.** `CALLBACK_ORIGIN`
selects behaviour: `http://` → the Worker receives the redirect directly (local dev); `https://` →
the Worker names `RELAY_REDIRECT_URI` (`http://127.0.0.1:18765/oauth/callback`, nothing listening) and
the user pastes that dead tab's address into `POST /api/auth/complete`, which extracts exactly one
`code`/`state`, checks it against the sealed cookie, and exchanges. Verified with
`CALLBACK_ORIGIN=https://deepsearch.ing`: a live `authorize_url` came back for the relay origin with
`mode: "hosted"`, malformed paste → `400`, stale attempt → `410`.

There is **no status/poll endpoint** to avoid the paste: `auth_status`, `auth_poll`, `auth_wait`,
`auth_state`, `auth_result`, `auth_query`, `auth_check`, `auth_get`, `auth_lookup`, `auth_complete`
all return `404 {"detail":"Not Found"}`, while `auth_init`/`auth_exchange`/`auth_cancel` exist. The
paste is a platform-shape consequence, not an engineering shortcut.

**The single ask to DeepSeek:** register `https://deepsearch.ing/oauth/callback` as a redirect target
for a web client. CORS on `/auth-api/v0/dsh/*` is *not* required for this architecture (the Worker
calls the Platform, the browser never does), so this is a much smaller request than it first appeared.
With it, the exchange is a standard BFF exchange and spec 03/04 work as drawn.

**Rule 6 tradeoff, stated plainly.** API keys keep the strict rule: browser-direct, never to the
server. Account OAuth cannot: the token is minted by `auth_exchange`, the Worker holds the PKCE
verifier, and no CORS exists for a browser-side exchange. So for OAuth the Worker sees the token for
the duration of one request, never stores it, never logs it, and hands it to the tab. That is a
deliberate, documented exception — not an oversight.

---

## 5. Risks (ranked)

1. **XSS = credential theft.** CSP, no `dangerouslySetInnerHTML`, dependency hygiene. Highest severity.
2. **`alchemy` v2 is beta** — pin `2.0.0-beta.83` exactly, commit the lockfile, expect churn.
3. **`vite ^8` peer** — do not let a scaffold pull Vite 7 and produce two copies.
4. **`@cloudflare/vite-plugin` must be absent** — silent conflict with Alchemy.
5. **No `offset`** — never build controls that imply server paging (moot once pagination is gone).
6. **`need_content=true` inflates payloads** — keep false; Fetch per-URL only on user action.
7. **`Access-Control-Allow-Credentials: true`** — never send cookies to the API; ban wrapper libraries
   that set `withCredentials`.
8. **Account tokens have no expiry/refresh** (`README` states this): a stale token 401s to signed-out.

---

## 6. Environment blockers

- `wrangler 4.123.0` installed but **not authenticated** — `wrangler whoami` → *"Not logged in. Your
  auth token has expired … non-interactive."* Run `wrangler login` interactively, or export
  `CLOUDFLARE_API_TOKEN`.
- Alchemy uses **its own** profile store, separate from Wrangler — `alchemy profile edit --add
  Cloudflare`.
- `<workspace>` holds only the recursive-mode scaffold (`.recursive/`, `.agent/`, `.codex/`,
  `.github/`, `CLAUDE.md`, `.cursorrules`) plus `docs/`. No application code, no git commits yet, no
  prior memory (`.recursive/STATE.md` is empty).

---

## 7. Decisions

**D1 — sign-in.** Blocked on §4. **Option 2 (local companion) is rejected: this product is web-only and
will not ship a desktop client.** Therefore: API key now (spec 05 only, fully rule-6 compliant), plus
the platform request for a hosted `redirect_uri` and CORS on `auth-api` so spec 04 can exist at all.
Until that lands, spec 04 stays designed-but-unreachable, and spec 03's OAuth card must be re-cast as
"Sign in with DeepSeek" pointing at a flow that does not yet exist — so hide it in v1 rather than ship
a dead button.

**D2 — Ask/answer surface: ADD IT** (your call). It is not in the design and must be designed first.
Shape: the query runs Search (`count: 50`) and the answer is generated from the top results'
`summary`/`content`, streamed with TanStack AI, **browser → `api.deepseek.com/v1/chat/completions`
directly**, same credential, `stream: true`. This needs a scoped exception to spec 02's "no AI
overview from Search alone" — the honest rule becomes: *an answer may only be shown when it is
grounded in the retrieved results and every claim is attributable to a result card.* The design needs a
new artboard (an answer block above the SERP, Streamdown/TanStack-AI-streamed) and a source-citation
treatment; `@shadcn/helpers/tanstack-ai` covers the deterministic test path.

**D3 — one page of 50, no pagination** (your call). `count: 50`, single request, pagination footer
removed, meta line updated (§1 deltas).

---

## 8. Build order

1. Clear env (§6); `alchemy profile edit --add Cloudflare`; `wrangler login`.
2. Scaffold Start + shadcn (`init -t start`); remove `@cloudflare/vite-plugin`; add
   `alchemy@2.0.0-beta.83` + `effect@4`.
3. `alchemy.run.ts`: `Cloudflare.Website.Vite` + `Cloudflare.Zone.Zone("deepsearch.ing")` + Worker
   custom domain. **Deploy a hello-world to `https://deepsearch.ing` before any feature work.**
4. Credential module (`{ kind: 'apiKey' | 'accountToken' }`, right header per kind) → spec 05 →
   Home (01) → Results (02, count 50, no pagination) → Operators (07) → Privacy/How/Account.
5. Design + build the Ask surface (D2); wire TanStack AI streaming; `@shadcn/helpers/tanstack-ai` for
   the deterministic streams.
6. Tablet + Mobile; then conformance pass against the 12 spec artboards.

## Test level 3: why it needs the deployment pipeline

Attempted twice to run the Worker locally so the auth endpoints could be tested in
the Workers runtime without Cloudflare:

1. **miniflare against `dist/server/server.js`** — fails immediately: the SSR bundle
   imports `react` rather than bundling it, so workerd cannot resolve the module.
2. **miniflare against an esbuild bundle** — the bundle builds and the Worker boots
   (it served a response), but `createRouter` selects `createBrowserHistory` and
   throws `Cannot read properties of undefined (reading 'history')`. Browser
   conditions make `react-dom` safe but hand `@tanstack/history` its browser entry;
   neutral conditions keep history correct but pull `react-dom/server.node`'s
   `util`, `crypto`, `async_hooks` and `stream` requirements.

Neither is the artefact that ships. Alchemy builds the Worker through
`@cloudflare/vite-plugin`, which is exactly the piece withheld locally because it
conflicts with the plugin Alchemy appends. Level 3 therefore belongs to the deploy
pipeline, not to a hand-assembled harness; the same is true of level 4 against a
deployed preview.

## Deployment (verified)

`alchemy deploy --yes` builds both Vite environments and deploys the Worker. Auth
does **not** need the interactive `alchemy profile refresh`: Alchemy reads
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from the environment, and the
Cloudflare CLI already holds a valid OAuth session (`cf auth whoami`) whose token
can be supplied for a deploy. The profile route stays available but is not
required.

Live at `https://deepsearch.ing` (Worker `deepsearch-web-live-<account>`,
`<subdomain>.workers.dev`). Points worth knowing:

- A Worker **route** needs a proxied DNS record to exist. The zone had none, so an
  `AAAA` at the apex (`100::`, proxied) and a `CNAME` for `www` were created as
  placeholders; the Worker intercepts them. Without those records the hostname
  resolves to nothing and the route never matches.
- The route **pattern** must end in `/*`. A bare hostname (`deepsearch.ing`)
  matches only the root path: `/` returned 200 while `/privacy`, `/how`,
  `/account`, `/search` and every `/api/*` path returned **522**, because those
  requests fell through to the `100::` placeholder and tried to reach an origin
  that does not exist. Patterns are `deepsearch.ing/*` and `www.deepsearch.ing/*`;
  the 522 is the signature of this mistake, not a DNS fault.
- Runtime configuration reaches the Worker through `env` in the stack. `STATE_KEY`
  currently travels that way, which makes it readable in the dashboard — moving it
  to a secret binding is the follow-up.
- `POST /api/auth/start` returns `200` with a real `authorizeUrl` on the deployed
  Worker, so the hosted flow works in production; `GET /oauth/callback` without
  params answers `400` and `POST /api/auth/complete` with junk answers `410` with
  the cookie cleared.
