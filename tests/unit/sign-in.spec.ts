/**
 * R3: the sign-in orchestration — begin, complete (loopback and hosted relay),
 * and cancel. Composed from the flow mechanics and the auth client, so the whole
 * thing is testable against a stub Platform with no browser.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { unsealAttempt } from "../../src/server/oauth-flow";
import { beginSignIn, cancelSignIn, completeSignIn, type SignInConfig } from "../../src/server/sign-in";
import type { OAuthTransport } from "../../src/server/oauth-client";

const CONFIG: SignInConfig = {
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

const exchangeBody = JSON.stringify({
  code: 0,
  data: { biz_code: 0, biz_data: { token: "dsh_test", authorized_url: "https://platform.deepseek.com/dsh/authorized?result=x" } },
});

const cancelBody = '{"code":0,"data":{"biz_code":0,"biz_data":null}}';

interface Stub {
  readonly transport: OAuthTransport;
  readonly calls: string[];
}

function stub(): Stub {
  const calls: string[] = [];
  return {
    calls,
    transport: {
      post: (url) => {
        calls.push(url);
        if (url.endsWith("/auth_init")) return Promise.resolve({ status: 200, text: initBody });
        if (url.endsWith("/auth_exchange")) return Promise.resolve({ status: 200, text: exchangeBody });
        return Promise.resolve({ status: 200, text: cancelBody });
      },
    },
  };
}

describe("beginSignIn", () => {
  it.effect("uses the relay redirect and returns a sealed attempt in hosted mode", () =>
    Effect.gen(function* () {
      const { transport } = stub();
      const started = yield* beginSignIn({ config: CONFIG, transport });
      expect(started.mode).toBe("hosted");
      expect(started.authorizeUrl).toContain("authorize_id=x");

      const attempt = yield* unsealAttempt(CONFIG.secret, started.cookie);
      expect(attempt?.redirectUri).toBe(CONFIG.relayRedirectUri);
    }));

  it.effect("uses the live callback when the origin is loopback", () =>
    Effect.gen(function* () {
      const { transport } = stub();
      const started = yield* beginSignIn({
        config: { ...CONFIG, callbackOrigin: "http://localhost:8787" },
        transport,
      });
      expect(started.mode).toBe("loopback");
      const attempt = yield* unsealAttempt(CONFIG.secret, started.cookie);
      expect(attempt?.redirectUri).toBe("http://localhost:8787/oauth/callback");
    }));
});

describe("completeSignIn", () => {
  it.effect("exchanges a valid pasted address for a token", () =>
    Effect.gen(function* () {
      const { transport } = stub();
      const started = yield* beginSignIn({ config: CONFIG, transport });
      const attempt = yield* unsealAttempt(CONFIG.secret, started.cookie);
      const address = `http://127.0.0.1:18765/oauth/callback?code=the-code&state=${attempt?.state ?? ""}`;

      const result = yield* completeSignIn({ config: CONFIG, transport }, { cookie: started.cookie, address, osVersion: "Windows" });
      expect(result.token).toBe("dsh_test");
    }));

  it.effect("rejects an attempt with no cookie", () =>
    Effect.gen(function* () {
      const { transport } = stub();
      const error = yield* completeSignIn(
        { config: CONFIG, transport },
        { cookie: null, address: "http://127.0.0.1:1/cb?code=c&state=s", osVersion: "w" },
      ).pipe(Effect.flip);
      expect(error._tag).toBe("AttemptInvalid");
    }));

  it.effect("rejects a state that does not match the attempt", () =>
    Effect.gen(function* () {
      const { transport } = stub();
      const started = yield* beginSignIn({ config: CONFIG, transport });
      const error = yield* completeSignIn(
        { config: CONFIG, transport },
        { cookie: started.cookie, address: "http://127.0.0.1:1/cb?code=c&state=wrong", osVersion: "w" },
      ).pipe(Effect.flip);
      expect(error._tag).toBe("AttemptInvalid");
    }));

  it.effect("rejects an address with a repeated code", () =>
    Effect.gen(function* () {
      const { transport } = stub();
      const started = yield* beginSignIn({ config: CONFIG, transport });
      const error = yield* completeSignIn(
        { config: CONFIG, transport },
        { cookie: started.cookie, address: "http://127.0.0.1:1/cb?code=a&code=b&state=x", osVersion: "w" },
      ).pipe(Effect.flip);
      expect(error._tag).toBe("AttemptInvalid");
    }));
});

describe("cancelSignIn", () => {
  it.effect("posts a cancel for a valid sealed attempt", () =>
    Effect.gen(function* () {
      const { transport, calls } = stub();
      const started = yield* beginSignIn({ config: CONFIG, transport });
      yield* cancelSignIn({ config: CONFIG, transport }, { cookie: started.cookie });
      expect(calls.some((url) => url.endsWith("/auth_cancel"))).toBe(true);
    }));

  it.effect("does nothing without a cookie", () =>
    Effect.gen(function* () {
      const { transport, calls } = stub();
      yield* cancelSignIn({ config: CONFIG, transport }, { cookie: null });
      expect(calls).toHaveLength(0);
    }));
});
