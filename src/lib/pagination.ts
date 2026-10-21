/**
 * Spec 02 · Results: "25 results per page (product). API max count=50; client
 * pages of 25 over a ≤50 batch." The API has no offset, so paging happens here.
 */
export const PAGE_SIZE = 25;

export function pageCount(total: number): number {
  if (total <= 0) return 1;
  return Math.ceil(total / PAGE_SIZE);
}

/** Clamp a requested page into range, then take its slice. */
export function pageSlice<T>(items: readonly T[], page: number): readonly T[] {
  const last = pageCount(items.length);
  const current = Math.min(Math.max(page, 1), last);
  const start = (current - 1) * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

/** The page number a request actually renders, after clamping. */
export function clampPage(total: number, page: number): number {
  return Math.min(Math.max(page, 1), pageCount(total));
}

/** "1–25" for the current page. */
export function rangeLabel(total: number, page: number): string {
  if (total <= 0) return "0–0";
  const current = clampPage(total, page);
  const start = (current - 1) * PAGE_SIZE + 1;
  const end = Math.min(current * PAGE_SIZE, total);
  return `${String(start)}–${String(end)}`;
}
