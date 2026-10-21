/**
 * The browser-direct Search API call (R1) with one tagged error per outcome (R11).
 *
 * The transport is a seam: production passes `fetch`, tests pass a stub, and the
 * credential's header is supplied by the vault rather than read here.
 */
import { Effect } from "effect";
import { CredentialMissing, RateLimited, TransportError, Unauthorized, type SearchError } from "./errors";
import { decodeSearchResults, searchBody, type SearchResult } from "./search";

export const API_ORIGIN = "https://api.deepseek.com";
export const SEARCH_PATH = "/v1/tools/search";

export interface TransportResult {
  readonly status: number;
  readonly text: string;
}

export interface TransportRequest {
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** The seam every network call goes through. */
export interface SearchTransport {
  execute(url: string, request: TransportRequest): Promise<TransportResult>;
}

export interface SearchInput {
  readonly query: string;
  /** From the credential vault; null when nothing is configured. */
  readonly headers: Readonly<Record<string, string>> | null;
}

/** Issue one search and map every outcome to its tagged error. */
export function searchWith(
  transport: SearchTransport,
  input: SearchInput,
): Effect.Effect<readonly SearchResult[], SearchError> {
  return Effect.gen(function* () {
    if (input.headers === null) {
      return yield* new CredentialMissing({ message: "no credential is configured" });
    }
    const body = searchBody(input.query);
    const response = yield* Effect.tryPromise({
      try: () =>
        transport.execute(`${API_ORIGIN}${SEARCH_PATH}`, {
          method: "POST",
          headers: { "content-type": "application/json", ...input.headers },
          body: JSON.stringify(body),
        }),
      catch: () => new TransportError({ message: "the search request could not be sent" }),
    });

    if (response.status === 401) {
      return yield* new Unauthorized({ message: "the credential was rejected", status: 401 });
    }
    if (response.status === 429) {
      return yield* new RateLimited({ message: "too many searches; wait a moment" });
    }
    if (response.status < 200 || response.status >= 300) {
      return yield* new TransportError({ message: `unexpected status ${response.status}` });
    }
    return yield* decodeSearchResults(response.text);
  });
}

/** The live transport. `fetch` is injectable so a Worker or test can swap it. */
export function fetchTransport(implementation: typeof fetch = fetch): SearchTransport {
  return {
    execute: (url, request) =>
      implementation(url, request).then((response) =>
        response.text().then((text) => ({ status: response.status, text })),
      ),
  };
}
