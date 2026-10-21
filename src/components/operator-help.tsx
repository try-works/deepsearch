import { OPERATORS } from "../lib/operators";

interface Props {
  readonly onClose: () => void;
}

/** Spec 07c: the operator reference. */
export function OperatorHelp({ onClose }: Props) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="operators-title">
        <h2 id="operators-title" className="dialog-title">
          Operators
        </h2>
        <p className="dialog-body">
          Operators are typed into the query. They narrow or shape the results without becoming separate request
          parameters.
        </p>
        <ul className="operator-list">
          {OPERATORS.map((operator) => (
            <li key={operator.token} className="operator-item">
              <code className="operator-token">{operator.token}</code>
              <span className="operator-hint">{operator.hint}</span>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="cta" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
