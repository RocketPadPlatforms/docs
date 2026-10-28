const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Static redirect page. meta refresh works without JS and is treated like a permanent
 * redirect by Google; canonical points at the target and noindex keeps the stub out of results.
 */
export function redirectHtml(targetPath: string, canonicalUrl: string): string {
  const t = esc(targetPath);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Redirecting…</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${esc(canonicalUrl)}">
<meta http-equiv="refresh" content="0; url=${t}">
<script>location.replace(${JSON.stringify(targetPath).replace(/</g, '\\u003c')})</script>
</head>
<body>
<p>Redirecting to <a href="${t}">${t}</a>…</p>
</body>
</html>
`;
}
