import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { CALLBACK_COOKIE, clearCookieHeader, readCookie } from "../../../server/http";
import { runtime, signInDeps } from "../../../server/runtime";
import { cancelSignIn } from "../../../server/sign-in";

/** Abandon a pending sign-in attempt; always clears the cookie (R3, R10). */
export const Route = createFileRoute("/api/auth/cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cookie = readCookie(request, CALLBACK_COOKIE);
        try {
          const program = Effect.gen(function* () {
            const deps = yield* signInDeps;
            return yield* cancelSignIn(deps, { cookie });
          });
          await runtime.runPromise(program);
        } catch {
          // Cancel is best-effort: the user asked to stop, and the cookie goes either way.
        }
        return new Response(null, { status: 204, headers: { "set-cookie": clearCookieHeader(CALLBACK_COOKIE) } });
      },
    },
  },
});
