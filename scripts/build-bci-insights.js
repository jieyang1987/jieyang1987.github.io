'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy = {
  "zh": {
    "title": "思考与随笔",
    "description": "杨杰的个人思考与随笔，记录研究过程中的观察、阅读后的感想，以及关于脑机接口、芯片与技术的一些想法。这里以个人写作为主，不拘于文章导读，也不追求新闻式更新。",
    "search": "搜索文章",
    "placeholder": "搜索标题或正文",
    "topic": "按主题浏览",
    "all": "全部主题",
    "note": "补记",
    "source": "参考链接",
    "permalink": "本文链接",
    "date": "写于",
    "sourceDate": "参考资料发表于",
    "empty": "暂时还没有文章",
    "emptyText": "有些想法，慢慢写下来。",
    "noResults": "没有找到匹配的文章，请换个关键词或主题。",
    "reset": "清除筛选",
    "count": "篇文章"
  },
  "en": {
    "title": "Writings",
    "description": "Personal essays and reflections by Jie Yang: observations from research, thoughts on reading, and ideas about brain–computer interfaces, chips, and technology.",
    "search": "Search writings",
    "placeholder": "Search titles or text",
    "topic": "Browse by topic",
    "all": "All topics",
    "note": "Postscript",
    "source": "Reference",
    "permalink": "Link to this essay",
    "date": "Written",
    "sourceDate": "Reference published",
    "empty": "No writings yet",
    "emptyText": "A place for thoughts, as they take shape.",
    "noResults": "No matching writings. Try another keyword or topic.",
    "reset": "Clear filters",
    "count": "writings"
  }
};
function validate(data) {
 assert(Array.isArray(data.topics) && Array.isArray(data.articles), 'topics and articles must be arrays');
 const ids = new Set(), topics = new Set();
 const text = v => typeof v === 'string' && v.trim().length > 0;
 const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
 for (const t of data.topics) {
  assert(typeof t.id === 'string' && /^[a-z][a-z0-9-]*$/.test(t.id) && !topics.has(t.id) && text(t.zh) && text(t.en), 'Invalid or duplicate topic');
  topics.add(t.id);
 }
 for (const a of data.articles) {
  assert(typeof a.id === 'string' && /^[a-z][a-z0-9-]*$/.test(a.id) && !ids.has(a.id), 'Invalid or duplicate article ID');
  ids.add(a.id);
  assert(date(a.date) && (!a.sourceDate || date(a.sourceDate)), a.id+': invalid date');
  assert(a.source === undefined || text(a.source), a.id+': source must be text');
  if (a.url !== undefined) {
   assert(text(a.url), a.id+': URL must be text');
   const url = new URL(a.url);
   assert(['https:','http:'].includes(url.protocol) && !url.username && !url.password, a.id+': invalid reference URL');
  }
  assert(Array.isArray(a.topics) && a.topics.every(t => topics.has(t)), a.id+': unknown topic');
  assert(a.zh, a.id+': Chinese copy required');
  for (const lang of ['zh','en']) if (a[lang]) {
   assert(text(a[lang].title) && text(a[lang].body ?? a[lang].summary), a.id+': title and body required');
   assert(a[lang].note === undefined || typeof a[lang].note === 'string', a.id+': note must be plain text');
  }
 }
 return data;
}
// Two quiet corner traces suggest circuitry without turning the reading area into a diagram.
// Decoration stays non-interactive, accessible text stays inside chip-content.
function chipFrame(body, lang) {
 const corners = ['tl','br'].map(corner => `<svg class="chip-trace chip-trace--${corner}" viewBox="0 0 88 48" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M10 37V24L24 10H70"/><circle cx="10" cy="39" r="2.1" fill="white"/><circle cx="72" cy="10" r="2.1" fill="white"/></g></svg>`).join('');
 return `<div class="chip-decoration" aria-hidden="true">${corners}</div><div class="chip-content">${body}</div>`;
}

function render(data, lang) {
 validate(data);
 const c = copy[lang], zh = lang === 'zh', file = zh ? 'insights.html' : 'insights_en.html';
 const template = read(zh ? 'coverage.html' : 'coverage_en.html');
 let head = template.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<title>[\s\S]*?<\/title>/, `<title>${c.title} — ${zh ? '杨杰' : 'Jie Yang'} | ${zh ? '西湖大学' : 'Westlake University'}</title>`)
  .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(c.description)}">`)
  .replace(/<link rel="alternate"[^>]*>/g, '').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
 head += `<link rel="stylesheet" href="static/css/bci-insights.css?v=4"><link rel="canonical" href="https://yangjie.ac.cn/${file}"><link rel="alternate" hreflang="zh-CN" href="insights.html"><link rel="alternate" hreflang="en" href="insights_en.html">`;
 const localize = html => html.replaceAll(' aria-current="page"','').replace(/href="coverage(_en)?\.html"(?= lang=)/g, `href="${zh ? 'insights_en.html' : 'insights.html'}"`);
 const header = localize(template.match(/<header class="site-header">[\s\S]*?<\/header>/)[0])
  .replaceAll(`href="${file}"`, `href="${file}" aria-current="page"`);
 const footer = localize(template.match(/<footer class="site-footer shell">[\s\S]*?<\/footer>/)[0]);
 const articles = data.articles.filter(a => a[lang]).sort((a,b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
 const cards = articles.map(a => {
  const t = a[lang];
  const body = `<div class="insight-meta">${a.source ? `<span>${esc(a.source)}</span>` : ''}<span>${c.date} <time datetime="${a.date}">${a.date}</time></span>${a.sourceDate ? `<span>${c.sourceDate} <time datetime="${a.sourceDate}">${a.sourceDate}</time></span>` : ''}</div>
<h2>${esc(t.title)}</h2><div class="insight-tags">${a.topics.map(id => `<span>${esc(data.topics.find(topic => topic.id === id)[lang])}</span>`).join('')}</div>
<p>${esc(t.body ?? t.summary)}</p>${t.note ? `<div class="insight-note"><h3>${c.note}</h3><p>${esc(t.note)}</p></div>` : ''}
<div class="insight-links">${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${c.source} <span aria-hidden="true">↗</span></a>` : ''}<a href="#note-${a.id}">${c.permalink}</a></div>`;
  return `<article class="insight-card chip-frame" id="note-${a.id}" data-topics="${esc(a.topics.join(' '))}">${chipFrame(body,lang)}</article>`;
 }).join('\n');
 return `<!DOCTYPE html>
<html lang="${zh ? 'zh-CN' : 'en'}"><head>${head}</head>
<body id="page-top" class="en-inner${zh ? ' zh-unified' : ''}" ${zh ? 'data-page' : 'data-en-page'}="insights"><a class="skip-link" href="#main">${zh ? '跳至正文' : 'Skip to content'}</a>${header}
<main id="main" class="shell en-main insight-main"><header class="en-page-heading">${zh ? '<p class="eyebrow">WRITINGS</p>' : ''}<h1>${c.title}</h1></header>
<div class="insight-layout"><section aria-label="${c.title}">
<div class="insight-controls" hidden><label>${c.search}<input id="insight-search" type="search" placeholder="${c.placeholder}" autocomplete="off"></label><label>${c.topic}<select id="insight-topic"><option value="">${c.all}</option>${data.topics.map(t => `<option value="${t.id}">${esc(t[lang])}</option>`).join('')}</select></label><button id="insight-reset" type="button">${c.reset}</button></div>
<p id="insight-count" class="insight-count" role="status" aria-live="polite" data-unit="${c.count}">${articles.length} ${c.count}</p>
<div id="insight-list">${cards || `<div class="insight-empty chip-frame">${chipFrame(`<h2>${c.empty}</h2><p>${c.emptyText}</p>`,lang)}</div>`}</div>
<p id="insight-no-results" class="insight-empty" hidden>${c.noResults}</p></section>
</div></main>
${footer}<script src="static/js/bci-insights.js?v=2" defer></script></body></html>\n`;
}
function build(check = false) {
 const data = validate(JSON.parse(read('data/bci-insights.json')));
 for (const lang of ['zh','en']) {
  const file = lang === 'zh' ? 'insights.html' : 'insights_en.html';
  const html = render(data, lang);
  if (check) assert.equal(read(file), html, file+': run npm run build:insights');
  else fs.writeFileSync(path.join(root,file),html);
 }
 console.log('Writings: '+(check ? 'generated pages verified' : 'generated Chinese and English pages'));
}
if (require.main === module) build(process.argv.includes('--check'));
module.exports = {validate, render, build};
