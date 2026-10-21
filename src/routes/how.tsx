import { createFileRoute } from "@tanstack/react-router";
import "../styles/tokens.css";

export const Route = createFileRoute("/how")({
  component: HowItWorks,
});

function HowItWorks() {
  return (
    <main className="page">
      <header className="topbar">
        <a className="brand-inline" href="/">
          <span className="wordmark-inline">
            <span className="wordmark-deep">Deep</span>
            <span className="wordmark-search">Search</span>
          </span>
        </a>
        <a className="signin" href="/account">
          Account
        </a>
      </header>

      <article className="prose">
        <h1>How DeepSearch works</h1>

        <h2>One request, fifty results</h2>
        <p>
          A search sends your query to the DeepSeek Search API and asks for fifty results in a single call. The
          API has no paging parameter, so the page shows one batch rather than pretending to paginate.
        </p>
        <p>
          Nothing on this site sits between your browser and that request. There is no search proxy, which is why
          the page can honestly say it never sees your queries.
        </p>

        <h2>Reading a result</h2>
        <p>
          Each card carries the source site, a relevance score, and an authority tier. The score is DeepSeek's
          reranking signal, where 1.5 and above is considered high quality. The authority tier runs from 0 to 4,
          with 3 and above highly authoritative, and −1 when the source is unknown.
        </p>
        <p>
          Dates are shown in full, or as &ldquo;date unknown&rdquo; when the source publishes none. Nothing is
          inferred to fill a gap.
        </p>

        <h2>Operators</h2>
        <p>
          The operator buttons insert syntax into the query itself — <code>site:</code>, <code>-site:</code>,
          <code>after:</code>, <code>before:</code>, <code>lang:</code>. They are never sent as separate
          parameters, because the API does not accept any.
        </p>

        <h2>Asking a question</h2>
        <p>
          Ask runs the same search first, then generates an answer grounded in those results. Every claim is
          attributed to a result on the page, and an empty result set produces no answer at all rather than
          unsupported prose.
        </p>

        <h2>Independence</h2>
        <p>
          DeepSearch is an independent project. It is not affiliated with, endorsed by, or sponsored by DeepSeek
          in any way. DeepSeek and the DeepSeek marks belong to their owner; the name appears here only to say
          which API this client talks to.
        </p>      </article>
    </main>
  );
}
