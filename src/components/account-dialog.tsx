import { useEffect, useState } from "react";
import { browserVault } from "../lib/credentials";
import { Modal } from "./modal";

interface Props {
  readonly onClose: () => void;
  readonly onManageKey: () => void;
}

type Kind = "apiKey" | "accountToken" | null;

/**
 * Spec 06 · Account: credential status for Search, in a 440px dialog. It shows
 * which route is active and never reveals a stored secret.
 */
export function AccountDialog({ onClose, onManageKey }: Props) {
  const [kind, setKind] = useState<Kind>(null);

  useEffect(() => {
    try {
      setKind(browserVault().kind());
    } catch {
      setKind(null);
    }
  }, []);

  function signOut() {
    try {
      browserVault().clear();
    } catch {
      // Nothing stored is the same outcome as a successful clear.
    }
    onClose();
  }

  const active = kind === "accountToken" ? "OAUTH SESSION" : kind === "apiKey" ? "API KEY" : "NO CREDENTIAL";

  return (
    <Modal title="Account" width={440} onClose={onClose}>
      <p className="modal-lead">
        Credentials for Search API requests. Stored locally in this browser — DeepSearch never syncs them to
        a server you don&rsquo;t choose.
      </p>

      <div className="account-rows">
        <div className="account-row-item">
          <span className={kind === "accountToken" ? "live-dot live-dot-on" : "live-dot"} aria-hidden="true" />
          <div className="account-row-text">
            <span className="account-row-label">OAuth</span>
            <span className="account-row-value">{kind === "accountToken" ? "Signed in" : "Not connected"}</span>
          </div>
          <div className="account-row-tags">
            <span className="account-tag">{kind === "accountToken" ? "SIGNED IN" : "SIGNED OUT"}</span>
            <span className="account-tag">DEEPSEEK ACCOUNT</span>
          </div>
        </div>

        <div className="account-row-item">
          <span className="key-icon" aria-hidden="true">
            ⌘
          </span>
          <div className="account-row-text">
            <span className="account-row-label">Key</span>
            <span className="account-row-value">Platform API key</span>
          </div>
          <div className="account-row-tags">
            <span className="account-tag">{kind === "apiKey" ? "CONFIGURED" : "NOT SET"}</span>
            <span className="account-tag">WRITE-ONLY IF ADDED</span>
          </div>
        </div>
      </div>

      <p className="account-meta">
        ACTIVE · {active} · POST /V1/TOOLS/SEARCH
      </p>

      <div className="account-footer">
        <button type="button" className="dialog-secondary" onClick={signOut}>
          Sign out
        </button>
        <button type="button" className="dialog-secondary" onClick={onManageKey}>
          Manage key ↗
        </button>
      </div>
    </Modal>
  );
}
