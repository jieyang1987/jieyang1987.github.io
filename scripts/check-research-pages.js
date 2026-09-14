/* Focused offline tests of the deployed research renderer; presentation helpers are stubbed. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const data=JSON.parse(read('data/research.json'));
const before=JSON.stringify(data);
const source=read('static/js/en-site.js');
const start=source.indexOf('  async function research() {');
const end=source.indexOf('  async function chips()',start);
assert(start>=0&&end>start);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=value=>String(value??'').replace(/<[^>]*>/g,'');
const safe=value=>{if(!value)return '';try{const url=new URL(value,'https://local.test/research.html');return ['http:','https:','mailto:'].includes(url.protocol)?url.href:'';}catch(_){return '';}};
let checks=0;
function check(value,message){assert(value,message);checks++;}
async function render(language,records=data,options={}){
 const content={innerHTML:'',handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},querySelectorAll(){return options.headings||[];}};let navigations=0;
 const narrow={matches:options.narrow||false,addEventListener(type,handler){assert.equal(type,'change');this.change=handler;}};
 const nodes=new Map();
 function node(id){
  if(!content.innerHTML.includes('id="'+id+'"'))return null;
  if(!nodes.has(id))nodes.set(id,{attributes:{'aria-expanded':'false','data-expanded':'false'},focused:false,setAttribute(name,value){this.attributes[name]=value;},getAttribute(name){return this.attributes[name];},focus(){this.focused=true;}});
  return nodes.get(id);
 }
 const ctx={lang:language,content,window:{matchMedia:query=>{assert.equal(query,'(max-width: 760px)');return narrow;}},document:{getElementById:node},json:async file=>{assert.equal(file,'data/research.json');return records;},t:(en,zh)=>language==='zh'?zh:en,esc:escape,rich:value=>String(value),text:plain,href:safe,URL,location:{origin:'https://local.test'},imageButton:(src,title,extra='')=>'<button class="'+extra+'" data-image="'+escape(src)+'" data-title="'+escape(title)+'" aria-label="'+escape(title)+'"></button>',initialAnchor:()=>{navigations++;}};
 await vm.runInNewContext('('+source.slice(start,end).trim()+')',ctx)();
 return {html:content.innerHTML,navigations,content,node,narrow};
}
async function main(){
 const libraryIndex=JSON.parse(read('data/publications.json'));
 const papers=libraryIndex.yearlyFiles.flatMap(file=>['journals','conferences'].flatMap(type=>(JSON.parse(read(file.file))[type]||[]).flatMap(group=>group.items)));
 const expectedSelections={
  research3:['Sparsity-Aware Neural Interface with CIM-Based Predictive Focused Sampling for Hotspot Spike Tracking','NeuroSEED: A Neuromorphic Scalable Event-Driven SoC with Direct Multiplexing for Spike Detection and Wireless Telemetry'],
  research4:['Acoustic Inspired Brain-to-Sentence Decoder for Logosyllabic Language','Towards Homogeneous Lexical Tone Decoding from Heterogeneous Intracranial Recordings'],
  research2:['Event-Fused Hybrid ANN-SNN Architecture for Low-Latency Object Detection in Automotive Vision','SHARP: An Energy-Efficient Spike-Based 3-D Recognition Processor With Hierarchical Hybrid Sparsity Awareness on Point Cloud']
 };
 for(const [id,titles] of Object.entries(expectedSelections)){
  const highlights=data.directions.find(direction=>direction.id===id).progressHighlights;
  assert.deepEqual(highlights.map(item=>item.paperTitle),titles,id+': requested papers remain in curated order');checks++;
  check(highlights.every(item=>item.year===(id==='research4'?2025:2026)),id+': milestone years match the publication library');
 }
 const historicalDirections=['research6','research7'];
 assert.deepEqual(data.directions.filter(d=>historicalDirections.includes(d.id)).map(d=>d.id),['research7','research6'],'Doctoral research precedes postdoctoral research in navigation and body');checks++;
 const expectedLabels={research3:['ISSCC','JETCAS'],research4:['Cyborg and Bionic Systems','ICLR'],research2:['RA-L','TCAS-I'],research1:['TBioCAS','JBHI'],research5:['ICLR']};
 for(const direction of data.directions){
  if(historicalDirections.includes(direction.id))check(!direction.progressHighlights?.length,'Historical research has no progress highlights');
  else {assert.deepEqual(direction.progressHighlights.map(item=>item.paperLabel),expectedLabels[direction.id],'Links display only journal or conference names');checks++;}
 }
 for(const language of ['zh','en']){
  const {html,navigations}=await render(language);
  const nav=html.slice(0,html.indexOf('</nav>')+6);
  if(language==='zh'){
   check(nav.includes('class="zh-research-nav"')&&!nav.includes('en-page-index'),'Chinese navigation uses grouped text links without button styling');
   check(nav.includes('当前研究')&&nav.includes('早期研究')&&nav.includes('博士及博士后阶段'),'Navigation distinguishes current and doctoral/postdoctoral research');
   check(nav.indexOf('class="zh-research-nav-note"')>nav.lastIndexOf('</ul>'),'Stage note follows the earlier-research links instead of occupying a heading row');
   check((nav.match(/class="zh-research-nav-separator" aria-hidden="true"/g)||[]).length===5,'Text-link separators are decorative and omitted before the first link of each group');
   const current=nav.slice(0,nav.indexOf('id="research-nav-earlier"'));
   const earlier=nav.slice(nav.indexOf('id="research-nav-earlier"'));
   for(const direction of data.directions){
    check(nav.includes('>'+escape(direction.navigation.labelZh)+'</a>'),'Navigation uses the approved short labels');
    check((historicalDirections.includes(direction.id)?earlier:current).includes('href="#'+direction.id+'"'),'Research links appear in the correct group');
    check(nav.split('href="#'+direction.id+'"').length===2,'Every research direction has exactly one navigation link');
   }
   }else {
   check(nav.includes('zh-research-nav') && !nav.includes('en-page-index'), 'English navigation uses the same grouped text-link structure');
   check(nav.includes('Current research') && nav.includes('Earlier research') && nav.includes('Doctoral and postdoctoral work'), 'English group labels are localized');
   check(!/[\u4e00-\u9fff]/.test(nav), 'English navigation contains no Chinese labels');
   const earlierHeadingStart=nav.indexOf('id="research-nav-earlier"');
   const earlierHeading=nav.slice(earlierHeadingStart,nav.indexOf('class="zh-research-nav-body"',earlierHeadingStart));
   check(earlierHeading.includes('class="zh-research-nav-note"') && earlierHeading.includes('Doctoral and postdoctoral work'), 'English stage note sits beside the group heading, before the links');
   for(const direction of data.directions)check(nav.includes('>'+escape(direction.navigation.labelEn)+'</a>'), 'English navigation retains all direction labels');
  }
  check((html.match(/class="en-research-card en-surface"/g)||[]).length===data.directions.length,language+': all research directions remain');
  check((html.match(/class="en-research-summary"/g)||[]).length===0,language+': desktop cards do not repeat introductory summaries');
  for(const direction of data.directions){
   check(html.includes('<h2>'+escape(direction.title[language])+'</h2>'),language+': direction title retained');
   check(html.includes('id="'+direction.id+'"')&&html.includes('href="#'+direction.id+'"'),language+': existing anchors and index links retained');
   const paragraphs=direction.content[language].match(/<p\b[^>]*>[\s\S]*?<\/p>/gi)||[direction.content[language]];
   const articleStart=html.indexOf('<article class="en-research-card en-surface" id="'+direction.id+'">');
   const article=html.slice(articleStart,html.indexOf('</article>',articleStart));
   let previousPosition=-1;
   for(const paragraph of paragraphs){
    const position=article.indexOf(paragraph);
    check(position>=0,language+': detailed body paragraph is retained');
    check(position>previousPosition,language+': original narrative order is retained');
    previousPosition=position;
   }
   if(language==='zh'){
    check(article.includes('<div class="en-research-heading"><h2>'+escape(direction.title.zh)+'</h2>')&&article.includes('<div class="en-research-copy en-research-lead">'+paragraphs[0]+'</div>'),'Chinese first paragraph remains next to the image');
    check(article.split(paragraphs[0]).length-1===1,'First paragraph is not duplicated');
    if(paragraphs.length>1){
     check(article.includes('展开完整研究脉络与相关论文')&&article.includes('收起研究脉络'),'Narrative disclosure has descriptive open/close labels');
     check(!/<details[^>]*\bopen(?:\s|=|>)/.test(article),'Full narrative remains initially collapsed');
     check(article.includes('<div class="en-research-copy en-research-lead">'+paragraphs[0]+'</div><div class="en-research-copy en-research-continuation"><details class="en-details">'),'Narrative disclosure directly follows the lead in the same text column');
     check(!article.includes('<div class="en-research-copy">'),'Chinese narrative no longer restarts in a separate full-width block');
     for(const paragraph of paragraphs)check(article.split(paragraph).length-1===1,'Each Chinese narrative paragraph is rendered exactly once');
    }
    const highlights=direction.progressHighlights||[];
    check(historicalDirections.includes(direction.id)?highlights.length===0:highlights.length>=1&&highlights.length<=2,'Only ongoing directions have one or two curated milestones');
    check((article.match(/class="en-research-progress-item"/g)||[]).length===highlights.length,'Selected milestones appear without opening the narrative');
    if(highlights.length)check(article.indexOf('class="en-research-progress"')>article.indexOf('<h2>')&&article.indexOf('class="en-research-progress"')<article.indexOf('en-research-lead'),'Milestones sit before the lead paragraph');
    else check(!article.includes('en-research-progress')&&!article.includes('进展速览'),'Historical directions omit the entire progress section');
    check(!article.includes('<details')||article.indexOf('en-research-lead')<article.indexOf('<details'),'Lead paragraph sits before the narrative disclosure');
    for(const item of highlights){
     check(article.includes(escape(item.textZh))&&article.includes('datetime="'+item.year+'"'),'Milestone description and explicit year are visible');
     check(!/<[^>]+>/.test(item.textZh),'Milestone descriptions are plain text without bold markup');
     check(direction.content.zh.includes(item.sourceCitation)||papers.some(p=>p.url===item.sourceCitation&&p.title===item.paperTitle),'Each curated milestone has a narrative citation or an exact publication-library source');
     check(!/127\.0\.0\.1|localhost/.test(item.href),'Milestone data contains no preview-only host');
     const url=new URL(item.href,'https://local.test/');
     if(url.origin==='https://local.test'){
      check(url.pathname==='/publications.html'&&url.hash==='#publication-results','Known papers use the existing internal publication locator');
      const selector=url.searchParams.get('paper');
      const matches=papers.filter(p=>{if(p.url===selector)return true;try{const u=new URL(p.url);return u.hostname==='ieeexplore.ieee.org'&&u.pathname.match(/\/document\/(\d+)\/?$/)?.[1]===selector;}catch(_){return false;}});
      check(matches.length===1&&matches[0].title===item.paperTitle,'Milestone links resolve to exactly the recorded paper');
     }else check(item.href===item.sourceCitation,'Unindexed sources reuse the existing narrative URL rather than inventing a local paper');
    }
    if(direction.summary.zh)check(!article.includes(escape(direction.summary.zh)),'Removed promotional summary does not return');
   }else{
    check(article.includes('<div class="en-research-copy en-research-lead">'+paragraphs[0]+'</div>') && !article.includes('<div class="en-research-copy">'), 'English lead stays in the image-side text column');
    check(article.includes('View research details &amp; publications') && article.includes('Hide research details'), 'English disclosure labels are localized');
    const highlights=direction.progressHighlights || [];
    check((article.match(/class="en-research-progress-item"/g)||[]).length===highlights.length, 'English milestone count matches Chinese');
    for(const item of highlights)check(typeof item.textEn==='string' && article.includes(escape(item.textEn)), 'English progress translation is displayed');
    for(const paragraph of paragraphs)check(article.split(paragraph).length-1===1, 'Each English narrative paragraph appears exactly once');
    check(!/[\u4e00-\u9fff]/.test(article), 'English research has no Chinese interface or narrative text');
    check(article.includes(escape(direction.mobileSummaryEn)), 'Existing English summary is retained for compact mobile presentation');
   }
   for(const image of direction.images||[])check(article.includes(escape(language==='en'?image.srcEn||image.src:image.src)),language+': original research image retained');
  }
  check(navigations===1,language+': anchor navigation still runs after rendering');
 }
 const englishControls=await render('en');
 const englishToggle=englishControls.node('research-nav-toggle'),englishPanel=englishControls.node('research-nav-content');
 englishControls.content.handlers.click({target:{closest:selector=>selector==='#research-nav-toggle'?{}:null}});
 check(englishToggle.getAttribute('aria-expanded')==='true' && englishPanel.getAttribute('data-expanded')==='true', 'English research navigation opens accessibly');
 englishControls.content.handlers.keydown({key:'Escape',target:{closest:selector=>selector==='.zh-research-nav'?{}:null}});
 check(englishToggle.getAttribute('aria-expanded')==='false' && englishToggle.focused, 'English Escape closes research navigation and restores focus');
 const enCss=read('static/css/en-site.css');
 check(enCss.includes('body[data-en-page="research"] .en-page-heading .en-page-intro { max-width: 68ch;'), 'English introduction has a readable bounded line length');
 check(enCss.includes('body[data-en-page="research"] .zh-research-nav-group { display: block; }'), 'English research groups place their heading above links');
 check(enCss.includes('.research-nav-content { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);'), 'English current research receives a wider primary column');
 check(enCss.includes('.zh-research-nav-group:first-child .zh-research-nav-links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));'), 'Current research links use two columns on desktop');
 check(enCss.includes('padding-left: 28px; border-left: 1px solid var(--line);'), 'Earlier work has a quiet vertical separator');
 check(read('research_en.html').includes('Exploring neural interfaces, Mandarin decoding, and brain-inspired computing and vision.'), 'English opening uses the approved shorter research introduction');
 check(enCss.includes('body[data-en-page="research"] .en-research-continuation') && enCss.includes('body[data-en-page="research"] .research-mobile-intro--with-progress > p { display: none; }'), 'English compact research styles match the approved Chinese hierarchy');
 const sample={directions:[{id:'research-test',title:{zh:'测试方向'},content:{zh:'<p>单段正文。</p>'},images:[]}]};
 const single=await render('zh',sample);
 check(single.html.includes('en-research-top--text-only'),'Directions without images use the full width');
 check(!single.html.includes('<details')&&!single.html.includes('en-research-progress'),'Missing milestone data does not create empty UI blocks');
 const fixture=structuredClone(sample);
 fixture.directions[0].progressHighlights=[{year:2020,textZh:'Pinned first',paperLabel:'Paper',href:'publications.html'},{year:2025,textZh:'Pinned second',paperLabel:'Paper',href:'https://example.invalid/paper'},{year:2026,textZh:'Extra hidden',paperLabel:'Paper',href:'https://example.invalid/extra'}];
 const curated=await render('zh',fixture);
 check((curated.html.match(/class="en-research-progress-item"/g)||[]).length===2,'A direction never displays more than two milestones');
 check(curated.html.indexOf('Pinned first')<curated.html.indexOf('Pinned second')&&!curated.html.includes('Extra hidden'),'Author-curated order is preserved rather than automatically ranking by year');
 check(curated.html.includes('target="_blank" rel="noopener"'),'External sources open safely in a new tab');
 fixture.directions[0].progressHighlights=[{year:2025,textZh:'Unsafe link',href:'javascript:bad()'},{year:'2025" bad',textZh:'Bad year',href:'https://example.invalid'},{year:2025,textZh:'<img src=x onerror=bad>',paperLabel:'<script>bad</script>',href:'https://example.invalid/safe'}];
 const safeMarkup=await render('zh',fixture);
 check((safeMarkup.html.match(/class="en-research-progress-item"/g)||[]).length===1,'Malformed milestone years and unsafe URLs are omitted');
 check(!safeMarkup.html.includes('<img src=x')&&!safeMarkup.html.includes('<script>')&&!safeMarkup.html.includes('javascript:'),'Milestone text and labels cannot inject markup');
 const css=read('static/css/zh-locale.css');
 check(css.includes('.zh-unified .en-research-top { align-items: start; margin-bottom: 0; }'),'Image/lead alignment remains compact');
 check(css.includes('.en-research-progress-text { font-size: 14px; font-weight: 400;'),'Milestone copy is compact and not bolded');
 check(css.includes('.en-details[open] > summary .research-narrative-open { display: none; }'),'Open narrative state shows the collapse label');
 check(!css.includes('.en-research-card > .en-research-copy { margin-top: 20px; }'),'Old detached narrative spacing is removed');
 check(css.includes('.en-research-continuation { margin-top: 6px; }'),'Disclosure starts close to the lead paragraph');
 check(css.includes('.en-research-continuation > .en-details { margin-top: 0; font-size: inherit; }'),'Expanded narrative keeps the lead font size without an extra top margin');
 check(css.includes('.en-research-continuation > .en-details > summary { padding-block: 2px;')&&css.includes('.en-research-continuation > .en-details > div { padding-top: 8px; }'),'Button and expanded content use compact spacing');
 // Read exactly the research media block; later homepage/print rules are unrelated.
 const mobileStart=css.indexOf('/* Compact Chinese research page: narrow screens only; keep desktop and paper content unchanged. */');
 check(mobileStart>=0,'Chinese compact research style section exists');
 const mediaStart=css.indexOf('@media',mobileStart),braceStart=css.indexOf('{',mediaStart);
 let depth=1,mediaEnd=braceStart+1;
 for(;mediaEnd<css.length&&depth>0;mediaEnd++) {
  if(css[mediaEnd]==='{')depth++;
  else if(css[mediaEnd]==='}')depth--;
 }
 check(mediaStart>=0&&braceStart>=0&&depth===0,'Research media block is complete');
 const mobile=css.slice(mediaStart,mediaEnd);
 check(mobile.trim().startsWith('@media screen and (max-width: 760px) {')&&(mobile.match(/@media/g)||[]).length===1,'Text-first research styling applies only to narrow screens');
 const mobileRules=[...mobile.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
 check(mobileRules.length>=30&&mobileRules.every(rule=>rule[1].trim().startsWith('.zh-unified[data-page="research"]')),'All text-first styling is scoped to the Chinese research page');
 check(mobile.includes('.en-research-top { display: block; }')&&mobile.includes('grid-template-columns: clamp(56px, 12vw, 72px) minmax(0, 1fr);'),'Mobile research pairs a narrow left diagram column with a flexible progress column');
 check(mobile.includes('.en-research-figure { display: none; }')&&mobile.includes('.research-mobile-diagram { grid-column: 1; grid-row: 2;'),'Mobile diagram is on the left without restoring the large desktop illustration');
 check(mobile.includes('.en-research-progress-body { display: contents; }'),'Progress descriptions and source links can be laid out without duplication');
 check(mobile.includes('time { grid-column: 1; grid-row: 1;')&&mobile.includes('.en-research-progress-link { grid-column: 2; grid-row: 1;'),'Year and venue share the metadata row');
 check(mobile.includes('.en-research-progress-text { grid-column: 1 / -1; grid-row: 2; }'),'Milestone description spans the row below its source');
 check(mobile.includes('background: transparent; border: 0; border-top: 1px solid var(--line); border-radius: 0; box-shadow: none;'),'Mobile cards become simple sections rather than nested boxes');
 check(!/\.en-research-copy[^{}]*\{[^}]*font-size/.test(mobile),'Research body text retains its readable size');
 check(css.includes('.zh-unified[data-page="research"] .research-mobile-intro { display: none; }'),'Compact summaries and floating images are hidden on desktop');
 const controls=await render('zh');
 check(controls.html.includes('id="research-nav-toggle" aria-expanded="false" aria-controls="research-nav-content"'),'Navigation starts collapsed with an accessible controlled-panel button');
 check(mobile.includes('.research-nav-content[data-expanded="false"] { display: none; }'),'Collapsed navigation hides its links only on narrow screens');
 const toggle=controls.node('research-nav-toggle'),panel=controls.node('research-nav-content');
 controls.content.handlers.click({target:{closest:selector=>selector==='#research-nav-toggle'?{}:null}});
 check(toggle.getAttribute('aria-expanded')==='true'&&panel.getAttribute('data-expanded')==='true','Navigation activation reveals all destinations and updates ARIA');
 controls.content.handlers.keydown({key:'Escape',target:{closest:selector=>selector==='.zh-research-nav'?{}:null}});
 check(toggle.getAttribute('aria-expanded')==='false'&&panel.getAttribute('data-expanded')==='false'&&toggle.focused,'Escape closes the navigation and returns focus to its toggle');
 controls.content.handlers.click({target:{closest:selector=>selector==='#research-nav-toggle'?{}:null}});
 controls.content.handlers.click({ctrlKey:true,target:{closest:selector=>selector==='.zh-research-nav-links a'?{}:null}});
 check(panel.getAttribute('data-expanded')==='true','Modified navigation clicks keep ordinary new-tab behavior');
 controls.content.handlers.click({target:{closest:selector=>selector==='.zh-research-nav-links a'?{}:null}});
 check(panel.getAttribute('data-expanded')==='false','Selecting a research direction collapses the navigation before the native anchor jump');
 check((controls.html.match(/class="research-mobile-diagram"/g)||[]).length===data.directions.filter(d=>d.images?.length).length,'Each illustrated direction has one mobile thumbnail control');
 for(const direction of data.directions){
  check(direction.mobileSummaryZh.length<=90&&controls.html.includes(escape(direction.mobileSummaryZh)),'Every direction has a concise neutral summary');
  if(!direction.images?.length)continue;
  const im=direction.images[0];
  check(controls.html.includes('class="research-mobile-diagram" data-image="'+escape(im.src)+'" data-title="'+escape(im.caption?.zh||direction.title.zh)+'"'),'Left-column thumbnails reuse the original image and existing enlargement handler');
 }
 check(!single.html.includes('research-mobile-diagram'),'Missing summary/image data creates no dead thumbnail');
 check(source.includes('openDialog(img.dataset.title,')&&source.includes("event.target.closest('[data-image]')"),'Thumbnail controls reuse the existing accessible image modal');
 check(mobile.includes('.en-research-heading > h2 { grid-column: 1 / -1; grid-row: 1;')&&mobile.includes('.en-research-progress { grid-column: 2; grid-row: 2;')&&mobile.includes('.en-research-continuation { grid-column: 1 / -1; grid-row: 3;'),'Mobile layout is full-width title, diagram and progress side by side, then the disclosure');
 check(mobile.includes('.research-mobile-intro--with-progress > p { display: none; }'),'Directions with milestones do not show a redundant summary above the progress');
 check(mobile.includes('.research-mobile-intro p { grid-column: 2; grid-row: 2;')&&mobile.includes('.en-research-heading--text-only { grid-template-columns: minmax(0, 1fr); }'),'Historical summaries and directions without images retain useful fallback layouts');
 check((controls.html.match(/research-mobile-intro--with-progress/g)||[]).length===data.directions.filter(d=>d.progressHighlights?.length).length,'Only directions with curated progress omit the extra mobile summary');
 const lead={parent:'heading'},progress={placement:'before-lead'};
 const body={prepend(node){assert.equal(node,lead);node.parent='details';}};
 const continuation={querySelector:()=>body};
 const heading={querySelector:selector=>selector==='.research-mobile-intro'?{}:selector==='.en-research-lead'?lead:selector==='.en-research-continuation'?continuation:selector==='.en-research-progress'?progress:null,insertBefore(node,target){if(node===lead){assert.equal(target,continuation);node.parent='heading';}else{assert.equal(node,progress);assert([lead,continuation].includes(target));progress.placement=target===lead?'before-lead':'before-disclosure';}},append(node){assert.equal(node,progress);progress.placement='after-disclosure';}};
 const relocated=await render('zh',data,{narrow:true,headings:[heading]});
 check(lead.parent==='details'&&progress.placement==='before-disclosure','Mobile moves the full first paragraph into the closed narrative rather than leaving it expanded');
 relocated.narrow.matches=false;relocated.narrow.change();
 check(lead.parent==='heading'&&progress.placement==='before-lead','Returning to desktop restores the original first-paragraph placement');
 relocated.narrow.matches=true;relocated.narrow.change();
 check(lead.parent==='details'&&progress.placement==='before-disclosure','Repeated resizing retains one full narrative and progress before the disclosure');
 check(JSON.stringify(data)===before,'Rendering does not mutate research source records');
 console.log('PASS: '+checks+' research checks; curated milestones, original narrative order, internal links and English compatibility.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
