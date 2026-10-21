/**
 * Resolution of the cookie-signing key used at deploy time.
 *
 * Two properties matter and both are tested here:
 * - the value is returned as `Redacted` so Alchemy binds it as `secret_text`
 *   rather than storing it in clear text;
 * - a missing key outside a local stage is an error, not a freshly generated
 *   random one, because regenerating silently invalidates every session.
 */
import { createHash } from "node:crypto";
import { Redacted } from "effect";

/** The shortest key this app accepts; the cookie signer requires real entropy. */
export const MIN_STATE_KEY_LENGTH = 32;

export class MissingStateKeyError extends Error {
  override readonly name = "MissingStateKeyError";
}

export function resolveStateKey(stage: string, fromEnv: string | undefined): Redacted.Redacted<string> {
  if (fromEnv !== undefined && fromEnv.length >= MIN_STATE_KEY_LENGTH) return Redacted.make(fromEnv);
  if (stage === "local") {
    // Deterministic locally so successive local deploys keep their sessions.
    return Redacted.make(createHash("sha256").update("deepsearch:local").digest("hex"));
  }
  throw new MissingStateKeyError(
    `STATE_KEY is not set. Provide a value of at least ${String(MIN_STATE_KEY_LENGTH)} characters ` +
      "(it is bound as a secret), otherwise sessions cannot be decrypted after the next deploy.",
  );
}
