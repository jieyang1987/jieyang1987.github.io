/* Check search summaries for every published full HTML document.
 * Length ranges are editorial guardrails, not search-engine display guarantees.
 * Run: node scripts/check-meta-descriptions.js (also included in check:zh).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { collect } = require('./build-release');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const decode = value => value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi, entity => {
  const key = entity.slice(1, -1).toLowerCase();
  if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
  if (key.startsWith('#')) return String.fromCodePoint(Number(key.slice(1)));
  return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[key];
});
function checkHtml(file, html) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  assert(head, `${file}: missing head`);
  const tags = [...head.matchAll(/<meta\b[^>]*>/gi)]
    .map(match => Object.fromEntries([...match[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)]
      .map(attribute => [attribute[1].toLowerCase(), attribute[3]])))
    .filter(attributes => attributes.name?.toLowerCase() === 'description');
  assert.equal(tags.length, 1, `${file}: expected exactly one meta description`);
  const description = decode(tags[0].content || '');
  assert.equal(description, description.trim(), `${file}: surrounding whitespace`);
  assert(!/[<>\r\n]/.test(description), `${file}: description must be plain single-line text`);
  assert(!/undefined|null|正在加载|Loading\.\.\./i.test(description), `${file}: placeholder description`);
  const english = /<html\b[^>]*\blang=["']en(?:-[\w]+)?["']/i.test(html);
  const length = [...description].length;
  const [min, max] = english ? [140, 180] : [60, 120];
  assert(length >= min && length <= max, `${file}: ${length} characters; editorial range ${min}-${max}`);
  for (const match of head.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const schema = JSON.parse(match[1]);
    if (schema.description !== undefined) assert.equal(schema.description, description, `${file}: schema summary differs`);
  }
  return description;
}
function checkAll() {
  const seen = new Map();
  // These two existing legacy routes serve the same book; URL consolidation is separate work.
  const legacyBookAliases = new Set(['bci_book.html', 'book/bci_book.html']);
  const files = collect().filter(file => file.endsWith('.html') && !file.startsWith('static/partials/'));
  for (const file of files) {
    const description = checkHtml(file, read(file));
    const previous = seen.get(description);
    assert(!previous || (legacyBookAliases.has(file) && legacyBookAliases.has(previous)), `${file}: duplicate summary with ${previous}`);
    seen.set(description, file);
  }
  const pages = JSON.parse(read('data/zh-pages.json'));
  for (const page of Object.values(pages)) {
    assert(page.metaDescription && page.metaDescription !== page.intro, `${page.file}: use a dedicated search summary`);
    assert.equal(checkHtml(page.file, read(page.file)), page.metaDescription, `${page.file}: metadata source mismatch`);
  }
  assert.equal(checkHtml('index.html', read('index.html')), JSON.parse(read('data/zh-home.json')).metaDescription);
  console.log(`PASS: meta descriptions on ${files.length} public pages; presence, length, uniqueness and source/schema consistency.`);
}
module.exports = { checkHtml, checkAll };
if (require.main === module) checkAll();
