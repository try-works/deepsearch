/**
 * Search operator syntax for the DeepSeek Search API.
 *
 * Operators are query text only (R5): they are appended to the query string and
 * never become request parameters. The API bounds the query at 128 characters.
 */

/** One operator the UI can offer, with the hint shown in the help dialog. */
export interface OperatorDefinition {
  readonly token: string;
  readonly hint: string;
}

export const QUERY_MAX_LENGTH = 128;

export const OPERATORS: readonly OperatorDefinition[] = [
  { token: "site:", hint: "Only results from this domain" },
  { token: "-site:", hint: "Exclude this domain" },
  { token: "after:", hint: "Published after this date" },
  { token: "before:", hint: "Published before this date" },
  { token: "lang:", hint: "Language code, for example en" },
  { token: "\"", hint: "Match this exact phrase: put the phrase in quotes" },
  { token: "-", hint: "Exclude results that contain the following word" },
  { token: "-\"", hint: "Exclude this exact phrase" },
];

export type QueryProblem = "empty" | "too_long";

export type QueryValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: QueryProblem };

/** Validate before any request is issued: 1–128 characters, not all whitespace. */
export function validateQuery(query: string): QueryValidation {
  if (query.trim().length === 0) return { ok: false, reason: "empty" };
  if (query.length > QUERY_MAX_LENGTH) return { ok: false, reason: "too_long" };
  return { ok: true };
}

/**
 * Append an operator to the query, keeping exactly one separating space.
 * An operator the query already starts with is not appended twice.
 */
export function insertOperator(query: string, token: string): string {
  if (query.startsWith(token)) return query;
  const trimmed = query.replace(/\s+$/, "");
  if (trimmed.length === 0) return token;
  return `${trimmed} ${token}`;
}
