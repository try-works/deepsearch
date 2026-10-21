# Security

## Reporting a vulnerability

Report privately via GitHub's **Security → Report a vulnerability** on this
repository, or by email to the maintainers listed in the repository profile.
Please do not open a public issue for anything that concerns credentials.

You can expect an acknowledgement within a few days. There is no bug bounty.

## What counts as a vulnerability here

DeepSearch keeps credentials in the browser, so the threat model is narrow and
specific. These are security bugs:

- Any code path that sends an API key, `dsh_` token, or OAuth refresh token to our
  origin, a third party, or a logging service.
- Any storage of credentials somewhere other than the browser's `localStorage`
  (cookies that reach the server, server logs, analytics, error reporting).
- Any endpoint on the Worker that echoes, stores, or forwards a credential.
- XSS that would let an attacker read `localStorage`.
- Query or answer content being persisted server-side.

These are also worth reporting, though they are product bugs rather than security
ones:

- A search or answer request that bypasses the documented direct-to-DeepSeek path.
- An answer rendered as trusted HTML.

## The documented exception

OAuth sign-in transits the Worker once, because DeepSeek's registration only
accepts loopback redirect URIs and will not accept a hosted callback. That request
forwards the authorization code to DeepSeek's token endpoint and never persists it.
This is disclosed on `/privacy`. If you find that it persists, logs, or exposes that
code, that is a vulnerability.

## Handling secrets in contributions

- Never commit a real key, token, or account identifier. `.env`, `.dev.vars`,
  `.wrangler/` and `.alchemy/` are git-ignored; keep them that way.
- Test fixtures must use obviously fake values (`sk-test`, `dsh_test`).
- If you believe a secret was committed, rotate it first and report it — removing
  it from the tip of a branch does not remove it from history.
