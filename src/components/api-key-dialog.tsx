import { useState } from "react";
import { browserVault } from "../lib/credentials";
import { Modal } from "./modal";

interface Props {
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}

/**
 * Spec 05 · API Key: write-only capture in a 440px dialog. The value is never
 * rendered again after save, and the field masks while drafting.
 */
export function ApiKeyDialog({ onSaved, onCancel }: Props) {
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    try {
      browserVault().save({ kind: "apiKey", value: draft });
      setDraft("");
      setRevealed(false);
      onSaved();
    } catch {
      setError("That key could not be stored in this browser.");
    }
  }

  return (
    <Modal
      title="API Key"
      width={440}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="dialog-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="cta" onClick={save} disabled={draft.trim().length === 0}>
            Save
          </button>
        </>
      }
    >
      <p className="modal-lead">
        Paste a DeepSeek Platform API key. It is stored write-only in this browser and never shown again after
        save.
      </p>

      <label className="dialog-label" htmlFor="api-key">
        API key
      </label>
      <div className="secret-field">
        <input
          id="api-key"
          className="dialog-input"
          type={revealed ? "text" : "password"}
          autoComplete="new-password"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
        />
        <button
          type="button"
          className="dialog-secondary secret-toggle"
          aria-label={revealed ? "Hide key" : "Show key"}
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </div>

      <p className="modal-note">
        Get a key from{" "}
        <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer noopener">
          DeepSeek Platform
        </a>
      </p>

      {error === null ? null : (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
