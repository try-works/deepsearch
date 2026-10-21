/**
 * The browser side of sign-in (R3).
 *
 * The tab never talks to `platform.deepseek.com` for auth: it posts to our own
 * `/api/auth/*` endpoints, which hold the PKCE verifier and perform the
 * exchange. The token arrives here once and goes straight into the vault.
 */
import { Effect, Schema } from "effect";
import { AttemptInvalid, ProtocolError, TransportError } from "./errors";

export interface StartedSignIn {
  readonly authorizeUrl: string;
  readonly mode: "loopback" | "hosted";
}

export interface CompletedSignIn {
  readonly token: string;
  readonly authorizedUrl: string;
}

export type SignInClientError = TransportError | ProtocolError | AttemptInvalid;

const Started = Schema.Struct({
  authorizeUrl: Schema.String,
  mode: Schema.Union([Schema.Literal("loopback"), Schema.Literal("hosted")]),
});

const Completed = Schema.Struct({
  token: Schema.String,
  authorizedUrl: Schema.String,
});

export interface SignInClient {
  start(): Effect.Effect<StartedSignIn, SignInClientError>;
  complete(address: string): Effect.Effect<CompletedSignIn, SignInClientError>;
  cancel(): Effect.Effect<void, SignInClientError>;
}

function statusError(status: number): SignInClientError {
  if (status === 410 || status === 400) {
    return new AttemptInvalid({ message: "the sign-in attempt is no longer valid" });
  }
  return new TransportError({ message: `the sign-in service returned status ${status}` });
}


export function signInClient(implementation: typeof fetch = fetch): SignInClient {
  return {
    start: () =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: () => implementation("/api/auth/start", { method: "POST" }),
          catch: () => new TransportError({ message: "the sign-in service could not be reached" }),
        });
        if (!response.ok) return yield* statusError(response.status);
        const decoded = yield* Effect.tryPromise({
          try: () => response.text().then((text) => JSON.parse(text)),
          catch: () => new ProtocolError({ message: "the sign-in service returned an unreadable body" }),
        }).pipe(
          Effect.flatMap((value) =>
            Schema.decodeUnknownEffect(Started)(value).pipe(
              Effect.mapError(() => new ProtocolError({ message: "the sign-in service returned an unexpected body" })),
            ),
          ),
        );
        return { authorizeUrl: decoded.authorizeUrl, mode: decoded.mode };
      }),

    complete: (address) =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: () =>
            implementation("/api/auth/complete", {
              method: "POST",
              headers: { "content-type": "text/plain" },
              body: address,
            }),
          catch: () => new TransportError({ message: "the sign-in service could not be reached" }),
        });
        if (!response.ok) return yield* statusError(response.status);
        const decoded = yield* Effect.tryPromise({
          try: () => response.text().then((text) => JSON.parse(text)),
          catch: () => new ProtocolError({ message: "the sign-in service returned an unreadable body" }),
        }).pipe(
          Effect.flatMap((value) =>
            Schema.decodeUnknownEffect(Completed)(value).pipe(
              Effect.mapError(() => new ProtocolError({ message: "the sign-in service returned an unexpected body" })),
            ),
          ),
        );
        return { token: decoded.token, authorizedUrl: decoded.authorizedUrl };
      }),

    cancel: () =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: () => implementation("/api/auth/cancel", { method: "POST" }),
          catch: () => new TransportError({ message: "the sign-in service could not be reached" }),
        });
        if (!response.ok && response.status !== 204) return yield* statusError(response.status);
        return undefined;
      }),
  };
}
