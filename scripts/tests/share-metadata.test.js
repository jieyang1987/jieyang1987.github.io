'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { homepageHead, homepageShareTags, updateEnglishHomepage, homeShares, image, origin } = require('../share-metadata');
const { collect } = require('../build-release');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const [file, share] of Object.entries(homeShares)) {
  test(file + ': static, unique, localized share metadata', () => {
    const html = read(file);
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)[1];
    assert(html.includes(homepageHead), 'WebPage properties must have an explicit scope');
    const expected = homepageShareTags(file);
    assert(head.includes(expected), 'Generated metadata must appear in the initial HTML head');
    const tags = [...head.matchAll(/<(?:meta|link)\b[^>]*>/gi)].map(match =>
      Object.fromEntries([...match[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(attr => [attr[1], attr[2]])));
    for (const key of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url',
      'og:locale', 'og:locale:alternate', 'og:image', 'og:image:secure_url', 'og:image:type',
      'og:image:width', 'og:image:height', 'og:image:alt', 'twitter:card', 'twitter:title',
      'twitter:description', 'twitter:image', 'twitter:image:alt']) {
      const found = tags.filter(tag => (tag.property || tag.name) === key);
      assert.equal(found.length, 1, key + ' must be unique');
      assert(found[0].content.length > 0, key + ' must not be empty');
    }
    const content = key => tags.find(tag => (tag.property || tag.name) === key).content;
    assert.equal(content('og:title'), share.title);
    assert.equal(content('og:description'), share.description);
    assert.equal(content('og:locale'), share.locale);
    assert.equal(content('og:url'), share.url);
    assert.equal(content('og:image'), origin + '/' + image.path);
    assert.equal(content('twitter:image'), content('og:image'));
    for (const [key, ogKey] of [['name', 'og:title'], ['description', 'og:description'], ['image', 'og:image']]) {
      const found = tags.filter(tag => tag.itemprop === key);
      assert.equal(found.length, 1, 'Unique microdata ' + key);
      assert.equal(found[0].content, content(ogKey), 'Microdata and OG must agree');
      assert(!found[0].name && !found[0].property, 'Do not mix metadata syntaxes on one tag');
    }
    assert.equal(tags.filter(tag => tag.name === 'description').length, 1, 'Preserve one SEO description');
    assert(!/jweixin|wx\.config|WeixinJSBridge/i.test(html), 'No SDK or undocumented bridge hacks');
    const canonical = tags.filter(tag => tag.rel === 'canonical');
    assert.equal(canonical.length, 1);
    assert.equal(canonical[0].href, share.url);
    assert.equal(new URL(share.url).protocol, 'https:');
    assert(!html.split('</head>')[1].includes('homepage-share:'), 'No client-rendered or body metadata');
  });
}

test('Portrait is a public JPEG with accurate declared dimensions', () => {
  assert(collect().includes(image.path), 'Image must be included by the existing public allowlist');
  const buffer = fs.readFileSync(path.join(root, image.path));
  assert.equal(buffer.readUInt16BE(0), 0xffd8, 'JPEG signature');
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  for (let offset = 2; offset + 4 < buffer.length;) {
    assert.equal(buffer[offset++], 0xff, 'JPEG marker');
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    if (sof.has(marker)) {
      assert.equal(buffer.readUInt16BE(offset + 3), image.height);
      assert.equal(buffer.readUInt16BE(offset + 5), image.width);
      return;
    }
    if (marker === 0xda || marker === 0xd9) break;
    const length = buffer.readUInt16BE(offset);
    assert(length >= 2);
    offset += length;
  }
  assert.fail('Missing JPEG dimensions');
});

test('English metadata sync is idempotent and preserves content outside its block', () => {
  const original = '<html><head><title>Original</title></head><body>Unchanged</body></html>';
  const updated = updateEnglishHomepage(original);
  assert.equal(updateEnglishHomepage(updated), updated);
  assert.equal(updated.replace(homepageShareTags('index_en.html') + '\n', '').replace(homepageHead, '<head>'), original);
  const real = read('index_en.html');
  assert.equal(updateEnglishHomepage(real), real);
  assert.throws(() => updateEnglishHomepage(updated.replace('</head>', homepageShareTags('index_en.html') + '</head>')), /Duplicate/);
  assert.throws(() => updateEnglishHomepage('<head><!-- homepage-share:start --></head>'), /Incomplete/);
  assert.throws(() => updateEnglishHomepage('<body>Missing head</body>'), /Missing/);
});

test('Share copy is escaped as attributes, not markup', () => {
  const original = homeShares['index.html'].title;
  try {
    homeShares['index.html'].title = 'A "quote" & <tag>\'s';
    assert(homepageShareTags('index.html').includes('A &quot;quote&quot; &amp; &lt;tag&gt;&#39;s'));
  } finally { homeShares['index.html'].title = original; }
  assert.throws(() => homepageShareTags('unknown.html'), /Unsupported/);
});


test('Microdata scope preserves unrelated head attributes and rejects conflicting scopes', () => {
  const original = '<html><head data-test="keep"><title>Keep SEO title</title><meta name="description" content="Keep SEO summary"></head><body>Keep body</body></html>';
  const updated = updateEnglishHomepage(original);
  assert.equal(updateEnglishHomepage(updated), updated);
  assert.equal(updated.replace(homepageShareTags('index_en.html') + '\n', '').replace(' itemscope itemtype="https://schema.org/WebPage"', ''), original);
  assert.throws(() => updateEnglishHomepage('<head itemscope itemtype="https://schema.org/Person"></head>'), /Conflicting/);
});
