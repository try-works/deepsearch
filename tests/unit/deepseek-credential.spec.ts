import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { searchWith } from "../../src/lib/deepseek";

describe("searchWith without a credential", () => {
  it.effect("fails with CredentialMissing instead of calling the network", () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const transport = {
        execute: (url: string) => {
          calls.push(url);
          return Promise.resolve({ status: 200, text: "{}" });
        },
      };
      const error = yield* searchWith(transport, { query: "deepseek", headers: null }).pipe(Effect.flip);
      expect(error._tag).toBe("CredentialMissing");
      expect(calls).toEqual([]);
    }));
});