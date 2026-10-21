/**
 * The Ask surface's pure logic (R6).
 *
 * The answer is allowed to exist only when it cites retrieved results, so the
 * citation rules live here rather than in the component: a claim without a
 * marker, or a marker pointing past the result set, does not count.
 */
import type { SearchResult } from "./search";

export const CHAT_PATH = "/v1/chat/completions";
export const ASK_MODEL = "deepseek-chat";

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/** One completed exchange in the thread, held only in the browser. */
export interface Turn {
  readonly question: string;
  readonly answer: string;
}

/**
 * How many prior turns travel with a follow-up. The numbered source block is
 * always sent in full; only the conversation ages out, oldest first.
 */
export const MAX_CONTEXT_TURNS = 8;

export interface AskRequest {
  readonly model: string;
  readonly stream: true;
  readonly temperature: number;
  readonly messages: readonly ChatMessage[];
}

function systemPrompt(sourceCount: number): string {
  return [
    "You answer using only the numbered sources provided.",
    "Cite every claim with the source's number in square brackets, for example [1].",
    `There are exactly ${String(sourceCount)} sources, numbered 1 to ${String(sourceCount)}: never cite a number outside that range.`,
    "If the sources do not support a claim, say so instead of answering.",
    "If there are no sources, reply exactly: no sources.",
    "Write plain text. Do not use markdown emphasis, headings or bullet markers.",
  ].join(" ");
}

export interface DraftedTurn {
  readonly question: string;
  readonly answer: string;
  /** False when the answer cited nothing valid; it is shown but flagged. */
  readonly grounded: boolean;
}

/**
 * What to do with a finished answer. An ungrounded answer is kept and flagged
 * rather than thrown away: dropping it mid-thread looks like the app lost the
 * user's question, and the reader can still judge the text with the warning.
 */
export function draftTurn(question: string, answer: string, sourceCount: number): DraftedTurn {
  return { question, answer, grounded: answerIsGrounded(answer, sourceCount) };
}

/** The numbered source block. Identical on every turn, so [n] never shifts. */
export function sourcesBlock(results: readonly SearchResult[]): string {
  const lines = results.map((result, index) => {
    const marker = index + 1;
    const site = result.siteName === null ? "unknown source" : result.siteName;
    return `[${String(marker)}] ${result.title} — ${site} — ${result.url}\n${result.summary.length > 0 ? result.summary : result.snippet}`;
  });
  return `Sources:\n${lines.join("\n\n")}`;
}

export interface TrimmedTurns {
  readonly kept: readonly Turn[];
  readonly dropped: number;
}

/** Keep the newest turns, reporting how many fell out of the window. */
export function trimTurns(turns: readonly Turn[]): TrimmedTurns {
  if (turns.length <= MAX_CONTEXT_TURNS) return { kept: turns, dropped: 0 };
  const dropped = turns.length - MAX_CONTEXT_TURNS;
  return { kept: turns.slice(dropped), dropped };
}

/**
 * The chat request for one turn in the thread. The API is stateless, so the whole
 * conversation is assembled here: system prompt + fixed sources, then the prior
 * turns as user/assistant pairs, then the new question.
 */
export interface ThreadRequest {
  readonly request: AskRequest;
  readonly dropped: number;
}

export function buildThreadRequest(
  sources: readonly SearchResult[],
  history: readonly Turn[],
  question: string,
): ThreadRequest {
  const { kept, dropped } = trimTurns(history);
  const messages: ChatMessage[] = [
    { role: "system", content: `${systemPrompt(sources.length)}\n\n${sourcesBlock(sources)}` },
  ];
  for (const turn of kept) {
    messages.push({ role: "user", content: turn.question });
    messages.push({ role: "assistant", content: turn.answer });
  }
  messages.push({ role: "user", content: question });
  return {
    request: { model: ASK_MODEL, stream: true, temperature: 0.2, messages },
    dropped,
  };
}

/** The first question of a thread: the same assembly with no history. */
export function buildAskRequest(query: string, results: readonly SearchResult[]): AskRequest {
  return buildThreadRequest(results, [], query).request;
}

/** Citation markers present in the answer, deduplicated and in reading order. */
export function parseCitations(answer: string): readonly number[] {
  const found: number[] = [];
  const pattern = /\[(\d+)\]/g;
  let match: RegExpExecArray | null = pattern.exec(answer);
  while (match !== null) {
    const marker = Number(match[1]);
    if (Number.isInteger(marker) && marker > 0 && !found.includes(marker)) found.push(marker);
    match = pattern.exec(answer);
  }
  return found;
}

/** An answer counts only if at least one citation points at a real result. */
export function answerIsGrounded(answer: string, resultCount: number): boolean {
  return parseCitations(answer).some((marker) => marker <= resultCount);
}

export interface CitedSource {
  readonly marker: number;
  readonly result: SearchResult;
}

/** The sources the answer actually cited, in citation order. */
export function sourcesFor(results: readonly SearchResult[], citations: readonly number[]): readonly CitedSource[] {
  const cited: CitedSource[] = [];
  for (const marker of citations) {
    const result = results[marker - 1];
    if (result === undefined) continue;
    cited.push({ marker, result });
  }
  return cited;
}

/**
 * The turns that may travel as context. An answer that failed the grounding check
 * is shown to the reader but must not be fed back as if it were supported, or one
 * unsourced reply would seed every later turn.
 */
export function groundedTurns(turns: readonly DraftedTurn[]): readonly Turn[] {
  return turns.filter((turn) => turn.grounded).map((turn) => ({ question: turn.question, answer: turn.answer }));
}