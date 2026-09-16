/* Shared, root-relative-to-document favicon links for every public page. */
'use strict';
const path = require('path');
function faviconLinks(file) {
  const base = path.posix.relative(path.posix.dirname(file), 'static/assets');
  return `<link rel="icon" type="image/x-icon" sizes="16x16 32x32 48x48 64x64 128x128 256x256" href="${base}/favicon.ico?v=2"><link rel="icon" type="image/svg+xml" sizes="any" href="${base}/favicon.svg?v=2"><link rel="apple-touch-icon" sizes="180x180" href="${base}/apple-touch-icon.png?v=2">`;
}
function applyFaviconLinks(html, file) {
  if (!/<head\b/i.test(html)) throw new Error(file + ': missing document head');
  return html.replace(/(<head\b[^>]*>)([\s\S]*?)(<\/head>)/i, (_, start, head, end) => {
    const icons = /<link\b[^>]*\brel\s*=\s*["'](?:icon|shortcut\s+icon|apple-touch-icon)["'][^>]*>/gi;
    let inserted = false;
    head = head.replace(icons, () => {
      if (inserted) return '';
      inserted = true;
      return faviconLinks(file);
    });
    return start + head + (inserted ? '' : faviconLinks(file) + '\n') + end;
  });
}
module.exports = { faviconLinks, applyFaviconLinks };
