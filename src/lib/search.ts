/**
 * The Search API contract, decoded at the boundary (R1, R4).
 *
 * The request body is fixed: 50 results, no page content, operators carried as
 * query text. The response body is parsed and then decoded with Schema before
 * any field is read; a malformed payload fails closed with a tagged error.
 */
import { Effect, Schema } from "effect";
import { ProtocolError } from "./errors";

export const SEARCH_COUNT = 50;

/** The exact body `POST /v1/tools/search` receives. */
export interface SearchBody {
  readonly query: string;
  readonly count: number;
  readonly need_content: boolean;
}

export function searchBody(query: string): SearchBody {
  return { query: query.trim(), count: SEARCH_COUNT, need_content: false };
}

export { ProtocolError };

const WireResult = Schema.Struct({
  rerank_score: Schema.Number,
  title: Schema.String,
  url: Schema.String,
  snippet: Schema.String,
  summary: Schema.String,
  content: Schema.String,
  site_name: Schema.NullOr(Schema.String),
  site_icon: Schema.NullOr(Schema.String),
  date: Schema.NullOr(Schema.String),
  authority: Schema.Number,
});

const WireResponse = Schema.Struct({ results: Schema.Array(WireResult) });

/** One result, in the shape the UI renders. */
export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly summary: string;
  readonly siteName: string | null;
  readonly siteIcon: string | null;
  readonly date: string | null;
  readonly authority: number;
  readonly rerankScore: number;
}

function toResult(wire: typeof WireResult.Type): SearchResult {
  return {
    title: wire.title,
    url: wire.url,
    snippet: wire.snippet,
    summary: wire.summary,
    siteName: wire.site_name,
    siteIcon: wire.site_icon,
    date: wire.date,
    authority: wire.authority,
    rerankScore: wire.rerank_score,
  };
}

/**
 * Decode a search response body. Takes the raw text, so JSON parsing and schema
 * validation both live at the boundary rather than leaking a parsed object
 * around the app.
 */
export function decodeSearchResults(rawBody: string): Effect.Effect<readonly SearchResult[], ProtocolError> {
  return Effect.suspend(() => {
    let value: unknown;
    try {
      value = JSON.parse(rawBody);
    } catch {
      return Effect.fail(new ProtocolError({ message: "search response was not JSON" }));
    }
    return Schema.decodeUnknownEffect(WireResponse)(value).pipe(
      Effect.map((wire) => wire.results.map(toResult)),
      Effect.mapError(() => new ProtocolError({ message: "search response did not match the API contract" })),
    );
  });
}
