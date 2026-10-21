/**
 * The server's dependency graph, as Effect Layers behind one ManagedRuntime (R10).
 *
 * Route seams run a single program through `runtime` instead of reaching for
 * `fetch` or `process.env` themselves. Tests provide a Layer of stubs, which is
 * what makes the transport and settings replaceable without touching callers.
 */
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { signInConfig } from "./http";
import { oauthFetchTransport, type OAuthTransport } from "./oauth-client";
import type { SignInConfig } from "./sign-in";

/** The auth transport the OAuth client posts through. */
export class OAuthTransportService extends Context.Service<OAuthTransportService, OAuthTransport>()(
  "deepsearch/OAuthTransport",
) {}

/** The Platform settings and the cookie signing key. */
export class SignInSettings extends Context.Service<SignInSettings, SignInConfig>()("deepsearch/SignInSettings") {}

export const TransportLive = Layer.succeed(OAuthTransportService, oauthFetchTransport(fetch));

export const SettingsLive = Layer.effect(
  SignInSettings,
  Effect.sync(() => signInConfig()),
);

export const AppLayer = Layer.merge(TransportLive, SettingsLive);

/** One runtime per Worker isolate, built from the same Layer the tests can override. */
export const runtime = ManagedRuntime.make(AppLayer);

/** Pull both services out of the context as one record. */
export const signInDeps = Effect.gen(function* () {
  const config = yield* SignInSettings;
  const transport = yield* OAuthTransportService;
  return { config, transport };
});
