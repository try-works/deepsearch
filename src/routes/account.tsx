import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ApiKeyDialog } from "../components/api-key-dialog";
import { SignInDialog } from "../components/sign-in-dialog";
import { browserVault } from "../lib/credentials";
import "../styles/tokens.css";

interface CredentialState {
  readonly configured: boolean;
  readonly kind: string | null;
}

export const Route = createFileRoute("/account")({
  component: Account,
});

function readState(): CredentialState {
  try {
    const vault = browserVault();
    return { configured: vault.configured(), kind: vault.kind() };
  } catch {
    return { configured: false, kind: null };
  }
}

function Account() {
  const [state, setState] = useState<CredentialState>({ configured: false, kind: null });
  const [dialog, setDialog] = useState<"none" | "signin" | "key">("none");

  useEffect(() => {
    setState(readState());
  }, []);

  const refresh = () => setState(readState());

  function signOut() {
    try {
      browserVault().clear();
    } finally {
      refresh();
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <a className="brand-inline" href="/">
          <span className="wordmark-inline">
            <span className="wordmark-deep">Deep</span>
            <span className="wordmark-search">Search</span>
          </span>
        </a>
        <a className="signin" href="/search?q=">
          Search
        </a>
      </header>

      <section className="account">
        <h1 className="account-title">Account</h1>

        <div className="account-row">
          <div>
            <p className="account-label">Credential</p>
            <p className="account-value">
              {state.configured
                ? state.kind === "accountToken"
                  ? "Signed in with a DeepSeek account"
                  : "API key configured"
                : "No credential configured"}
            </p>
          </div>
          <div className="account-actions">
            {state.configured ? (
              <button type="button" className="dialog-secondary" onClick={signOut}>
                Sign out
              </button>
            ) : (
              <>
                <button type="button" className="cta" onClick={() => setDialog("signin")}>
                  Sign in with DeepSeek
                </button>
                <button type="button" className="dialog-secondary" onClick={() => setDialog("key")}>
                  Add API key
                </button>
              </>
            )}
          </div>
        </div>

        <p className="account-note">
          A credential is stored only in this browser. DeepSearch never sends it to its own servers; searches go
          straight from this tab to DeepSeek.
        </p>
      </section>

      {dialog === "key" ? (
        <ApiKeyDialog
          onCancel={() => setDialog("none")}
          onSaved={() => {
            setDialog("none");
            refresh();
          }}
        />
      ) : null}

      {dialog === "signin" ? (
        <SignInDialog
          onCancel={() => setDialog("none")}
          onSignedIn={() => {
            setDialog("none");
            refresh();
          }}
        />
      ) : null}
    </main>
  );
}
