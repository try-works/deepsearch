import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { CALLBACK_COOKIE, clearCookieHeader, json, readCookie } from "../../../server/http";
import { runtime, signInDeps } from "../../../server/runtime";
import { completeSignIn } from "../../../server/sign-in";

/**
 * Finish a hosted-mode sign-in from the address the user pasted (R3, R10).
 * The body is the raw address as text/plain, so nothing is decoded speculatively.
 */
export const Route = createFileRoute("/api/auth/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const address = await request.text();
          const cookie = readCookie(request, CALLBACK_COOKIE);
          const osVersion = request.headers.get("sec-ch-ua-platform") ?? "web";
          const program = Effect.gen(function* () {
            const deps = yield* signInDeps;
            return yield* completeSignIn(deps, { cookie, address, osVersion });
          });
          const done = await runtime.runPromise(program);
          return json(JSON.stringify({ token: done.token, authorizedUrl: done.authorizedUrl }), 200, {
            "set-cookie": clearCookieHeader(CALLBACK_COOKIE),
          });
        } catch {
          return json(JSON.stringify({ error: "auth_complete_failed" }), 410, {
            "set-cookie": clearCookieHeader(CALLBACK_COOKIE),
          });
        }
      },
    },
  },
});
