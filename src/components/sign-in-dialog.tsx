import { Effect, Schema } from "effect";
import { useEffect, useState } from "react";
import { browserVault } from "../lib/credentials";
import { errorCopy } from "../lib/search-view";
import { signInClient } from "../lib/sign-in-client";
import { ApiKeyDialog } from "./api-key-dialog";
import { Modal } from "./modal";

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "waiting"; readonly mode: "loopback" | "hosted"; readonly authorizeUrl: string }
  | { readonly kind: "keys" }
  | { readonly kind: "error"; readonly tag: string };

const Handoff = Schema.Struct({
  type: Schema.Literal("deepsearch:account"),
  token: Schema.String,
});

interface Props {
  readonly onSignedIn: () => void;
  readonly onCancel: () => void;
}

/** The whale appears here and nowhere else, per Spec 03. */
function WhaleMark() {
  return (
    <span className="whale" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 14c2.5 0 3.5-2 5-2s2 1.5 4 1.5S15 11 17 11s3 1 4 3c-1 3.5-4.5 6-9 6-4.5 0-8-2.5-9-6Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M17 11c0-2 1-3.5 3-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/**
 * Specs 03 and 04: the sign-in surface. Get started offers the account route or
 * a local API key; Waiting tracks the browser hand-off, and in hosted mode it
 * accepts the pasted redirect the Platform sends to a loopback address.
 */
export function SignInDialog({ onSignedIn, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [address, setAddress] = useState("");

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      try {
        // SAFETY: decodeUnknownSync rejects anything that is not the exact
        // handoff message; the assertion only restores the schema's own type.
        const message = Schema.decodeUnknownSync(Handoff)(event.data) as { token: string };
        browserVault().save({ kind: "accountToken", value: message.token });
        onSignedIn();
      } catch {
        // Not a handoff message; ignore it rather than failing the dialog.
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onSignedIn]);

  function begin() {
    void Effect.runPromise(
      Effect.match(signInClient().start(), {
        onSuccess: (started) => {
          window.open(started.authorizeUrl, "deepseek-signin", "width=520,height=680");
          setPhase({ kind: "waiting", mode: started.mode, authorizeUrl: started.authorizeUrl });
        },
        onFailure: (error) => setPhase({ kind: "error", tag: error._tag }),
      }),
    );
  }

  function finish() {
    void Effect.runPromise(
      Effect.match(signInClient().complete(address.trim()), {
        onSuccess: (done) => {
          browserVault().save({ kind: "accountToken", value: done.token });
          onSignedIn();
        },
        onFailure: (error) => setPhase({ kind: "error", tag: error._tag }),
      }),
    );
  }

  function cancel() {
    void Effect.runPromise(Effect.ignore(signInClient().cancel()));
    onCancel();
  }

  if (phase.kind === "keys") {
    return (
      <ApiKeyDialog
        onCancel={() => setPhase({ kind: "idle" })}
        onSaved={() => {
          onSignedIn();
        }}
      />
    );
  }

  if (phase.kind === "waiting") {
    return (
      <Modal
        title="Waiting for sign in"
        width={440}
        onClose={cancel}
        footer={
          <>
            <button type="button" className="dialog-secondary" onClick={cancel}>
              Cancel
            </button>
            <button type="button" className="cta" disabled>
              Waiting
            </button>
          </>
        }
      >
        <div className="status-row">
          <span className="live-dot live-dot-on" aria-hidden="true" />
          <span className="status-row-text">Continue in your browser</span>
        </div>

        {phase.mode === "hosted" ? (
          <>
            <p className="modal-lead">
              <strong>This step is expected.</strong> After you approve, DeepSeek sends the tab to a local
              address that only works on a developer machine, so it shows &ldquo;refused to connect&rdquo;. The
              sign-in is still valid.
            </p>
            <ol className="dialog-steps">
              <li>
                Copy the <strong>whole address</strong> from that tab, starting with{" "}
                <code>http://127.0.0.1</code>.
              </li>
              <li>Paste it below, then choose Finish sign in.</li>
            </ol>
            <label className="dialog-label" htmlFor="callback-address">
              Redirect address
            </label>
            <input
              id="callback-address"
              className="dialog-input"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="http://127.0.0.1:18765/oauth/callback?code=…"
              autoFocus
            />
            <p className="modal-note">The attempt expires after a few minutes. If it is rejected, start again.</p>
            <div className="modal-inline-actions">
              <button
                type="button"
                className="dialog-secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(phase.authorizeUrl);
                }}
              >
                Copy sign-in link
              </button>
              <button type="button" className="cta" onClick={finish} disabled={address.trim().length === 0}>
                Finish sign in
              </button>
            </div>
          </>
        ) : (
          <p className="modal-lead">
            Complete sign in in the DeepSeek window. This dialog closes itself when done.
          </p>
        )}
      </Modal>
    );
  }

  if (phase.kind === "error") {
    return (
      <Modal
        title="Sign in"
        width={440}
        onClose={onCancel}
        footer={
          <>
            <button type="button" className="dialog-secondary" onClick={onCancel}>
              Close
            </button>
            <button type="button" className="cta" onClick={begin}>
              Retry
            </button>
          </>
        }
      >
        <p className="dialog-error" role="alert">
          {errorCopy(phase.tag)}
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Get started"
      width={440}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="dialog-secondary" onClick={() => setPhase({ kind: "keys" })}>
            Add API Key
          </button>
          <button type="button" className="cta" onClick={begin}>
            Sign in
          </button>
        </>
      }
    >
      <p className="modal-lead">
        Sign in with a DeepSeek account, or add an API Key. DeepSearch is independent — credentials are stored
        locally.
      </p>
      <button type="button" className="oauth-row" onClick={begin}>
        <WhaleMark />
        <span className="oauth-row-text">
          <span className="oauth-row-label">OAuth</span>
          <span className="oauth-row-value">DeepSeek account</span>
        </span>
        <span className="oauth-row-arrow" aria-hidden="true">
          →
        </span>
      </button>
    </Modal>
  );
}
