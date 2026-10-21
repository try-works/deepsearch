/**
 * R2: the credential vault is the only module that touches storage, the secret
 * never leaves it except as an auth header, and save is write-only.
 */
import { describe, expect, it } from "@effect/vitest";
import { createVault, STORAGE_KEY } from "../../src/lib/credentials";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    keys: () => [...map.keys()],
  };
}

describe("credential vault", () => {
  it("starts unconfigured", () => {
    const vault = createVault(memoryStorage());
    expect(vault.configured()).toBe(false);
    expect(vault.authHeaders()).toBeNull();
  });

  it("stores an API key and exposes it only as a bearer header", () => {
    const vault = createVault(memoryStorage());
    vault.save({ kind: "apiKey", value: "sk-test" });
    expect(vault.configured()).toBe(true);
    expect(vault.authHeaders()).toEqual({ Authorization: "Bearer sk-test" });
  });

  it("stores an account token under the account header", () => {
    const vault = createVault(memoryStorage());
    vault.save({ kind: "accountToken", value: "dsh-test" });
    expect(vault.authHeaders()).toEqual({ "x-dsh-auth-token": "dsh-test" });
  });

  it("replaces the previous credential rather than keeping both", () => {
    const storage = memoryStorage();
    const vault = createVault(storage);
    vault.save({ kind: "apiKey", value: "sk-test" });
    vault.save({ kind: "accountToken", value: "dsh-test" });
    expect(vault.authHeaders()).toEqual({ "x-dsh-auth-token": "dsh-test" });
    expect(storage.keys()).toEqual([STORAGE_KEY]);
  });

  it("clears the credential", () => {
    const storage = memoryStorage();
    const vault = createVault(storage);
    vault.save({ kind: "apiKey", value: "sk-test" });
    vault.clear();
    expect(vault.configured()).toBe(false);
    expect(storage.keys()).toEqual([]);
  });

  it("refuses to save an empty secret", () => {
    const vault = createVault(memoryStorage());
    expect(() => vault.save({ kind: "apiKey", value: "   " })).toThrow();
  });

  it("survives a storage that throws on write", () => {
    const vault = createVault({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    });
    expect(() => vault.save({ kind: "apiKey", value: "sk-test" })).toThrow();
    expect(vault.configured()).toBe(false);
  });
});
