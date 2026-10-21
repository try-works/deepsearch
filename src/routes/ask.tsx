import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import { AnswerText } from "../components/answer-text";
import { OperatorHelp } from "../components/operator-help";
import { Mark } from "../components/mark";
import {
  answerIsGrounded,
  buildThreadRequest,
  CHAT_PATH,
  draftTurn,
  type DraftedTurn,
  groundedTurns,
  parseCitations,
  sourcesFor,
  type Turn,
} from "../lib/ask";
import { browserVault } from "../lib/credentials";
import { API_ORIGIN, fetchTransport, searchWith } from "../lib/deepseek";
import { insertOperator, OPERATORS, validateQuery } from "../lib/operators";
import type { SearchResult } from "../lib/search";
import { errorCopy } from "../lib/search-view";
import "../styles/tokens.css";

interface AskParams {
  q: string | undefined;
}

const AskParamsSchema = Schema.Struct({ q: Schema.Union([Schema.String, Schema.Undefined]) });

type Phase =
  | { readonly kind: "searching" }
  | { readonly kind: "idle" }
  | { readonly kind: "streaming"; readonly question: string; readonly answer: string }
  | { readonly kind: "empty" }
  | { readonly kind: "error"; readonly tag: string };

export const Route = createFileRoute("/ask")({
  validateSearch: (search: { q?: unknown }): AskParams => {
    try {
      return Schema.decodeUnknownSync(AskParamsSchema)(search);
    } catch {
      return { q: undefined };
    }
  },
  component: Ask,
});

function readHeaders(): Readonly<Record<string, string>> | null {
  try {
    return browserVault().authHeaders();
  } catch {
    return null;
  }
}

/** Read an SSE body and hand each text delta to the caller. */
async function streamAnswer(body: ReadableStream<Uint8Array>, onDelta: (delta: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        // SAFETY: provider-shaped SSE chunk; optional access tolerates a missing
        // delta, and anything malformed is dropped rather than trusted.
        const chunk = JSON.parse(payload) as { choices?: readonly { delta?: { content?: string } }[] };
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta !== undefined) onDelta(delta);
      } catch {
        // Keep-alive or a non-JSON frame; ignore it.
      }
    }
  }
}

function Ask() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const [query, setQuery] = useState(q ?? "");
  const [followUp, setFollowUp] = useState("");
  const [sources, setSources] = useState<readonly SearchResult[]>([]);
  const [turns, setTurns] = useState<readonly DraftedTurn[]>([]);
  const [dropped, setDropped] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "searching" });
  const [showHelp, setShowHelp] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const validation = validateQuery(query);
  const busy = phase.kind === "searching" || phase.kind === "streaming";
  // Each ask gets a token; a superseded stream can no longer write state.
  const requestToken = useRef(0);

  /**
   * One turn: assemble the conversation from the fixed sources plus the turns so
   * far, stream the answer, then keep it in the tab's state. Nothing leaves this
   * browser except the request to the DeepSeek API.
   */
  async function ask(question: string, history: readonly Turn[], searchResults: readonly SearchResult[]) {
    const headers = readHeaders();
    const built = buildThreadRequest(searchResults, history, question);
    const token = requestToken.current + 1;
    requestToken.current = token;
    setDropped(built.dropped);
    setPhase({ kind: "streaming", question, answer: "" });

    const response = await fetch(`${API_ORIGIN}${CHAT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(headers ?? {}) },
      body: JSON.stringify(built.request),
    });
    if (requestToken.current !== token) return;
    if (!response.ok || response.body === null) {
      setPhase({ kind: "error", tag: "Transport" });
      return;
    }

    let answer = "";
    await streamAnswer(response.body, (delta) => {
      answer += delta;
      if (requestToken.current !== token) return;
      setPhase({ kind: "streaming", question, answer });
    });
    if (requestToken.current !== token) return;

    if (answer.trim().length === 0) {
      setPhase({ kind: "error", tag: "ProtocolError" });
      return;
    }
    // An ungrounded answer is kept and flagged, never silently dropped: losing it
    // mid-thread reads as the app having overwritten the question.
    const drafted = draftTurn(question, answer, searchResults.length);
    setTurns((previous) => [...previous, drafted]);
    setPhase({ kind: "idle" });
  }

  useEffect(() => {
    if (q === undefined || q.trim().length === 0) {
      setPhase({ kind: "empty" });
      return;
    }
    let active = true;

    const run = async () => {
      setTurns([]);
      setDropped(0);
      setPhase({ kind: "searching" });
      const headers = readHeaders();
      const found = await Effect.runPromise(
        Effect.match(searchWith(fetchTransport(), { query: q, headers }), {
          onSuccess: (results) => ({ ok: true as const, results }),
          onFailure: (error) => ({ ok: false as const, tag: error._tag }),
        }),
      );
      if (!active) return;
      if (!found.ok) {
        setPhase({ kind: "error", tag: found.tag });
        return;
      }
      if (found.results.length === 0) {
        setPhase({ kind: "empty" });
        return;
      }
      setSources(found.results);
      if (active) await ask(q, [], found.results);
    };

    void run();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function submitQuery(event: React.FormEvent) {
    event.preventDefault();
    if (!validation.ok) return;
    void navigate({ to: "/ask", search: { q: query } });
  }

  function submitFollowUp(event: React.FormEvent) {
    event.preventDefault();
    if (busy || followUp.trim().length === 0 || sources.length === 0) return;
    const question = followUp.trim();
    setFollowUp("");
    void ask(question, groundedTurns(turns), sources);
  }

  const primary = OPERATORS.slice(0, 5);
  const overflow = OPERATORS.slice(5);

  return (
    <main className="page">
      <header className="results-header">
        <a className="brand-inline" href="/">
          <span className="wordmark-inline">
            <span className="wordmark-deep">Deep</span>
            <span className="wordmark-search">Search</span>
          </span>
        </a>
        <form className="prompt prompt-compact" onSubmit={submitQuery} role="search">
          <label className="sr-only" htmlFor="q">
            Ask a question
          </label>
          <input
            id="q"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask the web"
            autoComplete="off"
            maxLength={128}
          />
          <button type="submit" className="cta" disabled={!validation.ok}>
            <span className="cta-mark">
              <Mark size={14} />
            </span>
            Ask
          </button>
        </form>
        <a className="signin" href="/account">
          Account
        </a>
      </header>

      <section className="operators">
        <div className="operators-label">
          <span className="mono-label">Operators</span>
          <span className="operators-hint">Append to the question</span>
        </div>
        <div className="chip-row">
          <button
            type="button"
            className="operator operator-help"
            aria-label="Operator help"
            onClick={() => setShowHelp(true)}
          >
            ?
          </button>
          {primary.map((operator) => (
            <button
              key={operator.token}
              type="button"
              className="operator"
              title={operator.hint}
              onClick={() => setQuery((current) => insertOperator(current, operator.token))}
            >
              {operator.token}
            </button>
          ))}
          {expanded
            ? overflow.map((operator) => (
                <button
                  key={operator.token}
                  type="button"
                  className="operator"
                  title={operator.hint}
                  onClick={() => setQuery((current) => insertOperator(current, operator.token))}
                >
                  {operator.token}
                </button>
              ))
            : null}
          <button
            type="button"
            className={expanded ? "operator operator-more is-active" : "operator operator-more"}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Less" : "More"}
          </button>
        </div>
      </section>

      <section className="results">
        {phase.kind === "searching" ? <p className="status-line">Searching, then answering…</p> : null}

        {phase.kind === "empty" ? (
          <div className="empty-state">
            <p>Nothing to answer from. Ask something the web can support.</p>
          </div>
        ) : null}

        {phase.kind === "error" ? (
          <div className="error-state" role="alert">
            <p>{errorCopy(phase.tag)}</p>
            <div className="error-actions">
              <a className="dialog-secondary" href={`/search?q=${encodeURIComponent(q ?? "")}`}>
                See sources instead
              </a>
            </div>
          </div>
        ) : null}

        {dropped > 0 ? (
          <p className="status-line">
            Earlier turns were omitted to stay inside the model&apos;s context window.
          </p>
        ) : null}

        {turns.map((turn, index) => {
          const cited = sourcesFor(sources, parseCitations(turn.answer));
          return (
            <article className="answer-turn" key={`${String(index)}-${turn.question}`}>
              <p className="answer-question">
                <span className="mono-label">You asked</span>
                <span className="answer-question-text">{turn.question}</span>
              </p>
              <div className="answer">
                <div className="answer-label">
                  <span className="mono-label answer-kicker">Answer {index + 1}</span>
                  <span className="answer-meta">
                    {turn.grounded ? `Grounded in ${String(sources.length)} results` : "Not grounded"}
                  </span>
                </div>
                <AnswerText text={turn.answer} />
                {turn.grounded ? null : (
                  <p className="answer-warning" role="status">
                    This answer cited no source from the list, so treat it as unsupported.
                  </p>
                )}
                {cited.length === 0 ? null : (
                  <div className="answer-sources">
                    <span className="mono-label">Sources</span>
                    {cited.map((entry) => (
                      <a
                        key={`${String(entry.marker)}-${entry.result.url}`}
                        className="source-chip"
                        href={entry.result.url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <span className="source-marker">[{entry.marker}]</span>
                        <span className="source-name">{entry.result.siteName ?? "unknown source"}</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M14 4h6v6M20 4l-8 8M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </article>
          );
        })}

        {phase.kind === "streaming" ? (
          <article className="answer-turn">
            <p className="answer-question">
              <span className="mono-label">You asked</span>
              <span className="answer-question-text">{phase.question}</span>
            </p>
            <div className="answer">
              <div className="answer-label">
                <span className="mono-label answer-kicker">Answer {turns.length + 1}</span>
                <span className="answer-meta">Grounding in retrieved results</span>
              </div>
              <AnswerText text={phase.answer} />
            </div>
          </article>
        ) : null}

        {sources.length > 0 ? (
          <form className="follow-up" onSubmit={submitFollowUp}>
            <label className="mono-label" htmlFor="follow-up">
              Ask a follow-up
            </label>
            <div className="follow-up-row">
              <input
                id="follow-up"
                className="follow-up-input"
                value={followUp}
                onChange={(event) => setFollowUp(event.target.value)}
                placeholder="Ask a follow-up…"
                autoComplete="off"
                maxLength={128}
              />
              <button type="submit" className="cta" disabled={busy || followUp.trim().length === 0}>
                Send
              </button>
            </div>
            <p className="modal-note">
              Follow-ups reuse the same retrieved sources, so every answer stays grounded in what you already
              see.
            </p>
          </form>
        ) : null}
      </section>

      {showHelp ? <OperatorHelp onClose={() => setShowHelp(false)} /> : null}
    </main>
  );
}
