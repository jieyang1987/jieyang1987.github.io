/* Static homepage share metadata. No SDK, credentials or client-side injection. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const origin = 'https://yangjie.ac.cn';
const image = { path: 'static/assets/img/yangjie.jpg', width: 273, height: 339, type: 'image/jpeg' };
const homeShares = {
  'index.html': {
    title: '杨杰｜个人主页',
    description: '西湖大学 · 西湖灵犀科技｜脑机接口与类脑计算',
    locale: 'zh_CN', alternate: 'en_US', url: origin + '/',
    siteName: '杨杰 · 个人学术主页', alt: '杨杰个人照片'
  },
  'index_en.html': {
    title: 'Jie Yang | Academic Homepage',
    description: 'Westlake University · Neuralicorn | Brain–computer interfaces and neuromorphic computing',
    locale: 'en_US', alternate: 'zh_CN', url: origin + '/index_en.html',
    siteName: 'Jie Yang · Academic Homepage', alt: 'Portrait of Jie Yang'
  }
};
const start = '<!-- homepage-share:start -->';
const end = '<!-- homepage-share:end -->';
const escapeAttribute = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
function homepageShareTags(file) {
  const share = homeShares[file];
  if (!share) throw new Error('Unsupported share page: ' + file);
  const tag = (attribute, key, value) => `<meta ${attribute}="${key}" content="${escapeAttribute(value)}">`;
  const properties = {
    'og:type': 'website', 'og:site_name': share.siteName,
    'og:title': share.title, 'og:description': share.description, 'og:url': share.url,
    'og:locale': share.locale, 'og:locale:alternate': share.alternate,
    'og:image': origin + '/' + image.path, 'og:image:secure_url': origin + '/' + image.path,
    'og:image:type': image.type, 'og:image:width': image.width,
    'og:image:height': image.height, 'og:image:alt': share.alt
  };
  const twitter = { 'twitter:card': 'summary', 'twitter:title': share.title,
    'twitter:description': share.description, 'twitter:image': origin + '/' + image.path,
    'twitter:image:alt': share.alt };
  return [start, `<link rel="canonical" href="${share.url}">`,
    ...Object.entries(properties).map(([key, value]) => tag('property', key, value)),
    ...Object.entries(twitter).map(([key, value]) => tag('name', key, value)), end].join('\n');
}
function updateEnglishHomepage(html) {
  const block = homepageShareTags('index_en.html');
  const pattern = /<!-- homepage-share:start -->[\s\S]*?<!-- homepage-share:end -->/g;
  const matches = html.match(pattern) || [];
  if (matches.length > 1) throw new Error('Duplicate homepage share blocks');
  if (matches.length === 1) return html.replace(pattern, () => block);
  if (html.includes(start) || html.includes(end)) throw new Error('Incomplete homepage share block');
  if (!html.includes('</head>')) throw new Error('Missing head closing tag');
  return html.replace('</head>', block + '\n</head>');
}
if (require.main === module) {
  const file = path.join(root, 'index_en.html');
  const before = fs.readFileSync(file, 'utf8');
  const after = updateEnglishHomepage(before);
  if (process.argv.includes('--check')) {
    if (before !== after) throw new Error('English share metadata is stale; run npm run build:share');
  } else if (before !== after) fs.writeFileSync(file, after);
  console.log('English homepage share metadata is current.');
}
module.exports = { homepageShareTags, updateEnglishHomepage, homeShares, image, origin };
