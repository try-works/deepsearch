import type { ReactNode } from "react";

interface Props {
  readonly title: string;
  /** Spec widths: 440 for sign-in/account, 480 for Privacy, 520 for How. */
  readonly width: 440 | 480 | 520;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** Spec 03/04/05 footers differ, so the default Done can be replaced. */
  readonly footer?: ReactNode;
}

/**
 * The one modal shell every spec'd dialog uses: a 40% ink scrim, a white panel,
 * a header with a close control, the body, and a Done footer.
 */
export function Modal({ title, width, onClose, children, footer }: Props) {
  return (
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <section
        className="modal"
        style={{ maxWidth: `${String(width)}px` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="modal-title" className="modal-title">
            {title}
          </h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        <footer className="modal-footer">
          {footer ?? (
            <button type="button" className="cta" onClick={onClose}>
              Done
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

/** Spec 08 · Privacy: lead plus three numbered points. */
export function PrivacyContent() {
  return (
    <>
      <p className="modal-lead">
        DeepSearch is a local client. Your credentials stay on this device — they are never sent to a
        DeepSearch cloud server.
      </p>
      <ol className="modal-points">
        <li>
          API keys and OAuth tokens are stored only in this browser. Nothing syncs them anywhere else.
        </li>
        <li>
          Search goes straight to the DeepSeek Search API with your own credential — there is no DeepSearch
          proxy holding a key on your behalf.
        </li>
        <li>
          Queries and results are not stored on a server. They live in this tab and disappear with it.
        </li>
      </ol>
      <p className="modal-note">
        One exception is stated in full on the Privacy page: during account sign-in the Worker holds the
        token for a single request, because DeepSeek will not accept a hosted redirect.
      </p>
      <p className="modal-note disclaimer">
        DeepSearch is an independent project. It is not affiliated with, endorsed by, or sponsored by
        DeepSeek in any way. DeepSeek and the DeepSeek marks belong to their owner; they appear here only
        to describe which API this client talks to.
      </p>
    </>
  );
}

/** Spec 09 · How DeepSearch Works: lead plus three numbered points. */
export function HowContent() {
  return (
    <>
      <p className="modal-lead">
        A thin UI over the DeepSeek Search API. Auth, search, and operators stay close to the native API
        surface.
      </p>
      <ol className="modal-points">
        <li>
          Every search is one <code>POST /v1/tools/search</code> with your account token or Platform API
          key, sent from this browser.
        </li>
        <li>
          The native operators — <code>site:</code>, <code>-site:</code>, <code>after:</code>,{" "}
          <code>before:</code>, <code>lang:</code>, quotes — are chips on Results. They are query syntax,
          not separate parameters.
        </li>
        <li>
          Credentials stay local. Only the Search API ever receives an authenticated request.
        </li>
      </ol>
    </>
  );
}
