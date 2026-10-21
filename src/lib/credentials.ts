/**
 * The credential vault — the only module in the app that touches storage (R2).
 *
 * The secret is written once and read back only as an auth header. No caller
 * can ask this module for the raw value, which is what makes the write-only
 * contract in the UI enforceable rather than a convention.
 */
import { Schema } from "effect";

export type CredentialKind = "apiKey" | "accountToken";

export interface CredentialInput {
  readonly kind: CredentialKind;
  readonly value: string;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CredentialVault {
  /** True when a usable credential is stored. */
  configured(): boolean;
  /** The stored credential's kind, or null when unconfigured. */
  kind(): CredentialKind | null;
  /** The header a request needs, or null when unconfigured. */
  authHeaders(): Readonly<Record<string, string>> | null;
  /** Write-only: the value is never returned to the caller. */
  save(input: CredentialInput): void;
  clear(): void;
}

/** The single storage key the app writes. Exported for the custody test. */
export const STORAGE_KEY = "deepsearch.credential.v1";

/** The persisted payload, validated on read rather than trusted. */
const Persisted = Schema.Struct({
  v: Schema.Literal(1),
  kind: Schema.Union([Schema.Literal("apiKey"), Schema.Literal("accountToken")]),
  value: Schema.String,
});

type PersistedCredential = typeof Persisted.Type;

/** Read the stored credential, treating any malformed payload as absent. */
function read(storage: KeyValueStorage): PersistedCredential | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  try {
    // SAFETY: decodeUnknownSync throws on any mismatch, caught below; the
    // assertion only restores the schema's type, which the decoder enforces.
    const decoded = Schema.decodeUnknownSync(Persisted)(value) as PersistedCredential;
    return decoded.value.length === 0 ? null : decoded;
  } catch {
    return null;
  }
}

/** Build a vault over any storage implementation (tests pass a memory store). */
export function createVault(storage: KeyValueStorage): CredentialVault {
  return {
    configured: () => read(storage) !== null,
    kind: () => read(storage)?.kind ?? null,
    authHeaders: () => {
      const credential = read(storage);
      if (credential === null) return null;
      return credential.kind === "apiKey"
        ? { Authorization: `Bearer ${credential.value}` }
        : { "x-dsh-auth-token": credential.value };
    },
    save: ({ kind, value }) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) throw new Error("credential value must not be empty");
      const payload: PersistedCredential = { v: 1, kind, value: trimmed };
      storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    },
    clear: () => storage.removeItem(STORAGE_KEY),
  };
}

let cached: CredentialVault | null = null;

/**
 * The browser vault. Constructed lazily so importing this module during SSR
 * never touches `window`.
 */
export function browserVault(): CredentialVault {
  if (cached !== null) return cached;
  const storage = globalThis.localStorage;
  if (storage === undefined) throw new Error("credential storage is unavailable outside the browser");
  cached = createVault(storage);
  return cached;
}
