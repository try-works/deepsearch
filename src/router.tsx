import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** The router entry TanStack Start resolves from src/router. */
export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
