/**
 * R3: the dsh auth endpoints — request shape, envelope handling, and one tagged
 * error per failure. Driven through a stub transport, so no Platform is needed.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { oauthClient, type OAuthTransport, type OAuthTransportResult } from "../../src/server/oauth-client";

const CONFIG = {
  platformOrigin: "https://platform.deepseek.com",
  clientVersion: "0.1.0",
  locale: "en_US",
  timezoneOffset: "0",
};

function recording(result: OAuthTransportResult) {
  const calls: { url: string; body: string; headers: Readonly<Record<string, string>> }[] = [];
  const transport: OAuthTransport = {
    post: (url, body, headers) => {
      calls.push({ url, body, headers });
      return Promise.resolve(result);
    },
  };
  return { transport, calls };
}

const initOk = JSON.stringify({
  code: 0,
  data: {
    biz_code: 0,
    biz_data: { authorize_url: "https://platform.deepseek.com/dsh/authorize?authorize_id=x", authorize_id: "x", expires_in: 600 },
  },
});

const exchangeOk = JSON.stringify({
  code: 0,
  data: { biz_code: 0, biz_data: { token: "dsh_test", authorized_url: "https://platform.deepseek.com/dsh/authorized?result=x" } },
});

describe("oauthClient.init", () => {
  it.effect("posts the PKCE request with the client headers", () =>
    Effect.gen(function* () {
      const { transport, calls } = recording({ status: 200, text: initOk });
      const data = yield* oauthClient(transport, CONFIG).init({
        challenge: "challenge",
        state: "state",
        redirectUri: "http://127.0.0.1:18765/oauth/callback",
      });
      expect(data.authorizeId).toBe("x");
      expect(data.expiresIn).toBe(600);
      const call = calls[0];
      expect(call?.url).toBe("https://platform.deepseek.com/auth-api/v0/dsh/auth_init");
      expect(call?.headers["x-client-platform"]).toBe("web");
      expect(call?.headers["x-client-version"]).toBe("0.1.0");
      const body: unknown = JSON.parse(call?.body ?? "{}");
      expect(body).toMatchObject({
        code_challenge: "challenge",
        code_challenge_method: "S256",
        state: "state",
        redirect_uri: "http://127.0.0.1:18765/oauth/callback",
        login_source: "web",
      });
    }));

  it.effect("surfaces a Platform business rejection as OAuthRejected", () =>
    Effect.gen(function* () {
      const { transport } = recording({ status: 200, text: '{"code":50005,"msg":"PAYLOAD_SCHEMA_MISMATCH","data":null}' });
      const error = yield* oauthClient(transport, CONFIG)
        .init({ challenge: "c", state: "s", redirectUri: "https://deepsearch.ing/oauth/callback" })
        .pipe(Effect.flip);
      expect(error._tag).toBe("OAuthRejected");
      expect(error.message).toContain("50005");
    }));
});

describe("oauthClient.exchange", () => {
  it.effect("sends the verifier, redirect, and device fields", () =>
    Effect.gen(function* () {
      const { transport, calls } = recording({ status: 200, text: exchangeOk });
      const data = yield* oauthClient(transport, CONFIG).exchange({
        code: "code",
        verifier: "verifier",
        redirectUri: "http://127.0.0.1:18765/oauth/callback",
        deviceId: "device",
        osVersion: "Windows",
      });
      expect(data.token).toBe("dsh_test");
      const body: unknown = JSON.parse(calls[0]?.body ?? "{}");
      expect(body).toMatchObject({
        code: "code",
        code_verifier: "verifier",
        redirect_uri: "http://127.0.0.1:18765/oauth/callback",
        device_id: "device",
        device_model: "web",
        os_version: "Windows",
      });
    }));

  it.effect("maps a non-2xx response to Transport", () =>
    Effect.gen(function* () {
      const { transport } = recording({ status: 503, text: "" });
      const error = yield* oauthClient(transport, CONFIG)
        .exchange({ code: "c", verifier: "v", redirectUri: "r", deviceId: "d", osVersion: "o" })
        .pipe(Effect.flip);
      expect(error._tag).toBe("Transport");
    }));

  it.effect("maps a malformed body to ProtocolError", () =>
    Effect.gen(function* () {
      const { transport } = recording({ status: 200, text: "not json" });
      const error = yield* oauthClient(transport, CONFIG)
        .exchange({ code: "c", verifier: "v", redirectUri: "r", deviceId: "d", osVersion: "o" })
        .pipe(Effect.flip);
      expect(error._tag).toBe("ProtocolError");
    }));
});

describe("oauthClient.cancel", () => {
  it.effect("posts the authorize id and verifier", () =>
    Effect.gen(function* () {
      const { transport, calls } = recording({ status: 200, text: '{"code":0,"data":{"biz_code":0,"biz_data":null}}' });
      yield* oauthClient(transport, CONFIG).cancel({ authorizeId: "auth-id", verifier: "verifier" });
      const body: unknown = JSON.parse(calls[0]?.body ?? "{}");
      expect(body).toMatchObject({ authorize_id: "auth-id", code_verifier: "verifier" });
    }));
});
