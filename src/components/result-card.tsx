import type { SearchResult } from "../lib/search";

interface Props {
  readonly result: SearchResult;
  readonly index: number;
}

/**
 * Spec 02 · Results card, measured from the design:
 * header row = 28px site icon · mono index · 15/18 title · 28px Copy control;
 * meta row = site name · 20px score chip · 20px auth chip; 14/22 snippet; mono
 * date line. The date is the API's own RFC 3339 value.
 */
export function ResultCard({ result, index }: Props) {
  const position = String(index + 1).padStart(2, "0");
  return (
    <article className="result">
      <div className="result-head">
        <span className="result-icon" aria-hidden="true">
          {result.siteIcon === null ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          ) : (
            <img src={result.siteIcon} alt="" width={14} height={14} />
          )}
        </span>
        <span className="result-index">{position}</span>
        <a className="result-title" href={result.url} target="_blank" rel="noreferrer noopener">
          {result.title}
        </a>
        <button
          type="button"
          className="result-copy"
          aria-label="Copy URL"
          onClick={() => {
            void navigator.clipboard.writeText(result.url);
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M15 5H6a1 1 0 0 0-1 1v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="result-body">
        <div className="result-meta">
          {result.siteName === null ? null : <span className="result-site">{result.siteName}</span>}
          <span className="chip chip-score">score {result.rerankScore.toFixed(1)}</span>
          <span className="chip chip-auth">auth {result.authority}</span>
        </div>
        <p className="result-snippet">{result.snippet}</p>
        <span className="result-date">{result.date ?? "date unknown"}</span>
      </div>
    </article>
  );
}
