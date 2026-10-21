/**
 * R3: the OAuth flow's pure mechanics — mode selection, PKCE, the sealed attempt
 * cookie, and the pasted-address parser. Tested without a network or a browser.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  challengeFor,
  modeFor,
  newAttempt,
  parseRedirectAddress,
  redirectUriFor,
  sealAttempt,
  stateMatches,
  unsealAttempt,
} from "../../src/server/oauth-flow";

const SECRET = "not-a-real-secret-for-tests";

describe("modeFor", () => {
  it("treats an http callback origin as loopback", () => {
    expect(modeFor("http://localhost:8787")).toBe("loopback");
  });

  it("treats an https callback origin as hosted", () => {
    expect(modeFor("https://deepsearch.ing")).toBe("hosted");
  });
});

describe("redirectUriFor", () => {
  it("uses the live callback in loopback mode", () => {
    expect(redirectUriFor("http://localhost:8787", "http://127.0.0.1:18765/oauth/callback")).toBe(
      "http://localhost:8787/oauth/callback",
    );
  });

  it("uses the relay origin in hosted mode, because the Platform needs loopback", () => {
    expect(redirectUriFor("https://deepsearch.ing", "http://127.0.0.1:18765/oauth/callback")).toBe(
      "http://127.0.0.1:18765/oauth/callback",
    );
  });
});

describe("challengeFor", () => {
  it.effect("computes the RFC 7636 S256 challenge", () =>
    Effect.gen(function* () {
      const challenge = yield* challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
      expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }));
});

describe("sealed attempt", () => {
  it.effect("round-trips the attempt", () =>
    Effect.gen(function* () {
      const attempt = newAttempt("http://127.0.0.1:18765/oauth/callback");
      const sealed = yield* sealAttempt(SECRET, attempt);
      const opened = yield* unsealAttempt(SECRET, sealed);
      expect(opened).toEqual(attempt);
    }));

  it.effect("rejects a tampered payload", () =>
    Effect.gen(function* () {
      const attempt = newAttempt("http://127.0.0.1:18765/oauth/callback");
      const sealed = yield* sealAttempt(SECRET, attempt);
      const [body, signature] = sealed.split(".");
      const tampered = `${body ?? ""}x.${signature ?? ""}`;
      expect(yield* unsealAttempt(SECRET, tampered)).toBeNull();
    }));

  it.effect("rejects a signature from another secret", () =>
    Effect.gen(function* () {
      const attempt = newAttempt("http://127.0.0.1:18765/oauth/callback");
      const sealed = yield* sealAttempt(SECRET, attempt);
      expect(yield* unsealAttempt("another-secret-value-1234567890", sealed)).toBeNull();
    }));
});

describe("parseRedirectAddress", () => {
  it("extracts one code and one state from a pasted address", () => {
    expect(parseRedirectAddress("http://127.0.0.1:18765/oauth/callback?code=abc&state=xyz")).toEqual({
      code: "abc",
      state: "xyz",
    });
  });

  it("rejects a repeated code", () => {
    expect(parseRedirectAddress("http://127.0.0.1:1/cb?code=a&code=b&state=x")).toBeNull();
  });

  it("rejects a missing state", () => {
    expect(parseRedirectAddress("http://127.0.0.1:1/cb?code=a")).toBeNull();
  });

  it("rejects text that is not a URL", () => {
    expect(parseRedirectAddress("not a url")).toBeNull();
  });
});

describe("stateMatches", () => {
  it("accepts the same state", () => {
    expect(stateMatches("abc", "abc")).toBe(true);
  });

  it("rejects a different state of the same length", () => {
    expect(stateMatches("abc", "abd")).toBe(false);
  });

  it("rejects a state of a different length", () => {
    expect(stateMatches("abc", "abcd")).toBe(false);
  });
});
