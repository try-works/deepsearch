# DeepSearch

A web client for the DeepSeek Search API. Ranked web results with source metadata, grounded answers with citations, and a credential model where **your API key never leaves your browser**.

Live at [deepsearch.ing](https://deepsearch.ing).

> **Not affiliated with DeepSeek.** DeepSearch is an independent, unofficial client for the DeepSeek API. It is not affiliated with, endorsed by, or sponsored by DeepSeek, and the DeepSeek name and marks belong to their owner. They appear here only to identify which API this client talks to.

## The privacy model, up front

- **Credentials live in `localStorage`** and are read only by the browser. Ask, Search and the API calls all go straight from your tab to `api.deepseek.com`.
- **Search requests never touch our origin.** There is no proxy holding a key on your behalf.
- **Queries and answers are not stored on a server.** The Ask thread lives in React state and disappears with the tab.
- **One documented exception:** OAuth sign-in. DeepSeek only accepts loopback redirect URIs, so the sign-in flow transits the Worker once. It is described on `/privacy`, and the permanent fix is DeepSeek allowing a hosted redirect URI.

Anything that contradicts that model is a bug — please report it as a security issue.

## Stack

| Concern | Choice |
| --- | --- |
| Runtime | Cloudflare Workers |
| Framework | TanStack Start + React 19 |
| Infrastructure | [Alchemy](https://alchemy.run) (TypeScript IaC) |
| Effects / services | Effect TS |
| Build | Vite 8 |
| Tests | Vitest + Effect Vitest, Playwright |

## Getting started

Requires **Node 24** and **pnpm 11**.

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Open the app, choose **Sign in**, and provide either a Platform API key or a `dsh_` token from OAuth. Nothing else is needed for local development — there is no backend to run.

## Scripts

```bash
pnpm dev         # dev server
pnpm build       # production build
pnpm typecheck   # tsc --noEmit
pnpm test        # unit tests (Vitest)
pnpm exec playwright test   # end-to-end tests (needs a prior build)
```

The e2e suite runs against a local preview and uses the installed Edge/Chrome channel. Set `PLAYWRIGHT_BASE_URL` to point it elsewhere.

## Deployment

Deployment is declarative. [`alchemy.run.ts`](alchemy.run.ts) defines the Worker, its routes and its bindings.

```bash
export CLOUDFLARE_API_TOKEN=...      # Workers Scripts:Edit, Zone:Edit, DNS:Edit
export CLOUDFLARE_ACCOUNT_ID=...
pnpm exec alchemy deploy
```

Values you will need to set for your own deployment:

- `routes[].pattern` — your domain instead of `deepsearch.ing`
- `zoneName` — your Cloudflare zone
- `STATE_KEY` — an encryption key for persisted state

`STATE_KEY` is a **secret binding**. Alchemy stores `Redacted` values as `secret_text`, which Cloudflare encrypts and never returns from the API; a plain string becomes `plain_text` and is readable in the dashboard. The deploy fails if `STATE_KEY` is missing outside a local stage, because generating one would silently invalidate existing sessions. See [`src/lib/state-key.ts`](src/lib/state-key.ts).

## Repository layout

```
src/routes/        file-based routes: Home, Results, Ask, Account, Privacy, How
src/components/    dialogs, result card, loading state, mark
src/lib/           pure logic: credentials, operators, pagination, ask, search-view
src/server/        runtime wiring for the original hosted OAuth path
src/styles/        tokens + component styles (one stylesheet, tokenised)
e2e/               Playwright specs
tests/             Vitest unit tests and API fixtures
spike/oauth/       the OAuth loopback spike that informed the hosted flow
docs/              research notes recorded while building this
```

## Functionality

Two surfaces, both talking straight to `api.deepseek.com` from your browser.

### Search

A query becomes a single `POST /v1/tools/search` with `count=50` and `need_content=false` — one request, one result batch. Each result card shows the source site, the title, the full URL, the publication date when the source provides one, DeepSeek's rerank score, and an authority tier (0–4, `-1` when unknown). Nothing is inferred to fill a gap: a missing date reads "date unknown" rather than a guess.

**Operators** are typed into the query itself, matching the API's syntax — `site:`, `-site:`, `after:`, `before:`, `lang:`, `"phrase"`, `-word`, and `-"exact phrase"`. They are query text, not separate parameters, which is why the chips insert them into the field instead of posting a second body shape. Queries are capped at 128 characters, the API's limit.

**Pagination** is client-side over the single batch: 25 results per page, with the meta line reporting `SHOWING 1–25 · PAGE 1/2 · /V1/TOOLS/SEARCH · COUNT=50 · NEED_CONTENT=FALSE`. The API has no offset parameter, so this is a presentation of one response rather than a paging protocol.

**Every state is explicit:** a loading state with five skeleton cards and an indeterminate progress track (the API reports no progress, so no percentage is invented), an empty state, and an error state that names the failure — a missing credential, a rejected key, a rate limit, or an unreachable network — instead of a generic apology.

### Ask

Ask runs the same search first, then streams an answer from `POST /v1/chat/completions` with `stream=true` and `temperature=0.2`. The retrieved results are formatted into a numbered source block and sent as the system message, and the model is instructed to cite every claim as `[n]` against that block.

**Grounding is enforced, not requested.** After the stream ends, the citations are parsed and checked against the retrieved set. An answer that cites nothing, or cites a number outside the block, is displayed but labelled *Not grounded* with a warning — it is never presented as a supported answer.

**Follow-ups keep the thread.** The chat API is stateless, so the browser assembles the whole conversation on every turn: the fixed source block, the prior turns as `user`/`assistant` pairs, then the new question. Because the source block is identical across turns, `[n]` means the same page in every answer. A follow-up never re-searches — that is what keeps earlier citations valid — and only the last 8 turns travel, with the thread saying so when older ones drop. Ungrounded answers stay visible but are excluded from the context sent to the model, so one unsourced reply cannot seed the rest of the conversation.

**Sources are links.** Every cited result appears as a chip with its marker, site name and an external-link glyph, opening in a new tab with `rel="noreferrer noopener"`. The `[n]` marker inside the prose stays inert, so a citation never navigates away mid-sentence.

The thread lives in React state and disappears with the tab. Nothing is stored server-side.

## Known limitations

- DeepSeek's API requires a loopback redirect for OAuth, so hosted sign-in needs the paste-the-address step described on `/privacy`.
- The Search API reports no progress, so the loading state is honest about being indeterminate rather than showing an invented percentage.
- Follow-up questions keep the last 8 turns plus the fixed source block; older turns are dropped and the thread says so.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
