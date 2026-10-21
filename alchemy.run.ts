/**
 * The whole DeepSearch deployment, in Effect.
 *
 * `Cloudflare.Website.Vite` builds the TanStack Start app (client assets and the
 * SSR server bundle) in one `vite build` and deploys it as a Worker. There is no
 * separate wrangler config: Alchemy owns the build and the routing.
 *
 * Auth comes from `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in the
 * environment, so no interactive profile is required.
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { resolveStateKey } from "./src/lib/state-key";

// The cookie-signing key arrives as a secret binding. resolveStateKey returns a
// `Redacted`, which is what makes Alchemy bind it as `secret_text`; a plain
// string would be stored in clear text and shown in the Cloudflare dashboard.

export default Alchemy.Stack(
  "DeepSearch",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = process.env.ALCHEMY_STAGE ?? "local";
    const web = yield* Cloudflare.Website.Vite("Web", {
      routes: [
        { pattern: "deepsearch.ing/*", zoneName: "deepsearch.ing" },
        { pattern: "www.deepsearch.ing/*", zoneName: "deepsearch.ing" },
      ],
      env: {
        STATE_KEY: resolveStateKey(stage, process.env.STATE_KEY),
        CALLBACK_ORIGIN: process.env.CALLBACK_ORIGIN ?? "https://deepsearch.ing",
        PLATFORM_ORIGIN: "https://platform.deepseek.com",
        RELAY_REDIRECT_URI: "http://127.0.0.1:18765/oauth/callback",
        CLIENT_VERSION: "0.1.0",
      },
    });
    return { url: web.url };
  }),
);
