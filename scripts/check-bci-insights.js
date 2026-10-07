'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {validate, render, build} = require('./build-bci-insights');
const {isPublicFile} = require('./build-release');
const root = path.resolve(__dirname,'..');
const sample = () => ({topics:[{id:'decoding',zh:'神经解码',en:'Neural decoding'}],articles:[{id:'example',date:'2026-09-17',sourceDate:'2026-09-01',source:'Example journal',url:'https://example.org/paper?a=1&b=2',topics:['decoding'],zh:{title:'测试标题 <script>',summary:'导读 & 原文',note:'仅供测试'},en:{title:'Example title',summary:'Example summary'}}]});
test('Generated pages are current; production data contains no demonstration articles', () => {
 build(true);
 const data=JSON.parse(fs.readFileSync(path.join(root,'data/bci-insights.json'),'utf8'));
 validate(data);
 for (const lang of ['zh','en']) {
  const html=render(data,lang);
  assert.equal((html.match(/<h1>/g)||[]).length,1);
  assert.equal((html.match(/aria-current="page"/g)||[]).length,2);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  const counterpart=lang==='zh'?'insights_en.html':'insights.html';
  assert(html.includes(`href="${counterpart}" lang="${lang==='zh'?'en':'zh'}"`));
 }
});
test('Static notes escape text, include provenance and stable anchors, and sort newest first', () => {
 const data=sample();
 data.articles.push({...data.articles[0],id:'older',date:'2025-01-01'});
 data.articles.reverse();
 const html=render(data,'zh');
 assert(html.indexOf('id="note-example"') < html.indexOf('id="note-older"'));
 assert(html.includes('测试标题 &lt;script&gt;'));
 assert(html.includes('导读 &amp; 原文'));
 assert(html.includes('href="#note-example"'));
 assert(html.includes('2026-09-01'));
 assert(html.includes('https://example.org/paper?a=1&amp;b=2'));
 assert(html.includes('rel="noopener noreferrer"'));
 assert(!html.includes('正在加载'));
});
test('Missing English copy is omitted, not fabricated or replaced with Chinese', () => {
 const data=sample(); delete data.articles[0].en;
 assert(!render(data,'en').includes('id="note-example"'));
 assert(render(data,'en').includes('No writings yet'));
 assert(render(data,'zh').includes('id="note-example"'));
});
test('Reject malformed records and unsafe links before publication', () => {
 for (const change of [a=>a.url='javascript:alert(1)',a=>a.url='https://user:secret@example.org',a=>a.id='x" onclick="bad',a=>a.date='2026-02-30',a=>a.topics=['missing'],a=>a.zh.summary='']) {
  const data=sample(); change(data.articles[0]); assert.throws(()=>validate(data));
 }
 const data=sample(); data.articles.push(data.articles[0]); assert.throws(()=>validate(data));
});
test('Desktop and mobile navigation expose the column; release includes both languages', () => {
 for (const base of ['index','research','publications','chip_gallery','book-item-bci','coverage','join']) {
  for (const suffix of ['','_en']) {
   const html=fs.readFileSync(path.join(root,base+suffix+'.html'),'utf8');
   const header=html.match(/<header class="site-header">[\s\S]*?<\/header>/)[0];
   const navs=[...header.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/g)];
   assert(navs.length >= 2);
   for (const nav of navs) assert(nav[1].includes(`href="insights${suffix}.html"`),base+suffix);
  }
 }
 for (const file of ['insights.html','insights_en.html','static/js/bci-insights.js','static/css/bci-insights.css','data/bci-insights.json']) assert(isPublicFile(file),file);
});
function browserHarness() {
 const element = extras => ({hidden:false,value:'',dataset:{},events:{},addEventListener(name,fn){this.events[name]=fn;},...extras});
 const cards=[element({id:'note-a',textContent:'Alpha journal 芯片 导读',dataset:{topics:'interfaces'},scrollIntoView(){this.scrolled=true;}}),element({id:'note-b',textContent:'Beta journal 解码 思考',dataset:{topics:'decoding'},scrollIntoView(){this.scrolled=true;}})];
 const elements={'insight-search':element({focus(){this.focused=true;}}),'insight-topic':element(),'insight-count':element({dataset:{unit:'篇分享'}}),'insight-no-results':element(),'insight-reset':element()};
 const controls=element({hidden:true}), window=element(),location={hash:''};
 vm.runInNewContext(fs.readFileSync(path.join(root,'static/js/bci-insights.js'),'utf8'),{document:{querySelectorAll:()=>cards,querySelector:()=>controls,getElementById:id=>elements[id]},window,location});
 return {cards,elements,controls,window,location};
}
test('Search, topic intersection, no-results state, reset, and permalink reveal work', () => {
 const {cards,elements:e,controls,window,location}=browserHarness();
 assert.equal(controls.hidden,false);
 e['insight-search'].value='ALPHA 芯片'; e['insight-search'].events.input();
 assert.deepEqual(cards.map(c=>c.hidden),[false,true]);
 assert.equal(e['insight-count'].textContent,'1 篇分享');
 e['insight-topic'].value='decoding'; e['insight-topic'].events.change();
 assert(cards.every(c=>c.hidden)); assert.equal(e['insight-no-results'].hidden,false);
 e['insight-reset'].events.click(); assert(cards.every(c=>!c.hidden)); assert(e['insight-search'].focused);
 e['insight-search'].value='no match'; e['insight-search'].events.input();
 location.hash='#note-b'; window.events.hashchange();
 assert.equal(cards[1].hidden,false); assert(cards[1].scrolled); assert.equal(e['insight-search'].value,'');
});

test('Personal essays need no external article and use body text without a reading-guide heading', () => {
 const data=sample(); const a=data.articles[0];
 delete a.source; delete a.url; delete a.sourceDate;
 a.topics=[]; a.zh={title:'自己的思考',body:'第一段。\n第二段 <script>。'};
 const html=render(data,'zh');
 assert(html.includes('自己的思考'));
 assert(html.includes('第一段。\n第二段 &lt;script&gt;。'));
 assert(!html.includes('undefined'));
 assert(!html.includes('简短导读'));
 assert(!html.includes('阅读原文'));
 assert(!html.includes('把值得读的脑机接口文章放在一起'));
 assert(!html.includes('en-page-intro'));
 assert(html.includes('<h1>思考与随笔</h1>'));
 assert(render(data,'en').includes('<h1>Writings</h1>'));
});


test('Chip frame is shared by both languages and remains outside the readable content', () => {
 const data=sample();const original=JSON.stringify(data);
 for(const lang of ['zh','en']) {
  const html=render(data,lang);
  assert(html.includes('class="insight-card chip-frame"'));
  assert(html.includes('class="chip-decoration" aria-hidden="true"'));
  assert.equal((html.match(/class="chip-trace chip-trace--/g)||[]).length,2);
  assert(!html.includes('chip-pins'));
  assert(!html.includes('chip-header'));
  assert(!html.includes('chip-package'));
  assert(html.includes('chip-trace--tl')&&html.includes('chip-trace--br'));
  assert(html.includes('class="chip-content"><div class="insight-meta">'));
  assert(!html.includes('<canvas'));
  const empty=render({topics:[],articles:[]},lang);
  assert(empty.includes('class="insight-empty chip-frame"'));
  assert(!empty.includes('class="insight-card chip-frame"'));
 }
 assert.equal(JSON.stringify(data),original,'Frame rendering must not mutate author records');
 const css=fs.readFileSync(path.join(root,'static/css/bci-insights.css'),'utf8');
 assert(css.includes('pointer-events: none'));
 assert(css.includes('@media (max-width: 520px)'));
 assert(css.includes('@media print'));
});

test('Circuit-frame labels are decoration, not searchable article text', () => {
 const {cards,elements:e}=browserHarness();
 for(const card of cards) {
  const body=card.textContent;
  card.textContent='YJ FIELD NOTES '+body;
  card.querySelector=selector=>selector==='.chip-content'?{textContent:body}:null;
 }
 e['insight-search'].value='YJ';e['insight-search'].events.input();
 assert(cards.every(c=>c.hidden));
 e['insight-search'].value='Alpha';e['insight-search'].events.input();
 assert.deepEqual(cards.map(c=>c.hidden),[false,true]);
});
