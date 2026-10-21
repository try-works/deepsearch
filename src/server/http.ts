/**
 * Server-side configuration and HTTP helpers for the auth routes.
 *
 * Secrets come from the Worker environment. On Cloudflare those arrive through
 * `process.env` with `nodejs_compat`, which Alchemy enables by default; a
 * missing `STATE_KEY` is a startup-visible failure rather than a silent default.
 */
import type { SignInConfig } from "./sign-in";
import { oauthFetchTransport, type OAuthTransport } from "./oauth-client";

export const CALLBACK_COOKIE = "dsp_ctx";
export const COOKIE_MAX_AGE_SECONDS = 600;

export function signInConfig(): SignInConfig {
  const env = process.env;
  const secret = env.STATE_KEY;
  if (secret === undefined || secret.length === 0) throw new Error("STATE_KEY is not configured");
  return {
    platformOrigin: env.PLATFORM_ORIGIN ?? "https://platform.deepseek.com",
    callbackOrigin: env.CALLBACK_ORIGIN ?? "http://localhost:8787",
    relayRedirectUri: env.RELAY_REDIRECT_URI ?? "http://127.0.0.1:18765/oauth/callback",
    clientVersion: env.CLIENT_VERSION ?? "0.1.0",
    locale: "en_US",
    timezoneOffset: "0",
    secret,
  };
}

export function transport(): OAuthTransport {
  return oauthFetchTransport(fetch);
}

export function json(payload: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(payload, {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function cookieHeader(name: string, value: string, secure: boolean): string {
  const base = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(COOKIE_MAX_AGE_SECONDS)}`;
  return secure ? `${base}; Secure` : base;
}

export function clearCookieHeader(name: string): string {
  return `${name}=; Path=/; HttpOnly; Max-Age=0`;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (header === null) return null;
  for (const segment of header.split(";")) {
    const at = segment.indexOf("=");
    if (at === -1) continue;
    if (segment.slice(0, at).trim() !== name) continue;
    return segment.slice(at + 1).trim();
  }
  return null;
}

export function isSecure(config: SignInConfig): boolean {
  return config.callbackOrigin.startsWith("https://");
}

export function htmlDocument(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}