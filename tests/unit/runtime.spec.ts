/**
 * R10: the runtime is a real ManagedRuntime over Layers, and its services can be
 * replaced by a test Layer without touching the routes.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { beginSignIn } from "../../src/server/sign-in";
import { OAuthTransportService, SignInSettings, signInDeps } from "../../src/server/runtime";
import type { OAuthTransport } from "../../src/server/oauth-client";

const CONFIG = {
  platformOrigin: "https://platform.deepseek.com",
  callbackOrigin: "https://deepsearch.ing",
  relayRedirectUri: "http://127.0.0.1:18765/oauth/callback",
  clientVersion: "0.1.0",
  locale: "en_US",
  timezoneOffset: "0",
  secret: "not-a-real-secret-for-tests",
};

const initBody = JSON.stringify({
  code: 0,
  data: {
    biz_code: 0,
    biz_data: { authorize_url: "https://platform.deepseek.com/dsh/authorize?authorize_id=x", authorize_id: "x", expires_in: 600 },
  },
});

const stubTransport: OAuthTransport = {
  post: () => Promise.resolve({ status: 200, text: initBody }),
};

const TestLayer = Layer.merge(
  Layer.succeed(OAuthTransportService, stubTransport),
  Layer.succeed(SignInSettings, CONFIG),
);

describe("server runtime", () => {
  it.effect("provides both services from a Layer", () =>
    Effect.gen(function* () {
      const deps = yield* signInDeps;
      expect(deps.config.callbackOrigin).toBe("https://deepsearch.ing");
      expect(deps.transport).toBe(stubTransport);
    }).pipe(Effect.provide(TestLayer)));

  it.effect("runs the whole begin-sign-in program through the test Layer", () =>
    Effect.gen(function* () {
      const deps = yield* signInDeps;
      const started = yield* beginSignIn(deps);
      expect(started.mode).toBe("hosted");
      expect(started.authorizeUrl).toContain("authorize_id=x");
    }).pipe(Effect.provide(TestLayer)));
});
