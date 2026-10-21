/**
 * The cookie-signing key must reach the Worker as a secret, and must never be
 * invented silently at deploy time — both are easy to regress.
 */
import { describe, expect, it } from "@effect/vitest";
import { Redacted } from "effect";
import { MIN_STATE_KEY_LENGTH, MissingStateKeyError, resolveStateKey } from "../../src/lib/state-key";

const LONG_KEY = "a".repeat(MIN_STATE_KEY_LENGTH);

describe("resolveStateKey", () => {
  it("returns the configured value wrapped so it is bound as a secret", () => {
    const key = resolveStateKey("live", LONG_KEY);
    expect(Redacted.value(key)).toBe(LONG_KEY);
    // Redacted hides the value from any string coercion or log line.
    expect(String(key)).not.toContain(LONG_KEY);
  });

  it("rejects a key that is too short rather than using it", () => {
    expect(() => resolveStateKey("live", "too-short")).toThrow(MissingStateKeyError);
  });

  it("fails outside a local stage instead of generating a random key", () => {
    expect(() => resolveStateKey("live", undefined)).toThrow(MissingStateKeyError);
  });

  it("derives a stable key for a local stage", () => {
    const first = Redacted.value(resolveStateKey("local", undefined));
    const second = Redacted.value(resolveStateKey("local", undefined));
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(MIN_STATE_KEY_LENGTH);
  });

  it("prefers the configured value even locally", () => {
    expect(Redacted.value(resolveStateKey("local", LONG_KEY))).toBe(LONG_KEY);
  });
});
