/* Activity pages show every record without search or year-filter controls. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const data=JSON.parse(read('data/coverage.json')),before=JSON.stringify(data);
const source=read('static/js/en-site.js');
const start=source.indexOf('  async function activities() {'),end=source.indexOf('  async function join()',start);
assert(start>=0&&end>start);
const renderer=source.slice(start,end).trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let checks=0;
function check(value,message){assert(value,message);checks++;}
async function render(lang,records=data,options={}){
 const nodes=new Map(),content={innerHTML:''};
 const narrow={matches:options.narrow||false,addEventListener(event,handler){assert.equal(event,'change');this.change=handler;}};
 const document={getElementById(id){assert(id==='activity-results','Renderer must not query removed controls or totals');if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',querySelectorAll(selector){assert.equal(selector,'.en-activity[data-image-count="1"]');return options.rows||[];}});return nodes.get(id);}};
 await vm.runInNewContext('('+renderer+')',{content,document,lang,window:{matchMedia:query=>{assert.equal(query,'(max-width: 760px)');return narrow;}},json:async file=>{assert.equal(file,'data/coverage.json');return records;},t:(en,zh)=>lang==='zh'?zh:en,esc,external:(url,label)=>'<a href="'+esc(url)+'">'+label+'</a>',imageButton:(src,title)=>'<button data-image="'+esc(src)+'" aria-label="'+esc(title)+'"></button>'})();
 return {shell:content.innerHTML,html:nodes.get('activity-results').innerHTML,narrow};
}
async function main(){
 for(const lang of ['zh','en']){
  const result=await render(lang);
  check(!/<input|<select|en-toolbar|activity-search|id="activity-year"/.test(result.shell),lang+': search and year-filter UI are removed for all viewport widths');
  check(!result.shell.includes('activity-count')&&result.shell==='<div id="activity-results"></div>',lang+': content starts directly with the archive, without a total or empty status row');
  const page=read(lang==='zh'?'coverage.html':'coverage_en.html');
  const heading=page.match(/<header class="en-page-heading">[\s\S]*?<\/header>/)?.[0]||'';
  check(heading.includes('<h1>')&&!heading.includes('en-page-intro'),lang+': heading retains the page title without an introductory tagline');
  check(/<meta name="description" content="[^"]+"/.test(page),lang+': useful search metadata is retained');
  check((result.html.match(/class="en-activity"/g)||[]).length===data.items.length,lang+': every activity is retained');
  const dates=[...result.html.matchAll(/datetime="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(dates,[...dates].sort().reverse(),lang+': activities remain in reverse chronological order');checks++;
  const years=[...result.html.matchAll(/class="en-activity-year">(\d+)</g)].map(match=>Number(match[1]));
  assert.deepEqual(years,[...new Set(data.items.map(item=>Number(item.date.split('.')[0])))].sort((a,b)=>b-a),lang+': all year headings remain in descending order');checks++;
  for(const item of data.items){
   check(result.html.includes(esc(lang==='en'?item.titleEn:item.title)),lang+': activity title retained');
   if(item.url)check(result.html.includes('href="'+esc(item.url)+'"'),lang+': external activity link retained');
   for(const image of item.images||[])check(result.html.includes('data-image="'+esc(image.src)+'"'),lang+': image enlargement control retained');
  }
  const empty=await render(lang,{items:[]});
  check(!empty.shell.includes('activity-count'),lang+': empty archive does not restore a counter');
  check(empty.html.includes(lang==='zh'?'暂无活动记录。':'No activity records are available yet.')&&!/search|关键词/.test(empty.html),lang+': empty state does not refer to removed filters');
 }
 const escaped=await render('zh',{items:[{date:'2026.01.01',title:'<img src=x onerror=bad>',titleEn:'Test',images:[]}]});
 check(!escaped.html.includes('<img src=x')&&escaped.html.includes('&lt;img'),'Activity titles cannot inject markup');
 check(!/activity-search|id="activity-year"|activity-count/.test(renderer),'No obsolete filter handlers or total updates remain');
 check(read('static/css/en-site.css').includes('#activity-results > section:first-child > .en-activity-year { margin-top: 0; }'),'Removing the intro and count leaves no reserved gap above the first year');
 for(const lang of ['zh','en']){
  const html=(await render(lang)).html;
  const singles=data.items.filter(item=>item.images?.length===1).length;
  const imageCount=data.items.reduce((total,item)=>total+(item.images?.length||0),0);
  check((html.match(/data-image-count="1"/g)||[]).length===singles,lang+': only single-image records receive the floating-image layout marker');
  check((html.match(/data-image="/g)||[]).length===imageCount,lang+': images are not duplicated for the responsive layout');
  const image={parent:'copy'};
  const copy={append(node){assert.equal(node,image);node.parent='copy';}};
  const row={querySelector:selector=>selector==='.en-event-images'?image:selector==='.en-activity-copy'?copy:null,prepend(node){assert.equal(node,image);node.parent='before-date';}};
  const mobile=await render(lang,data,{narrow:true,rows:[row]});
  check(image.parent==='before-date',lang+': a single thumbnail moves before the date/title so text can wrap');
  mobile.narrow.matches=false;mobile.narrow.change();
  check(image.parent==='copy',lang+': widening the viewport restores the original desktop image position');
  mobile.narrow.matches=true;mobile.narrow.change();
  check(image.parent==='before-date',lang+': repeated resizing reuses the existing image controls');
 }
 const css=read('static/css/en-site.css').split('/* Mobile activity rows: one left thumbnail with text wrap; multi-image galleries stay separate. */')[1]||'';
 check(css.trim().startsWith('@media screen and (max-width: 760px) {')&&(css.match(/@media/g)||[]).length===1,'Activity wrapping styles only apply below the existing narrow-screen breakpoint');
 const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
 check(rules.length===8&&rules.every(rule=>rule[1].trim().startsWith('body:is([data-page="activities"], [data-en-page="activities"])')),'Every new layout rule is scoped to the activity pages');
 check(css.includes('.en-activity { display: flow-root; padding: 14px 0; }'),'Each activity contains its own float and uses compact spacing');
 check(css.includes('.en-activity .en-activity-copy { display: block; }'),'Text can wrap beside the thumbnail and regain full width below it');
 check(css.includes('[data-image-count="1"] > .en-event-images { display: block; float: left;'),'Only single-image activity thumbnails float left');
 check(css.includes('width: 80px; margin: 3px 12px 6px 0;'),'Floating thumbnails retain a readable text gutter');
 check(css.includes('.en-event-images { display: flex; clear: both; gap: 8px;'),'Multi-image galleries remain separate, wrapping rows');
 check(JSON.stringify(data)===before,'Rendering does not mutate the activity archive');
 console.log('PASS: '+checks+' activity checks; no filters, complete bilingual archive, date grouping, links, images and empty states.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
