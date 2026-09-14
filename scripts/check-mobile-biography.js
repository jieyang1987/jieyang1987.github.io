/* Exercise the deployed summary/full-text disclosure without changing the page. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read('static/js/en-home.js'),profile=JSON.parse(read('data/profile.json')),home=JSON.parse(read('data/zh-home.json'));
const start=source.indexOf('  function setupMobileBiography() {'),end=source.indexOf('  function renderChineseExtras(profile) {',start);
assert(start>=0&&end>start,'Find the deployed biography controller');
let checks=0;function check(value,label){assert(value,label);checks++;}
class Element {
 constructor({hidden=false,textContent='',innerHTML=''}={}){this.hidden=hidden;this.textContent=textContent;this.innerHTML=innerHTML;this.attributes={};this.handlers=new Map();this.top=0;this.scrolls=[];}
 setAttribute(name,value){this.attributes[name]=value;}
 addEventListener(event,fn){if(!this.handlers.has(event))this.handlers.set(event,new Set());this.handlers.get(event).add(fn);}
 click(){for(const fn of this.handlers.get('click')||[])fn();}
 getBoundingClientRect(){return {top:this.top};}
 scrollIntoView(options){this.scrolls.push(options.block);}
}
function harness({mobile=true,lang='zh',missing=[]}={}){
 const full=new Element({innerHTML:profile.about.zh});
 const summary=new Element({hidden:true,textContent:home.mobileBiography});
 const button=new Element({hidden:true,textContent:'收起简介'});
 button.setAttribute('aria-controls','profile-details-copy');button.setAttribute('aria-expanded','true');
 const nodes={'profile-details-copy':full,'profile-summary-copy':summary,'profile-biography-toggle':button};
 const media={matches:mobile,listeners:new Set(),calls:0,addEventListener(event,fn){assert.equal(event,'change');this.listeners.add(fn);},resize(value){this.matches=value;for(const fn of this.listeners)fn();}};
 const setup=vm.runInNewContext('('+source.slice(start,end).trim()+')',{
  lang,document:{getElementById:id=>missing.includes(id)?null:nodes[id]||null},
  window:{matchMedia:query=>{assert.equal(query,'(max-width: 760px)');media.calls++;return media;}}
 });
 setup();return {full,summary,button,media,setup};
}
const h=harness();
check(!h.summary.hidden&&h.full.hidden&&!h.button.hidden,'Mobile defaults to summary with a visible disclosure');
check(h.summary.textContent===home.mobileBiography,'Summary uses the approved localized copy');
check(h.button.textContent==='展开完整简介'&&h.button.attributes['aria-expanded']==='false','Collapsed label and ARIA agree');
check(h.button.attributes['aria-controls']==='profile-details-copy','Button controls the complete biography');
h.button.click();
check(h.summary.hidden&&!h.full.hidden,'Expansion replaces the summary with full text, without duplicate visible introductions');
check(h.button.textContent==='收起简介'&&h.button.attributes['aria-expanded']==='true','Expanded label and ARIA agree');
check(h.full.innerHTML===profile.about.zh,'Full biography and its links remain unchanged');
h.media.resize(false);
check(!h.full.hidden&&h.summary.hidden&&h.button.hidden,'Desktop always shows the complete biography without the control');
h.media.resize(true);
check(!h.full.hidden&&h.summary.hidden&&!h.button.hidden,'Explicit expanded preference survives viewport changes');
h.button.top=10;h.button.click();
check(h.full.hidden&&!h.summary.hidden&&h.button.textContent==='展开完整简介','Collapsing restores summary');
check(h.button.scrolls.length===0,'No scroll adjustment when the collapsed control remains visible');
h.button.click();h.button.top=-20;h.button.click();
check(h.button.scrolls.length===1&&h.button.scrolls[0]==='nearest','Off-screen collapse brings the control back into view');
h.media.resize(false);h.media.resize(true);
check(h.full.hidden&&!h.summary.hidden,'Collapsed preference survives desktop/mobile round trips');
h.setup();h.setup();
check(h.media.listeners.size===1&&h.media.calls===1&&h.button.handlers.get('click').size===1,'Repeated initialization creates no duplicate event handlers');
h.button.click();
const updated=profile.about.zh+'<p>Profile refresh fixture.</p>';
h.full.innerHTML=updated;h.setup();
check(h.full.innerHTML===updated&&!h.full.hidden&&h.summary.hidden,'Async biography replacement preserves full text and expanded state');
h.button.click();h.full.innerHTML=profile.about.zh;h.setup();
check(h.full.hidden&&!h.summary.hidden&&h.media.listeners.size===1,'Async refresh also preserves collapsed state');
const desktop=harness({mobile:false});
check(!desktop.full.hidden&&desktop.summary.hidden&&desktop.button.hidden,'Desktop-first initialization retains full text');
desktop.media.resize(true);
check(desktop.full.hidden&&!desktop.summary.hidden,'Desktop-first visitor gets a collapsed summary on mobile');
const english=harness({lang:'en'});
check(!english.full.hidden&&english.summary.hidden&&english.button.hidden&&english.media.calls===0,'English homepage is untouched');
for(const id of ['profile-details-copy','profile-summary-copy','profile-biography-toggle']){
 const absent=harness({missing:[id]});
 check(absent.media.calls===0&&absent.button.handlers.size===0,'Incomplete markup exits safely: '+id);
}
const html=read('index.html'),hero=html.match(/<section class="hero"[\s\S]*?<\/section>/)?.[0]||'';
check(hero.includes('<div class="hero-biography" id="profile-details-copy">'+profile.about.zh+'</div>'),'All approved paragraphs are present and unhidden in the no-JavaScript fallback');
check(hero.includes('id="profile-summary-copy" hidden>'+home.mobileBiography+'</p>'),'Summary is pre-rendered but hidden until enhancement');
const control=hero.match(/<button\b[^>]*id="profile-biography-toggle"[^>]*>/)?.[0]||'';
check(control.includes('type="button"')&&control.includes('aria-controls="profile-details-copy"')&&/\bhidden\b/.test(control),'Static control is native, associated and hidden without JavaScript');
check(hero.includes('</button></div><div class="hero-links">'),'Contact links stay outside the collapsible biography wrapper');
const contact=hero.slice(hero.indexOf('class="hero-links"'));
for(const link of ['id="link-email"','id="link-scholar"','href="#about"'])check(contact.includes(link),'Contact or honors destination is retained: '+link);
check((hero.match(/id="portrait"/g)||[]).length===1&&(hero.match(/id="profile-details-copy"/g)||[]).length===1,'No duplicated full biography or portrait');
check(!hero.includes('profile-biography-more'),'Legacy first-paragraph/remainder wrapper is not used');
check(source.indexOf('  setupMobileBiography();\n  renderProfile()')>=0,'Static disclosure initializes before asynchronous profile requests');
const extras=source.slice(end,source.indexOf('  async function renderProfile()',end));
check(extras.includes('setupMobileBiography();'),'Fetched biography reuses the idempotent controller');
check(source.includes("setText('profile-summary-copy', home.mobileBiography)"),'Async localized copy updates the same summary');
const css=read('static/css/zh-locale.css'),sharedCss=read('static/css/en-home.css');
check(css.includes('#profile-summary-copy[hidden]')&&css.includes('#profile-details-copy[hidden]')&&css.includes('#profile-biography-toggle[hidden] { display: none; }'),'Author styles respect hidden state for summary, full text and control');
const printRules=css.match(/@media print\s*\{\s*\.zh-unified\[data-page="home"\][\s\S]*?\n\}/)?.[0]||'';
check(printRules.includes('#profile-details-copy[hidden] { display: block; }')&&printRules.includes('#profile-summary-copy,')&&printRules.includes('#profile-biography-toggle { display: none; }'),'Printing shows complete text without summary or control');
check(sharedCss.includes('.home-biography-toggle:focus-visible')&&css.includes('#profile-biography-toggle { min-height: 44px;'),'Keyboard focus and a touch-sized control are retained');
check(!read('index_en.html').includes('profile-biography-toggle'),'English static page does not acquire the Chinese disclosure');
check(JSON.parse(read('package.json')).scripts.check.includes('check:biography'),'Regression test remains part of the full validation command');
console.log('PASS: '+checks+' mobile biography checks; summary/full-text state, resize, refresh, accessibility, language isolation and static fallback.');
