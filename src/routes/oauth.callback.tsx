import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { handoffPage, noticePage } from "../server/auth-pages";
import { CALLBACK_COOKIE, clearCookieHeader, htmlDocument, readCookie } from "../server/http";
import { runtime, signInDeps } from "../server/runtime";
import { completeSignInFromRedirect } from "../server/sign-in";

/**
 * The loopback redirect target (R3). The Platform sends the browser here in
 * local development, where the Worker itself can receive the code; it exchanges
 * it, then hands the token to the opener and closes.
 */
export const Route = createFileRoute("/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const codes = url.searchParams.getAll("code");
        const states = url.searchParams.getAll("state");
        const code = codes[0];
        const state = states[0];
        if (codes.length !== 1 || states.length !== 1 || code === undefined || state === undefined) {
          return htmlDocument(
            noticePage("Sign-in incomplete", "The provider did not return exactly one authorization code."),
            400,
          );
        }

        try {
          const cookie = readCookie(request, CALLBACK_COOKIE);
          const osVersion = request.headers.get("sec-ch-ua-platform") ?? "web";
          const program = Effect.gen(function* () {
            const deps = yield* signInDeps;
            return yield* completeSignInFromRedirect(deps, { cookie, code, state, osVersion });
          });
          const done = await runtime.runPromise(program);
          const nonce = crypto.randomUUID().replaceAll("-", "");
          return htmlDocument(handoffPage(nonce, done.token, done.authorizedUrl), 200, {
            "set-cookie": clearCookieHeader(CALLBACK_COOKIE),
            "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'`,
            "referrer-policy": "no-referrer",
          });
        } catch {
          return htmlDocument(
            noticePage("Sign-in rejected", "This attempt could not be completed. Start again from the app."),
            400,
            { "set-cookie": clearCookieHeader(CALLBACK_COOKIE) },
          );
        }
      },
    },
  },
});
