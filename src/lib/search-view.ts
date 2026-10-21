/**
 * Pure presentation helpers for the Results screen (R4, R11).
 *
 * The meta line is deliberately literal: it reports what was asked for and what
 * came back, rather than inventing a result count.
 */
import { clampPage, pageCount, rangeLabel } from "./pagination";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The honest meta line under the results header. */
/**
 * Spec 02 · Results meta line:
 * `SHOWING 1–25 · PAGE 1/2 · /V1/TOOLS/SEARCH · COUNT=50 · NEED_CONTENT=FALSE`
 */
export function metaLine(total: number, page: number): string {
  const shown = total === 0 ? "0" : rangeLabel(total, page);
  const pages = pageCount(total);
  const current = clampPage(total, page);
  return `SHOWING ${shown} · PAGE ${String(current)}/${String(pages)} · /V1/TOOLS/SEARCH · COUNT=50 · NEED_CONTENT=FALSE`;
}

/** RFC 3339 to "20 Jan 2025"; an absent or unparseable date says so. */
export function formatDate(iso: string | null): string {
  if (iso === null) return "date unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "date unknown";
  const month = MONTHS[date.getUTCMonth()] ?? "";
  return `${String(date.getUTCDate())} ${month} ${String(date.getUTCFullYear())}`;
}

/** One line of copy per tagged error; the tag is the branch, never the message. */
export function errorCopy(tag: string): string {
  switch (tag) {
    case "CredentialMissing":
      return "Add a DeepSeek API key in Account, then search again.";
    case "Unauthorized":
      return "That credential was rejected. Check or replace it in Account.";
    case "RateLimited":
      return "Too many searches just now. Wait a moment, then retry.";
    case "Transport":
      return "The search could not reach DeepSeek. Check your connection and retry.";
    case "ProtocolError":
      return "DeepSeek returned a response this app does not understand. Nothing was saved.";
    default:
      return "Something went wrong. Retry, and if it persists, check Account.";
  }
}

/** Spec 02b: the meta line while the request is in flight. */
export function loadingMeta(): string {
  return "SEARCHING · /V1/TOOLS/SEARCH · COUNT=50 · NEED_CONTENT=FALSE";
}