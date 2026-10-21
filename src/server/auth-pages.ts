/**
 * The two HTML documents the OAuth callback can return (R3).
 *
 * `handoffPage` posts the freshly minted token to the window that opened the
 * popup and closes itself. `noticePage` reports a failure and escapes whatever
 * the Platform said, because error text is still untrusted input.
 */

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function handoffPage(nonce: string, token: string, authorizedUrl: string): string {
  const payload = JSON.stringify({ type: "deepsearch:account", token, authorizedUrl });
  return `<!doctype html><meta charset="utf-8"><title>Signed in</title>
<body style="font:16px/1.5 system-ui;margin:48px auto;max-width:38ch;color:#0B1015">
<h1 style="font-size:20px;font-weight:600">Signed in</h1>
<p style="color:#0B1015AD">You can close this window.</p>
<script nonce="${nonce}">
  window.opener?.postMessage(${payload}, window.location.origin);
  window.close();
</script></body>`;
}

export function noticePage(title: string, detail: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<body style="font:16px/1.5 system-ui;margin:48px auto;max-width:38ch;color:#0B1015">
<h1 style="font-size:20px;font-weight:600">${escapeHtml(title)}</h1>
<p style="color:#0B1015AD">${escapeHtml(detail)}</p></body>`;
}
