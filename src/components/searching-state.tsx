/**
 * Spec 02b · Results Loading and 02c · Progress motion.
 *
 * The same meta line and card geometry as Results, with the results replaced by a
 * progress block and five skeletons. The fill loops through the spec's keyframes
 * (18% → 62% → 91%) because the Search API reports no progress; a numeric percent
 * would be invented, so it is not shown.
 */
export function SearchingState() {
  return (
    <div className="searching" aria-busy="true" aria-live="polite">
      <div className="searching-head">
        <span className="live-dot live-dot-on searching-pulse" aria-hidden="true" />
        <span className="searching-label">Searching the web</span>
      </div>

      <div className="track" role="progressbar" aria-label="Search progress">
        <div className="track-fill" />
        <div className="track-tip" aria-hidden="true" />
      </div>

      <div className="skeletons">
        {[0, 1, 2, 3, 4].map((index) => (
          <div className="result skeleton-card" key={`skeleton-${String(index)}`} aria-hidden="true">
            <div className="result-head">
              <span className="result-icon skeleton-bone" />
              <span className="result-index skeleton-bone skeleton-index" />
              <span className="skeleton-bone skeleton-title" />
              <span className="result-copy skeleton-bone" />
            </div>
            <div className="result-body">
              <div className="result-meta">
                <span className="skeleton-bone skeleton-domain" />
                <span className="skeleton-bone skeleton-chip" />
                <span className="skeleton-bone skeleton-chip" />
              </div>
              <span className="skeleton-bone skeleton-line" />
              <span className="skeleton-bone skeleton-line skeleton-line-short" />
              <span className="skeleton-bone skeleton-date" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
