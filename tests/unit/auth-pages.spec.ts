/**
 * R3: the HTML the callback returns. The success page posts the token to the
 * opener exactly once and closes; the notice page must escape anything it shows.
 */
import { describe, expect, it } from "@effect/vitest";
import { handoffPage, noticePage } from "../../src/server/auth-pages";

describe("handoffPage", () => {
  it("posts the token to the opener with the current origin", () => {
    const html = handoffPage("nonce123", "dsh_test", "https://platform.deepseek.com/dsh/authorized?result=x");
    expect(html).toContain('postMessage');
    expect(html).toContain('"dsh_test"');
    expect(html).toContain("window.location.origin");
    expect(html).toContain("window.close()");
  });

  it("carries only the nonce-scoped script, with no network call of its own", () => {
    const html = handoffPage("nonce123", "dsh_test", "https://example.com/authorized");
    expect(html).toContain('nonce="nonce123"');
    expect(html).not.toContain("fetch(");
    expect(html).not.toContain("location.href");
    expect(html).not.toContain("<link");
    expect(html).not.toContain("<img");
  });
});

describe("noticePage", () => {
  it("escapes the detail so it cannot inject markup", () => {
    const html = noticePage("Sign-in failed", "<script>alert(1)</script> & more");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; more");
  });
});
