import { Mark } from "../components/mark";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HowContent, Modal, PrivacyContent } from "../components/modal";
import { SignInDialog } from "../components/sign-in-dialog";
import { validateQuery } from "../lib/operators";
import "../styles/tokens.css";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"none" | "privacy" | "how" | "signin">("none");
  const validation = validateQuery(query);
  const canSubmit = validation.ok;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    void navigate({ to: "/search", search: { q: query } });
  }

  return (
    <main className="page">
      <header className="topbar">
        <button type="button" className="signin" onClick={() => setDialog("signin")}>
          Sign in
        </button>
      </header>

      <section className="hero">
        <div className="brand">
          <h1 className="wordmark">
            <span className="wordmark-deep">Deep</span>
            <span className="wordmark-search">Search</span>
          </h1>
          <p className="value-prop">
            Ranked web results with source metadata — powered by the Search API after you sign in.
          </p>
        </div>

        <form className="prompt" onSubmit={submit} role="search">
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
          <button type="submit" className="cta" disabled={!canSubmit}><span className="cta-mark"><Mark size={14} /></span>DeepSearch</button>
        </form>
        {validation.ok ? null : (
          <p className="prompt-hint" role="status">
            {validation.reason === "empty" ? "Type a query to search." : "Queries are limited to 128 characters."}
          </p>
        )}
      </section>

      <footer className="footer">
        <p className="footer-disclaimer">
          <span>Not affiliated with DeepSeek.</span>
          <span className="disclaimer-detail"> DeepSearch is an independent client for the DeepSeek API.</span>
        </p>
        <button type="button" className="footer-link" onClick={() => setDialog("privacy")}>
          Privacy
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" className="footer-link" onClick={() => setDialog("how")}>
          How DeepSearch Works
        </button>
        <span aria-hidden="true">·</span>
        <a
          className="footer-link footer-link-external"
          href="https://github.com/try-works/deepsearch"
          target="_blank"
          rel="noreferrer noopener"
        >
          GitHub
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M14 4h6v6M20 4l-8 8M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </a>
      </footer>

      {dialog === "privacy" ? (
        <Modal title="Privacy" width={480} onClose={() => setDialog("none")}>
          <PrivacyContent />
        </Modal>
      ) : null}

      {dialog === "signin" ? (
        <SignInDialog onCancel={() => setDialog("none")} onSignedIn={() => setDialog("none")} />
      ) : null}

      {dialog === "how" ? (
        <Modal title="How DeepSearch Works" width={520} onClose={() => setDialog("none")}>
          <HowContent />
        </Modal>
      ) : null}
    </main>
  );
}
