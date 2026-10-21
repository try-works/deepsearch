/**
 * The pure mechanics of DeepSeek account sign-in (R3).
 *
 * Mode selection is the single dev-versus-deploy switch: an `http://` callback
 * origin means the Worker itself receives the redirect; an `https://` origin
 * means the Platform's loopback-only rule forces hosted relay mode. Everything
 * here is testable without a network, a browser, or the Platform.
 */
import { Effect, Schema } from "effect";

export type Mode = "loopback" | "hosted";

export interface Attempt {
  readonly verifier: string;
  readonly state: string;
  readonly redirectUri: string;
  readonly deviceId: string;
  /** Set once the Platform issues one; empty before init. */
  readonly authorizeId: string;
}

const AttemptSchema = Schema.Struct({
  verifier: Schema.String,
  state: Schema.String,
  redirectUri: Schema.String,
  deviceId: Schema.String,
  authorizeId: Schema.String,
});

/** The single cookie that binds one attempt to one browser. */
export const CALLBACK_COOKIE = "dsp_ctx";

export function modeFor(callbackOrigin: string): Mode {
  return callbackOrigin.startsWith("https://") ? "hosted" : "loopback";
}

/**
 * The Platform accepts only `http://<loopback>:<port>` redirects, so a hosted
 * deployment must name a relay origin that nothing listens on.
 */
export function redirectUriFor(callbackOrigin: string, relayUri: string): string {
  if (modeFor(callbackOrigin) === "hosted") return relayUri;
  return `${callbackOrigin.replace(/\/+$/u, "")}/oauth/callback`;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** A fresh PKCE verifier, state, and device id for one attempt. */
export function newAttempt(redirectUri: string): Attempt {
  return {
    verifier: toBase64Url(crypto.getRandomValues(new Uint8Array(32))),
    state: toBase64Url(crypto.getRandomValues(new Uint8Array(32))),
    redirectUri,
    deviceId: crypto.randomUUID(),
    authorizeId: "",
  };
}

/** S256 challenge for a verifier. */
export function challengeFor(verifier: string): Effect.Effect<string> {
  return Effect.gen(function* () {
    const digest = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", encoder.encode(verifier)));
    return toBase64Url(new Uint8Array(digest));
  });
}

/** HMAC over the sealed body, as an Effect rather than an async function. */
function signWith(secret: string, body: string): Effect.Effect<string> {
  return Effect.gen(function* () {
    const key = yield* Effect.promise(() =>
      crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    );
    const signature = yield* Effect.promise(() => crypto.subtle.sign("HMAC", key, encoder.encode(body)));
    return toBase64Url(new Uint8Array(signature));
  });
}

/** Bind an attempt to the browser with an HMAC-signed cookie value. */
export function sealAttempt(secret: string, attempt: Attempt): Effect.Effect<string> {
  return Effect.gen(function* () {
    const body = toBase64Url(encoder.encode(JSON.stringify(attempt)));
    const signature = yield* signWith(secret, body);
    return `${body}.${signature}`;
  });
}

/** Read a sealed attempt, treating any tampering as absence. */
export function unsealAttempt(secret: string, sealed: string): Effect.Effect<Attempt | null> {
  return Effect.gen(function* () {
    const parts = sealed.split(".");
    if (parts.length !== 2) return null;
    const [body, signature] = parts;
    if (body === undefined || signature === undefined) return null;
    const expected = yield* signWith(secret, body);
    if (!timingSafeEqual(signature, expected)) return null;
    try {
      const parsed = Schema.decodeUnknownSync(AttemptSchema)(JSON.parse(decoder.decode(fromBase64Url(body))));
      // SAFETY: the payload was signed by this Worker; the schema decode above
      // still rejects a shape change, and the catch turns that into absence.
      return parsed as Attempt;
    } catch {
      return null;
    }
  });
}

/** Constant-time comparison for state and signatures. */
export function stateMatches(expected: string, received: string): boolean {
  return timingSafeEqual(expected, received);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/** Extract exactly one code and one state from the address the user pastes. */
export function parseRedirectAddress(address: string): { readonly code: string; readonly state: string } | null {
  let url: URL;
  try {
    url = new URL(address.trim());
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
