import { Mark } from "../components/mark";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { useEffect, useState } from "react";
import { AccountDialog } from "../components/account-dialog";
import { SearchingState } from "../components/searching-state";
import { ApiKeyDialog } from "../components/api-key-dialog";
import { OperatorHelp } from "../components/operator-help";
import { ResultCard } from "../components/result-card";
import { browserVault } from "../lib/credentials";
import { fetchTransport, searchWith } from "../lib/deepseek";
import { insertOperator, OPERATORS, validateQuery } from "../lib/operators";
import { clampPage, PAGE_SIZE, pageCount, pageSlice } from "../lib/pagination";
import type { SearchResult } from "../lib/search";
import { errorCopy, loadingMeta, metaLine } from "../lib/search-view";
import "../styles/tokens.css";

interface SearchParams {
  q: string | undefined;
  /** Absent means page 1. validateSearch must not invent params: a parsed value
   *  the URL lacks makes TanStack Router redirect to add it (a 307 that forces a
   *  reload and an error flash between Home and Results). */
  page?: number;
}

const QuerySchema = Schema.Struct({
  q: Schema.Union([Schema.String, Schema.Undefined]),
});

type ViewState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly results: readonly SearchResult[] }
  | { readonly status: "error"; readonly tag: string };

export const Route = createFileRoute("/search")({
  validateSearch: (search: { q?: unknown; page?: unknown }): SearchParams => {
    let q: string | undefined;
    try {
      q = Schema.decodeUnknownSync(QuerySchema)({ q: search.q }).q;
    } catch {
      q = undefined;
    }
    let parsed: number | undefined;
    try {
      parsed = Schema.decodeUnknownSync(Schema.Number)(search.page);
    } catch {
      parsed = undefined;
    }
    return parsed === undefined || !Number.isFinite(parsed) ? { q } : { q, page: parsed };
  },
  component: Search,
});

/** Read the credential header without ever touching the secret itself. */
function readHeaders(): Readonly<Record<string, string>> | null {
  try {
    return browserVault().authHeaders();
  } catch {
    return null;
  }
}

function Search() {
  const params = Route.useSearch();
  const { q } = params;
  const page = params.page ?? 1;
  const navigate = useNavigate();
  const [query, setQuery] = useState(q ?? "");
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [showKey, setShowKey] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const validation = validateQuery(query);

  useEffect(() => {
    if (q === undefined || q.trim().length === 0) {
      // No query yet is not "no results": rendering the empty state here flashed
      // an error-looking message while navigating in from Home.
      setState({ status: "idle" });
      return;
    }
    let active = true;
    setState({ status: "loading" });
    const run = async () => {
      const outcome = await Effect.runPromise(
        Effect.match(searchWith(fetchTransport(), { query: q, headers: readHeaders() }), {
          onSuccess: (results) => ({ ok: true as const, results }),
          onFailure: (error) => ({ ok: false as const, tag: error._tag }),
        }),
      );
      if (!active) return;
      setState(outcome.ok ? { status: "ready", results: outcome.results } : { status: "error", tag: outcome.tag });
    };
    void run();
    return () => {
      active = false;
    };
  }, [q, attempt]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validation.ok) return;
    void navigate({ to: "/search", search: { q: query, page: 1 } });
  }

  function goToPage(next: number) {
    void navigate({ to: "/search", search: { q: q ?? "", page: next } });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const total = state.status === "ready" ? state.results.length : 0;
  const current = clampPage(total, page);
  const pages = pageCount(total);
  const visible = state.status === "ready" ? pageSlice(state.results, page) : [];
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
        <form className="prompt prompt-compact" onSubmit={submit} role="search">
          <label className="sr-only" htmlFor="q">
            Search the web
          </label>
          <input
            id="q"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the web"
            autoComplete="off"
            maxLength={128}
          />
          <button type="submit" className="cta" disabled={!validation.ok || state.status === "loading"}><span className="cta-mark"><Mark size={14} /></span>{state.status === "loading" ? "Searching…" : "DeepSearch"}</button>
        </form>
        <button type="button" className="signin" onClick={() => setShowAccount(true)}>
          Account
        </button>
      </header>

      <section className="operators">
        <div className="operators-label">
          <span className="mono-label">Operators</span>
          <span className="operators-hint">Append to the query</span>
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
              onClick={() => setQuery((value) => insertOperator(value, operator.token))}
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
                  onClick={() => setQuery((value) => insertOperator(value, operator.token))}
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
        <div className="meta-row">
          <p className="meta-line">{state.status === "loading" ? loadingMeta() : metaLine(total, page)}</p>
          {state.status === "ready" && state.results.length > 0 ? (
            <a className="operator operator-as-link" href={`/ask?q=${encodeURIComponent(q ?? "")}`}>
              Ask about this
            </a>
          ) : null}
        </div>

        {state.status === "loading" ? <SearchingState /> : null}

        {state.status === "error" ? (
          <div className="error-state" role="alert">
            <p>{errorCopy(state.tag)}</p>
            <div className="error-actions">
              {state.tag === "CredentialMissing" || state.tag === "Unauthorized" ? (
                <button type="button" className="cta" onClick={() => setShowKey(true)}>
                  Add API key
                </button>
              ) : null}
              <button type="button" className="dialog-secondary" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </button>
            </div>
          </div>
        ) : null}

        {state.status === "ready" && state.results.length === 0 ? (
          <div className="empty-state">
            <p>No results. Try a broader query, or remove an operator.</p>
          </div>
        ) : null}

        {visible.map((result, index) => (
          <ResultCard key={`${result.url}-${String(index)}`} result={result} index={(current - 1) * PAGE_SIZE + index} />
        ))}

        {total > PAGE_SIZE ? (
          <nav className="pagination" aria-label="Result pages">
            <button type="button" className="dialog-secondary" disabled={current === 1} onClick={() => goToPage(current - 1)}>
              Prev
            </button>
            {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
              <button
                key={number}
                type="button"
                className={number === current ? "operator operator-more is-active" : "operator"}
                aria-current={number === current ? "page" : undefined}
                onClick={() => goToPage(number)}
              >
                {number}
              </button>
            ))}
            <button
              type="button"
              className="dialog-secondary"
              disabled={current === pages}
              onClick={() => goToPage(current + 1)}
            >
              Next
            </button>
            <span className="pagination-note">
              {String(PAGE_SIZE)} per page · {String(total)} returned
            </span>
          </nav>
        ) : null}
      </section>

      {showHelp ? <OperatorHelp onClose={() => setShowHelp(false)} /> : null}

      {showAccount ? (
        <AccountDialog
          onClose={() => {
            setShowAccount(false);
            setAttempt((n) => n + 1);
          }}
          onManageKey={() => {
            setShowAccount(false);
            setShowKey(true);
          }}
        />
      ) : null}

      {showKey ? (
        <ApiKeyDialog
          onCancel={() => setShowKey(false)}
          onSaved={() => {
            setShowKey(false);
            setAttempt((n) => n + 1);
          }}
        />
      ) : null}
    </main>
  );
}
