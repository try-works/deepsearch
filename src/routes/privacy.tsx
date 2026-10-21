import { createFileRoute } from "@tanstack/react-router";
import "../styles/tokens.css";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
});

function Privacy() {
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
        <h1>Privacy</h1>

        <h2>Where your credential lives</h2>
        <p>
          A DeepSeek API key you paste is stored in this browser only. It is sent to
          <code> api.deepseek.com</code> and to nowhere else — not to this site, not to its Worker, not to any
          analytics service.
        </p>
        <p>
          A DeepSeek account sign-in produces a token that is also stored only in this browser. One exception is
          stated plainly below because it is a real transfer, not a technicality.
        </p>

        <h2>The one time a token touches our server</h2>
        <p>
          Account sign-in is handled by our Worker rather than by the browser, because DeepSeek's authorization
          endpoints do not accept cross-origin browser calls. During the exchange the Worker holds the token for
          the duration of a single request, hands it to your browser, and retains nothing: no database, no log,
          no cache. After that request the Worker cannot recover it.
        </p>
        <p>
          When DeepSeek allows a hosted redirect for this site, the exchange will move into the browser and even
          that transit will disappear.
        </p>

        <h2>What we do not do</h2>
        <p>
          We do not proxy searches, so we never see your queries or results. We do not record query text, and
          there is no account on our side to record it against.
        </p>

        <h2>Third-party content</h2>
        <p>
          Search results come from DeepSeek's index. Titles, snippets, and summaries are third-party text, shown
          as text and never interpreted as markup.
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
