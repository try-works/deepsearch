/**
 * R3: the browser side of sign-in. Talks to our own `/api/auth/*` endpoints and
 * never touches the Platform directly, so the token only ever arrives through
 * the Worker that minted it.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { signInClient } from "../../src/lib/sign-in-client";

function stubFetch(status: number, body: string) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl: typeof fetch = (input, init) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(new Response(body.length === 0 ? null : body, { status }));
  };
  return { impl, calls };
}

describe("signInClient.start", () => {
  it.effect("posts to the start endpoint and returns the authorize URL and mode", () =>
    Effect.gen(function* () {
      const { impl, calls } = stubFetch(200, JSON.stringify({ authorizeUrl: "https://platform.deepseek.com/dsh/authorize?authorize_id=x", mode: "hosted" }));
      const started = yield* signInClient(impl).start();
      expect(started.authorizeUrl).toContain("authorize_id=x");
      expect(started.mode).toBe("hosted");
      expect(calls[0]?.url).toBe("/api/auth/start");
      expect(calls[0]?.init?.method).toBe("POST");
    }));

  it.effect("maps a 502 to Transport", () =>
    Effect.gen(function* () {
      const { impl } = stubFetch(502, "{}");
      const error = yield* signInClient(impl).start().pipe(Effect.flip);
      expect(error._tag).toBe("Transport");
    }));

  it.effect("maps an unreadable body to ProtocolError", () =>
    Effect.gen(function* () {
      const { impl } = stubFetch(200, "not json");
      const error = yield* signInClient(impl).start().pipe(Effect.flip);
      expect(error._tag).toBe("ProtocolError");
    }));
});

describe("signInClient.complete", () => {
  it.effect("posts the pasted address as plain text", () =>
    Effect.gen(function* () {
      const { impl, calls } = stubFetch(200, JSON.stringify({ token: "dsh_test", authorizedUrl: "https://platform.deepseek.com/dsh/authorized?result=x" }));
      const done = yield* signInClient(impl).complete("http://127.0.0.1:18765/oauth/callback?code=c&state=s");
      expect(done.token).toBe("dsh_test");
      expect(calls[0]?.url).toBe("/api/auth/complete");
      expect(calls[0]?.init?.body).toBe("http://127.0.0.1:18765/oauth/callback?code=c&state=s");
      expect((calls[0]?.init?.headers as Record<string, string>)["content-type"]).toBe("text/plain");
    }));

  it.effect("maps 410 to AttemptInvalid", () =>
    Effect.gen(function* () {
      const { impl } = stubFetch(410, JSON.stringify({ error: "expired" }));
      const error = yield* signInClient(impl).complete("x").pipe(Effect.flip);
      expect(error._tag).toBe("AttemptInvalid");
    }));
});

describe("signInClient.cancel", () => {
  it.effect("posts to the cancel endpoint", () =>
    Effect.gen(function* () {
      const { impl, calls } = stubFetch(204, "");
      yield* signInClient(impl).cancel();
      expect(calls[0]?.url).toBe("/api/auth/cancel");
    }));
});
