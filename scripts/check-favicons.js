/* Dependency-free favicon checks, included in check:zh. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { collect } = require('./build-release');
const { faviconLinks } = require('./favicon-links');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));
function pngSize(buffer) {
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Valid PNG signature');
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}
function checkAll() {
  const svg = read('static/assets/favicon.svg').toString('utf8');
  assert(svg.includes('viewBox="0 0 64 64"') && svg.includes('YJ'), 'Named, square SVG master');
  assert(!/<(?:text|image|script|foreignObject)\b/i.test(svg), 'Favicon is self-contained geometry, with no font or external image dependency');
  const ico = read('static/assets/favicon.ico');
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  const sizes = [16, 32, 48, 64, 128, 256];
  assert.equal(ico.readUInt16LE(4), sizes.length);
  let end = 6 + sizes.length * 16;
  for (const [i, size] of sizes.entries()) {
    const entry = 6 + i * 16;
    assert.equal(ico[entry] || 256, size);
    assert.equal(ico[entry + 1] || 256, size);
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    assert.equal(offset, end, 'Contiguous ICO images');
    assert(offset + length <= ico.length, 'ICO image bounds');
    assert.deepEqual(pngSize(ico.subarray(offset, offset + length)), [size, size]);
    end = offset + length;
  }
  assert.equal(end, ico.length);
  for (const [file, size] of [['favicon-96.png',96], ['favicon-512.png',512], ['apple-touch-icon.png',180]]) {
    assert.deepEqual(pngSize(read('static/assets/' + file)), [size, size]);
  }
  const published = collect();
  const files = published.filter(file => file.endsWith('.html') && !file.startsWith('static/partials/'));
  for (const file of files) {
    const html = read(file).toString('utf8');
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
    assert(head.includes(faviconLinks(file)), file + ': shared, correctly relative favicon links');
    assert.equal((head.match(/rel="icon"/g) || []).length, 2, file + ': exactly two favicon formats');
    assert.equal((head.match(/rel="apple-touch-icon"/g) || []).length, 1, file + ': one touch icon');
    for (const match of faviconLinks(file).matchAll(/href="([^"]+)"/g)) {
      const target = new URL(match[1], 'https://local.test/' + file).pathname.slice(1);
      assert(published.includes(target), file + ': icon is included in release: ' + target);
    }
  }
  console.log(`PASS: favicon links on ${files.length} public pages; SVG, 6 ICO resolutions, PNG dimensions and release inclusion.`);
}
module.exports = { checkAll };
if (require.main === module) checkAll();
