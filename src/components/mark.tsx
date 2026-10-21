/**
 * The DeepSearch mark: a submarine — a hull, a conning tower and a periscope.
 *
 * Drawn as four filled shapes rather than line art, because it has to hold at
 * 14 px inside the CTA; strokes turn to mush at that size, solids still read.
 * It appears only inside the search CTA and as the site icon.
 */
export function Mark({ size = 16 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <rect x="1.8" y="11" width="20.4" height="7.2" rx="3.6" />
      <rect x="8.6" y="6.8" width="6.8" height="5" rx="1.3" />
      <rect x="11.2" y="3" width="1.6" height="4.4" rx="0.7" />
      <rect x="11.2" y="3" width="3.8" height="1.6" rx="0.7" />
    </svg>
  );
}
