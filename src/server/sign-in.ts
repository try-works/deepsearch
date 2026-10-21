/**
 * Sign-in orchestration for DeepSeek account OAuth (R3).
 *
 * `begin` creates a PKCE attempt, asks the Platform for an authorization URL,
 * and seals the attempt into a cookie value. `complete` unseals it, checks the
 * state, and exchanges the code exactly once. `cancel` tells the Platform to
 * abandon the attempt, best-effort.
 *
 * Nothing here touches HTTP headers, cookies, or the framework: the route seam
 * supplies the cookie string and the pasted address, which keeps the whole flow
 * testable against a stub Platform.
 */
import { Effect } from "effect";
import { AttemptInvalid } from "../lib/errors";
import {
  challengeFor,
  modeFor,
  newAttempt,
  parseRedirectAddress,
  redirectUriFor,
  sealAttempt,
  stateMatches,
  unsealAttempt,
  type Attempt,
  type Mode,
} from "./oauth-flow";
import { oauthClient, type OAuthError, type OAuthTransport } from "./oauth-client";

export interface SignInConfig {
  readonly platformOrigin: string;
  readonly callbackOrigin: string;
  /** Loopback origin named in hosted mode; nothing listens there by design. */
  readonly relayRedirectUri: string;
  readonly clientVersion: string;
  readonly locale: string;
  readonly timezoneOffset: string;
  /** HMAC key for the sealed attempt cookie. */
  readonly secret: string;
}

export interface SignInDeps {
  readonly config: SignInConfig;
  readonly transport: OAuthTransport;
}

export interface StartedSignIn {
  readonly authorizeUrl: string;
  readonly cookie: string;
  readonly mode: Mode;
  readonly expiresIn: number;
}

export interface CompletedSignIn {
  readonly token: string;
  readonly authorizedUrl: string;
}

export type SignInError = OAuthError | AttemptInvalid;

function clientFor(deps: SignInDeps) {
  return oauthClient(deps.transport, {
    platformOrigin: deps.config.platformOrigin,
    clientVersion: deps.config.clientVersion,
    locale: deps.config.locale,
    timezoneOffset: deps.config.timezoneOffset,
  });
}

/** Start a sign-in: one attempt, one authorization URL, one sealed cookie value. */
export function beginSignIn(deps: SignInDeps): Effect.Effect<StartedSignIn, SignInError> {
  return Effect.gen(function* () {
    const redirectUri = redirectUriFor(deps.config.callbackOrigin, deps.config.relayRedirectUri);
    const attempt = newAttempt(redirectUri);
    const challenge = yield* challengeFor(attempt.verifier);
    const started = yield* clientFor(deps).init({
      challenge,
      state: attempt.state,
      redirectUri,
    });
    const cookie = yield* sealAttempt(deps.config.secret, { ...attempt, authorizeId: started.authorizeId });
    return {
      authorizeUrl: started.authorizeUrl,
      cookie,
      mode: modeFor(deps.config.callbackOrigin),
      expiresIn: started.expiresIn,
    };
  });
}

function attemptFrom(cookie: string | null, secret: string): Effect.Effect<Attempt, AttemptInvalid> {
  if (cookie === null) return Effect.fail(new AttemptInvalid({ message: "no sign-in attempt is pending" }));
  return unsealAttempt(secret, cookie).pipe(
    Effect.flatMap((attempt) =>
      attempt === null
        ? Effect.fail(new AttemptInvalid({ message: "the sign-in attempt could not be verified" }))
        : Effect.succeed(attempt),
    ),
  );
}

/**
 * Finish a sign-in from the pasted redirect address. Used in hosted mode, where
 * the Platform's redirect lands on a loopback origin nothing is listening on.
 */
export function completeSignIn(
  deps: SignInDeps,
  input: { readonly cookie: string | null; readonly address: string; readonly osVersion: string },
): Effect.Effect<CompletedSignIn, SignInError> {
  return Effect.gen(function* () {
    const attempt = yield* attemptFrom(input.cookie, deps.config.secret);
    const parsed = parseRedirectAddress(input.address);
    if (parsed === null) {
      return yield* new AttemptInvalid({ message: "the pasted address did not contain exactly one code and state" });
    }
    if (!stateMatches(attempt.state, parsed.state)) {
      return yield* new AttemptInvalid({ message: "the pasted address does not belong to this sign-in attempt" });
    }
    const exchanged = yield* clientFor(deps).exchange({
      code: parsed.code,
      verifier: attempt.verifier,
      redirectUri: attempt.redirectUri,
      deviceId: attempt.deviceId,
      osVersion: input.osVersion,
    });
    return { token: exchanged.token, authorizedUrl: exchanged.authorizedUrl };
  });
}

/**
 * Finish a sign-in from a redirect the Worker received itself. Used in loopback
 * mode, where the Platform can reach the dev server.
 */
export function completeSignInFromRedirect(
  deps: SignInDeps,
  input: { readonly cookie: string | null; readonly code: string; readonly state: string; readonly osVersion: string },
): Effect.Effect<CompletedSignIn, SignInError> {
  return Effect.gen(function* () {
    const attempt = yield* attemptFrom(input.cookie, deps.config.secret);
    if (!stateMatches(attempt.state, input.state)) {
      return yield* new AttemptInvalid({ message: "the redirect does not belong to this sign-in attempt" });
    }
    const exchanged = yield* clientFor(deps).exchange({
      code: input.code,
      verifier: attempt.verifier,
      redirectUri: attempt.redirectUri,
      deviceId: attempt.deviceId,
      osVersion: input.osVersion,
    });
    return { token: exchanged.token, authorizedUrl: exchanged.authorizedUrl };
  });
}

/** Abandon a pending attempt. A failure here is silent by design. */
export function cancelSignIn(
  deps: SignInDeps,
  input: { readonly cookie: string | null },
): Effect.Effect<void, SignInError> {
  if (input.cookie === null) return Effect.void;
  return unsealAttempt(deps.config.secret, input.cookie).pipe(
    Effect.flatMap((attempt) => {
      if (attempt === null) return Effect.void;
      return clientFor(deps)
        .cancel({ authorizeId: attempt.authorizeId, verifier: attempt.verifier })
        .pipe(Effect.catchTag("OAuthRejected", () => Effect.void));
    }),
  );
}
