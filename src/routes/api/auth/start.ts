import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { CALLBACK_COOKIE, cookieHeader, isSecure, json } from "../../../server/http";
import { runtime, signInDeps } from "../../../server/runtime";
import { beginSignIn } from "../../../server/sign-in";

/** Start a sign-in attempt and hand the tab its authorization URL (R3, R10). */
export const Route = createFileRoute("/api/auth/start")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const program = Effect.gen(function* () {
            const deps = yield* signInDeps;
            const started = yield* beginSignIn(deps);
            return { started, secure: isSecure(deps.config) };
          });
          const { started, secure } = await runtime.runPromise(program);
          return json(JSON.stringify({ authorizeUrl: started.authorizeUrl, mode: started.mode }), 200, {
            "set-cookie": cookieHeader(CALLBACK_COOKIE, started.cookie, secure),
          });
        } catch {
          return json(JSON.stringify({ error: "auth_start_failed" }), 502);
        }
      },
    },
  },
});
