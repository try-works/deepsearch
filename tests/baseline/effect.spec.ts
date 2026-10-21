/**
 * Test baseline: proves the Effect runtime and the @effect/vitest harness are
 * wired before any product code exists. Everything later builds on this.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

describe("test baseline", () => {
  it.effect("runs an Effect program", () =>
    Effect.gen(function* () {
      const value = yield* Effect.succeed(21).pipe(Effect.map((n) => n * 2));
      expect(value).toBe(42);
    }));

  it.effect("surfaces a tagged failure through the error channel", () =>
    Effect.gen(function* () {
      const failed = yield* Effect.fail("baseline-failure").pipe(Effect.flip);
      expect(failed).toBe("baseline-failure");
    }));
});
