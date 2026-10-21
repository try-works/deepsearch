/**
 * R2 guard: the storage key may be written by exactly one module. This test
 * fails the build if any other file starts reading or writing credentials.
 */
import { describe, expect, it } from "@effect/vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE_ROOT = join(process.cwd(), "src");
const OWNER = "lib/credentials.ts";

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) found.push(full);
  }
  return found;
}

describe("credential custody", () => {
  it("only the credential module mentions storage or the credential key", () => {
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((file) => !file.endsWith(OWNER.split("/").join("\\")) && !file.endsWith(OWNER))
      .filter((file) => /localStorage|sessionStorage|indexedDB|deepsearch\.credential/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(SOURCE_ROOT.length + 1));

    expect(offenders).toEqual([]);
  });
});
