/**
 * DeepSearch sign-in spike — DeepSeek account OAuth, Worker-mediated.
 *
 * The Platform's `auth_init` accepts only `http://<loopback-host>:<port>` as
 * `redirect_uri`, so the flow cannot terminate on a public origin yet. This
 * spike makes it run end-to-end on a loopback port (wrangler dev) and keeps the
 * public-origin case to a single configuration value.
 *
 * Wire protocol reversed from deepseek-harness
 * packages/credentials/deepseek-account-platform.
 *
 * The token is minted by the Platform and handed to the browser once. It is
 * never persisted server-side and never logged.
 */

interface Env {
  PLATFORM_ORIGIN: string;
  CALLBACK_ORIGIN: string;
  CLIENT_VERSION: string;
  /** Loopback target used in hosted mode; nothing listens there by design. */
  RELAY_REDIRECT_URI: string;
  /** HMAC key for the short-lived PKCE cookie. Set in .dev.vars for real use. */
  STATE_KEY: string;
}

interface InitBizData {
  authorize_url: string;
  authorize_id: string;
  expires_in: number;
}

interface ExchangeBizData {
  token: string;
  authorized_url: string;
}

interface PlatformEnvelope<T> {
  code: number;
  msg?: string;
  data?: { biz_code: number; biz_msg?: string; biz_data?: T };
}

interface Attempt {
  verifier: string;
  state: string;
  redirectUri: string;
  deviceId: string;
}

const COOKIE = "dsp_ctx";
const COOKIE_MAX_AGE = 600;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    try {
      switch (route) {
        case "GET /":
          return html(page());
        case "POST /api/auth/start":
          return await start(env);
        case "GET /oauth/callback":
          return await callback(request, url, env);
        case "POST /api/auth/complete":
          return await complete(request, env);
        case "GET /api/health":
          return jsonBody(JSON.stringify({ ok: true, callbackOrigin: env.CALLBACK_ORIGIN }), 200);
        default:
          return jsonBody(JSON.stringify({ error: "not_found" }), 404);
      }
    } catch (cause) {
      // The detail is a runtime/provider class plus message, never protocol
      // data: an authorization URL or token is never in a thrown message.
      const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : "UnknownError";
      return jsonBody(JSON.stringify({ error: "auth_failed", detail }), 502);
    }
  },
};

/** A deployed Worker cannot receive the redirect; a local dev server can. */
function isHosted(env: Env): boolean {
  return env.CALLBACK_ORIGIN.startsWith("https://");
}

/** Ask the Platform for an authorization URL and bind PKCE state to the browser. */
async function start(env: Env): Promise<Response> {
  // The Platform redirects only to `http://<loopback>:<port>`. A local dev
  // server IS that origin. A deployed Worker is not, so hosted mode names a
  // loopback port that refuses instantly and the user pastes the URL back.
  const redirectUri = isHosted(env) ? env.RELAY_REDIRECT_URI : `${env.CALLBACK_ORIGIN}/oauth/callback`;
  const attempt: Attempt = {
    verifier: base64url(crypto.getRandomValues(new Uint8Array(32))),
    state: base64url(crypto.getRandomValues(new Uint8Array(32))),
    redirectUri,
    deviceId: crypto.randomUUID(),
  };

  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(attempt.verifier))),
  );

  const envelope = await platform<InitBizData>(env, "auth_init", {
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: attempt.state,
    redirect_uri: attempt.redirectUri,
    locale: "en_US",
    login_source: "web",
  });

  const data = unwrap(envelope);
  const cookie = await seal(env.STATE_KEY, wireAttempt(attempt));

  return jsonBody(
    JSON.stringify({
      authorizeUrl: data.authorize_url,
      expiresIn: data.expires_in,
      mode: isHosted(env) ? "hosted" : "loopback",
      relayOrigin: isHosted(env) ? new URL(attempt.redirectUri).origin : null,
    }),
    200,
    { "set-cookie": `${COOKIE}=${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure(env)}` },
  );
}

type ExchangeResult =
  | { readonly kind: "ok"; readonly token: string; readonly authorizedUrl: string }
  | { readonly kind: "error"; readonly status: number; readonly detail: string };

/** Redeem one code against the sealed attempt. The code is single-use. */
async function exchange(env: Env, request: Request, attempt: Attempt, code: string, state: string): Promise<ExchangeResult> {
  if (!timingSafeEqual(attempt.state, state)) {
    return { kind: "error", status: 400, detail: "The sign-in response did not match this attempt." };
  }
  const envelope = await platform<ExchangeBizData>(env, "auth_exchange", {
    code,
    code_verifier: attempt.verifier,
    redirect_uri: attempt.redirectUri,
    device_id: attempt.deviceId,
    device_model: "web",
    os_version: request.headers.get("sec-ch-ua-platform") ?? "web",
  });
  const data = unwrap(envelope);
  return { kind: "ok", token: data.token, authorizedUrl: data.authorized_url };
}

/** Read the sealed attempt from the request's cookie, if it survived. */
async function openAttempt(request: Request, env: Env): Promise<Attempt | null> {
  const sealed = readCookie(request.headers.get("cookie") ?? "", COOKIE);
  if (sealed === null) return null;
  const opened = await unseal(env.STATE_KEY, sealed);
  if (opened === null) return null;
  return parseAttempt(opened);
}

/**
 * Receive the authorization code, exchange it once, and hand the resulting
 * token to the opener window. The code is single-use, so a replay loses.
 */
async function callback(request: Request, url: URL, env: Env): Promise<Response> {
  // Exactly one code and one state, as browser-auth.ts does for its launch
  // token: a repeated parameter is ambiguity, and ambiguity is a rejection.
  const codes = url.searchParams.getAll("code");
  const states = url.searchParams.getAll("state");
  const code = codes[0];
  const state = states[0];
  if (codes.length !== 1 || states.length !== 1 || code === undefined || state === undefined) {
    return html(notice("Sign-in incomplete", "The provider did not return exactly one authorization code."), 400);
  }

  const attempt = await openAttempt(request, env);
  if (attempt === null) return html(notice("Sign-in expired", "Start sign-in again from the app."), 410);

  const result = await exchange(env, request, attempt, code, state);
  if (result.kind === "error") return html(notice("Sign-in rejected", result.detail), result.status);

  const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));

  return html(handoff(nonce, result.token, result.authorizedUrl), 200, {
    "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Max-Age=0`,
    "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'`,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
}

interface PastedCode {
  readonly code: string;
  readonly state: string;
}

/** Extract exactly one code and state from the pasted redirect URL. */
function parsePasted(value: string): PastedCode | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const codes = url.searchParams.getAll("code");
  const states = url.searchParams.getAll("state");
  const code = codes[0];
  const state = states[0];
  if (codes.length !== 1 || states.length !== 1 || code === undefined || state === undefined) return null;
  return { code, state };
}

/**
 * Hosted mode: the browser could not reach a loopback redirect, so the user
 * pastes that tab's address here. The body is the raw URL as text/plain, so
 * nothing is decoded speculatively.
 */
async function complete(request: Request, env: Env): Promise<Response> {
  const pasted = parsePasted((await request.text()).trim());
  if (pasted === null) {
    return jsonBody(JSON.stringify({ error: "invalid_paste", message: "Paste the full address from the sign-in tab." }), 400);
  }
  const attempt = await openAttempt(request, env);
  if (attempt === null) return jsonBody(JSON.stringify({ error: "expired", message: "Start sign-in again." }), 410);

  const result = await exchange(env, request, attempt, pasted.code, pasted.state);
  if (result.kind === "error") {
    return jsonBody(JSON.stringify({ error: "exchange_failed", message: result.detail }), result.status);
  }

  return jsonBody(
    JSON.stringify({ token: result.token, authorizedUrl: result.authorizedUrl }),
    200,
    { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Max-Age=0` },
  );
}

/** POST one dsh method and require both envelope levels to succeed. */
async function platform<T>(env: Env, method: string, body: Record<string, string>): Promise<PlatformEnvelope<T>> {
  const response = await fetch(`${env.PLATFORM_ORIGIN}/auth-api/v0/dsh/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-client-bundle-id": "",
      "x-client-platform": "web",
      "x-client-version": env.CLIENT_VERSION,
      "x-client-locale": "en_US",
      "x-client-timezone-offset": "0",
    },
    body: JSON.stringify(body),
    // Workers has no `redirect: "error"`; a manual redirect is a protocol fault.
    redirect: "manual",
  });

  if (response.status >= 300 && response.status < 400) throw new Error(`platform_${method}_redirect`);
  if (!response.ok) throw new Error(`platform_${method}_status_${response.status}`);
  // SAFETY: the dsh envelope is fixed by the provider; a body that does not
  // carry code/data is rejected by readBizData before any field is read.
  return (await response.json()) as PlatformEnvelope<T>;
}

function unwrap<T>(envelope: PlatformEnvelope<T>): T {
  if (envelope.code !== 0) throw new Error(`platform_code_${envelope.code}`);
  const data = envelope.data;
  if (data === undefined) throw new Error("platform_missing_data");
  if (data.biz_code !== 0) throw new Error(`platform_biz_code_${data.biz_code}`);
  const biz = data.biz_data;
  if (biz === undefined) throw new Error("platform_missing_biz_data");
  return biz;
}

function wireAttempt(attempt: Attempt): string {
  return [attempt.verifier, attempt.state, attempt.redirectUri, attempt.deviceId].join("\n");
}

function parseAttempt(value: string): Attempt | null {
  const parts = value.split("\n");
  if (parts.length !== 4) return null;
  const [verifier, state, redirectUri, deviceId] = parts;
  if (verifier === undefined || state === undefined || redirectUri === undefined || deviceId === undefined) return null;
  if (verifier.length === 0 || state.length === 0 || redirectUri.length === 0 || deviceId.length === 0) return null;
  return { verifier, state, redirectUri, deviceId };
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

async function seal(secret: string, payload: string): Promise<string> {
  const body = base64url(encoder.encode(payload));
  return `${body}.${base64url(await sign(secret, body))}`;
}

async function unseal(secret: string, sealed: string): Promise<string | null> {
  const [body, signature] = sealed.split(".");
  if (body === undefined || signature === undefined) return null;
  if (!timingSafeEqual(base64url(await sign(secret, body)), signature)) return null;
  try {
    return decoder.decode(fromBase64url(body));
  } catch {
    return null;
  }
}

async function sign(secret: string, body: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function secure(env: Env): string {
  return env.CALLBACK_ORIGIN.startsWith("https://") ? "; Secure" : "";
}

function jsonBody(payload: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(payload, {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function notice(title: string, detail: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font:16px/1.5 system-ui;margin:48px auto;max-width:38ch;color:#0B1015">
<h1 style="font-size:20px;font-weight:600">${title}</h1><p style="color:#0B1015AD">${detail}</p></body>`;
}

/** Success page: post the token to the opener, then close. */
function handoff(nonce: string, token: string, authorizedUrl: string): string {
  return `<!doctype html><meta charset="utf-8"><title>Signed in</title>
<body style="font:16px/1.5 system-ui;margin:48px auto;max-width:38ch;color:#0B1015">
<h1 style="font-size:20px;font-weight:600">Signed in</h1>
<p style="color:#0B1015AD">You can close this window.</p>
<script nonce="${nonce}">
  window.opener?.postMessage({ type: "deepsearch:account", token: ${JSON.stringify(token)}, authorizedUrl: ${JSON.stringify(authorizedUrl)} }, window.location.origin);
  window.close();
</script></body>`;
}

/** Spike UI: proves the flow without shipping product chrome. */
function page(): string {
  return `<!doctype html><meta charset="utf-8"><title>DeepSearch sign-in spike</title>
<style>
  body { font: 16px/1.5 system-ui; margin: 48px auto; max-width: 46ch; padding: 0 24px; color: #0B1015; }
  h1 { font-size: 24px; letter-spacing: -0.02em; }
  button { font: inherit; font-weight: 500; background: #0562EF; color: #fff; border: 0; padding: 14px 20px; cursor: pointer; }
  button[disabled] { opacity: .5; cursor: default; }
  code { font-family: ui-monospace, monospace; font-size: 13px; }
  .status { color: #0B1015AD; }
  .token { background: #F4F4F6; padding: 12px; word-break: break-all; font-family: ui-monospace, monospace; font-size: 13px; }
</style>
<h1>DeepSearch sign-in spike</h1>
<p class="status">Worker-mediated DeepSeek account OAuth. The token is handed to this tab once and never stored on the server.</p>
<p><button id="go">Sign in with DeepSeek</button></p>
<div id="paste" hidden>
  <p class="status" id="pasteHint"></p>
  <textarea id="address" rows="3" placeholder="http://127.0.0.1:18765/oauth/callback?code=…&amp;state=…"
    style="width:100%;font-family:ui-monospace,monospace;font-size:13px;padding:10px;border:1px solid #DFDFDF"></textarea>
  <p><button id="finish">Finish sign-in</button></p>
</div>
<p class="status" id="status">Not started.</p>
<div class="token" id="token" hidden></div>
<script>
  const go = document.getElementById("go");
  const status = document.getElementById("status");
  const tokenBox = document.getElementById("token");
  const paste = document.getElementById("paste");
  const pasteHint = document.getElementById("pasteHint");
  const address = document.getElementById("address");
  const finish = document.getElementById("finish");

  function show(token) {
    localStorage.setItem("deepsearch.spike.account", JSON.stringify({ token, at: Date.now() }));
    status.textContent = "Signed in. Token stored in localStorage.";
    tokenBox.hidden = false;
    tokenBox.textContent = token.slice(0, 12) + "… (" + token.length + " chars)";
    paste.hidden = true;
    go.disabled = false;
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (data?.type !== "deepsearch:account" || typeof data.token !== "string") return;
    show(data.token);
  });

  go.addEventListener("click", async () => {
    go.disabled = true;
    status.textContent = "Opening DeepSeek…";
    try {
      const response = await fetch("/api/auth/start", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? body.error ?? "start_failed");
      window.open(body.authorizeUrl, "deepseek-signin", "width=520,height=680");
      if (body.mode === "hosted") {
        pasteHint.textContent = "DeepSeek signs you in, then tries to send you back to " + body.relayOrigin +
          ", which cannot work from this site. Copy the full address of that tab (it contains code=) and paste it here.";
        paste.hidden = false;
        address.focus();
        status.textContent = "Waiting for the pasted address.";
        return;
      }
      status.textContent = "Complete sign-in in the DeepSeek window…";
    } catch (error) {
      status.textContent = "Start failed: " + (error instanceof Error ? error.message : "unknown");
      go.disabled = false;
    }
  });

  finish.addEventListener("click", async () => {
    finish.disabled = true;
    status.textContent = "Redeeming…";
    try {
      const response = await fetch("/api/auth/complete", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: address.value.trim(),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? body.error ?? "complete_failed");
      show(body.token);
    } catch (error) {
      status.textContent = "Could not finish: " + (error instanceof Error ? error.message : "unknown");
      finish.disabled = false;
    }
  });
</script>`;
}
