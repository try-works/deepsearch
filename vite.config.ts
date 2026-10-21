import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

// Alchemy appends its own Cloudflare plugin at build time; adding
// @cloudflare/vite-plugin here would conflict with it.
export default defineConfig({
  plugins: [tanstackStart(), viteReact()],
  test: {
    // e2e/** is Playwright's; vitest would otherwise try to run those specs.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"], 
  },
});