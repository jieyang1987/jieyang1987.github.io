/* Exercise the deployed publication page with deep-link queries and local JSON.
 * DOM and presentation helpers are stubbed; the actual filtering/selection renderer runs. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const data=file=>JSON.parse(read(file));
const home=data('data/zh-home.json');
const index=data('data/publications.json');
const all=index.yearlyFiles.flatMap(group=>['journals','conferences'].flatMap(type=>(data(group.file)[type]||[]).flatMap(year=>year.items)));
const source=read('static/js/en-site.js');
const start=source.indexOf('  async function publications() {');
const end=source.indexOf('  async function activities()',start);
assert(start>=0&&end>start);
const renderer=source.slice(start,end).trim();
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=value=>String(value??'').replace(/<[^>]*>/g,'');
let checks=0;
function check(value,label){assert(value,label);checks++;}
async function render(search='',lang='zh',failFile='',statsAvailable=true,headingAvailable=true,isNarrow=false){
 const nodes=new Map();
 const node=id=>{
  assert(!['publication-controls','paper-search','paper-topic','paper-year','paper-type','pub-filter-toggle','pub-filter-count','pub-advanced-filters','pub-clear-filters'].includes(id),'Removed controls must not be queried');
  if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:['paper-topic','paper-year','paper-type'].includes(id)?'all':'',hidden:false,attributes:{'aria-expanded':'false'},setAttribute(name,value){this.attributes[name]=value;},getAttribute(name){return this.attributes[name];},focus(){this.focused=true;},handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}});
  return nodes.get(id);
 };
 const state={scrolls:0,statsCount:0};
 const viewport={matches:isNarrow,addEventListener(event,handler){assert.equal(event,'change');this.change=handler;}};
 const browserWindow={matchMedia:query=>{assert.equal(query,'(max-width: 760px)');return viewport;}};
 if(statsAvailable)browserWindow.renderVenueStats=(papers,container)=>{state.statsCount=papers.length;container.innerHTML='venue totals';return true;};
 const heading={classList:{add(value){state.headingClass=value;}},append(node){state.overview=node;}};
 const content={innerHTML:''};
 const context={
  json:async file=>{if(file===failFile)throw new Error('Simulated missing yearly file');return data(file);},
  lang,t:(en,zh)=>lang==='zh'?zh:en,content,document:{getElementById:node,querySelector:selector=>{assert.equal(selector,'.en-page-heading');return headingAvailable?heading:null;}},
  location:{search,hash:'#publication-results'},URL,URLSearchParams,abstracts:new Map(),
  text,esc:escape,rich:value=>String(value??''),external:(url,label)=>'<a href="'+escape(url)+'">'+label+'</a>',
  noun:(count,singular)=>count===1?singular:singular+'s',
  window:browserWindow,
  initialAnchor:()=>{state.scrolls++;assert(node('publication-results').innerHTML,'Results must be drawn before anchor navigation');}
 };
 await vm.runInNewContext('('+renderer+')',context)();
 return {nodes,node,content,state,viewport};
}
const ieeeId=paper=>{try{const u=new URL(paper.url);return u.hostname==='ieeexplore.ieee.org'?u.pathname.match(/\/document\/(\d+)\/?$/)?.[1]:null;}catch(_){return null;}};
const count=markup=>(markup.match(/<li class="en-publication">/g)||[]).length;
async function main(){
 const pageHeading=read('publications.html').match(/<header class="en-page-heading">[\s\S]*?<\/header>/)?.[0]||'';
 check(pageHeading.includes('<h1>论文发表</h1>')&&!pageHeading.includes('en-page-intro'),'Chinese publication heading no longer displays the redundant introduction');
 const removed=/publication-controls|paper-search|paper-topic|paper-year|paper-type|pub-filter|pub-advanced|pub-clear|<input|<select|<form/;
 check(!removed.test(renderer),'Publication search/filter UI and control dependencies are removed rather than hidden');
 const awards=home.paperAwards.filter(item=>item.url);
 check(awards.length===5,'Five unambiguous honors retain their paper links');
 const milestones=data('data/research.json').directions.flatMap(d=>d.progressHighlights||[]).filter(item=>item.href.startsWith('publications.html'));
 const incoming=[...awards.map(item=>({url:item.url,title:item.paperTitle})),...milestones.map(item=>({url:item.href,title:item.paperTitle}))];
 for(const reference of incoming){
  const url=new URL(reference.url,'https://local.test/');
  check(url.pathname==='/publications.html'&&url.hash==='#publication-results','Existing incoming link targets the publication locator');
  const selector=url.searchParams.get('paper');
  const matches=all.filter(p=>p.url===selector||ieeeId(p)===selector);
  check(matches.length===1&&matches[0].title===reference.title,'Incoming link identifies exactly the recorded paper');
  for(const language of ['zh','en']){
   const result=await render(url.search,language);const html=result.node('publication-results').innerHTML;
   check(!removed.test(result.content.innerHTML),language+': selected-paper view has no search/filter form');
   check(count(html)===1&&html.includes(escape(matches[0].url)),language+': direct link still isolates its exact paper');
   check(result.state.scrolls===1,language+': anchor navigation runs after the selected paper is rendered');
   const returnLink=result.content.innerHTML.match(/class="pub-show-all" href="([^"]+)"/);
   const expected=language==='zh'?'publications.html#publication-results':'publications_en.html#publication-results';
   check(returnLink?.[1]===expected,language+': selected-paper view offers a localized return-to-all link');
   const backUrl=new URL(returnLink[1],'https://local.test/');
   check(backUrl.search===''&&count((await render(backUrl.search,language)).node('publication-results').innerHTML)===all.length,'View all clears the paper selector and restores the complete archive');
   check(result.state.statsCount===all.length&&result.content.innerHTML.includes('class="pub-overview-number">'+all.length+'</span>'),'Selected-paper view keeps the complete publication total in the overview');
  }
 }
 const normal=await render('');
 check(normal.content.innerHTML.includes('>* 表示通信作者。</p>')&&!normal.content.innerHTML.includes('提供已收录的 PDF'),'Publication note keeps only the corresponding-author explanation');
 check(!renderer.includes('PDF and abstract links are shown where available.'),'Equivalent redundant English note is also removed');
 check(normal.content.innerHTML.includes('class="pub-overview-number">'+all.length+'</span>')&&!normal.content.innerHTML.includes('id="paper-count"'),'Graphical total replaces the old text count row');
 const english=await render('','en');
 for(const [language,result] of [['zh',normal],['en',english]]){
  check(!removed.test(result.content.innerHTML),language+': ordinary desktop and mobile visits have no search or filter markup');
  check(count(result.node('publication-results').innerHTML)===all.length,language+': ordinary visits show every paper');
  check(!result.content.innerHTML.includes('pub-show-all'),language+': no redundant return-to-all link on the complete archive');
  const html=result.node('publication-results').innerHTML;
  for(const id of ['journal','conference'])check(html.includes('id="'+id+'"'),language+': category anchor is preserved');
  const yearLinks=[...html.matchAll(/href="#((?:journal|conference)-[^"#]+)"/g)].map(match=>match[1]);
  check(yearLinks.length>0&&yearLinks.every(id=>html.includes('id="'+id+'"')),language+': every year jump resolves to its original heading');
  for(const paper of all){if(paper.pdf)check(html.includes(escape(paper.pdf)),language+': PDF links are preserved');}
 }
 check(normal.state.overview===normal.node('pub-overview')&&normal.state.headingClass==='pub-heading-with-overview','Overview is moved into the title header instead of remaining above the paper list');
 const nav=normal.node('publication-section-nav');
 check(!nav.hidden&&nav.innerHTML.includes('href="#journal"')&&nav.innerHTML.includes('href="#conference"'),'Both category jump links remain available');
 check(normal.content.innerHTML.split('id="publication-section-nav"').length===2,'Category navigation is not duplicated');
 const stats=normal.node('venue-stats'),toggle=normal.node('venue-stats-toggle');
 check(!stats.hidden&&!toggle.hidden&&toggle.getAttribute('aria-expanded')==='false'&&normal.node('pub-venue-panel').getAttribute('data-expanded')==='false','Desktop shows a compact chart preview before expansion');
 toggle.handlers.click();check(!stats.hidden&&toggle.getAttribute('aria-expanded')==='true'&&normal.node('pub-venue-panel').getAttribute('data-expanded')==='true','Desktop disclosure reveals every chart row');
 toggle.handlers.click();check(!stats.hidden&&toggle.getAttribute('aria-expanded')==='false'&&normal.node('pub-venue-panel').getAttribute('data-expanded')==='false','Closing desktop details returns to the compact preview');
 check(!normal.node('pub-venue-panel').hidden&&normal.state.statsCount===all.length,'Desktop panel uses the complete cumulative dataset');
 const phone=await render('','zh','',true,true,true);
 const phoneStats=phone.node('venue-stats'),phoneToggle=phone.node('venue-stats-toggle');
 check(phoneStats.hidden&&!phoneToggle.hidden&&phoneToggle.getAttribute('aria-expanded')==='false','Mobile starts with totals visible and venue details collapsed');
 phoneToggle.handlers.click();
 check(!phoneStats.hidden&&phoneToggle.getAttribute('aria-expanded')==='true','Mobile disclosure opens the venue charts with synchronized ARIA');
 phoneToggle.handlers.click();
 check(phoneStats.hidden&&phoneToggle.getAttribute('aria-expanded')==='false','Mobile disclosure closes the venue charts');
 phone.viewport.matches=false;phone.viewport.change();
 check(!phoneStats.hidden&&phoneToggle.getAttribute('aria-expanded')==='false','Widening a collapsed mobile panel shows the desktop preview');
 phoneToggle.handlers.click();phone.viewport.matches=true;phone.viewport.change();
 check(!phoneStats.hidden&&phoneToggle.getAttribute('aria-expanded')==='true','Resizing preserves an explicitly expanded chart');
 phoneToggle.handlers.click();
 check(phoneStats.hidden&&phoneToggle.getAttribute('aria-expanded')==='false','Mobile can still collapse all details after resizing');
 const noStats=await render('','zh','',false);
 check(noStats.node('venue-stats-toggle').hidden&&noStats.node('pub-venue-panel').hidden&&count(noStats.node('publication-results').innerHTML)===all.length,'An unavailable optional distribution never prevents the archive from rendering');
 check(english.content.innerHTML.includes('venue-stats-toggle') && english.content.innerHTML.includes('publication-section-nav'), 'English uses the shared overview and category jumps');
 check(english.state.statsCount===all.length && english.content.innerHTML.includes('View more') && english.content.innerHTML.includes('View less'), 'English cumulative statistics and disclosure labels are localized');
 check(!/[\u4e00-\u9fff]/.test(english.content.innerHTML + english.node('publication-section-nav').innerHTML), 'English publication interface has no Chinese text');
 check(english.node('publication-section-nav').innerHTML.includes('Journal papers') && english.node('publication-section-nav').innerHTML.includes('Conference papers'), 'English category links are explicit');
 const englishPhone=await render('','en','',true,true,true);
 check(englishPhone.node('venue-stats').hidden, 'English mobile venue chart starts collapsed');
 englishPhone.node('venue-stats-toggle').handlers.click();
 check(!englishPhone.node('venue-stats').hidden && englishPhone.node('venue-stats-toggle').getAttribute('aria-expanded')==='true', 'English mobile venue chart expands accessibly');
 englishPhone.node('venue-stats-toggle').handlers.click();
 check(englishPhone.node('venue-stats').hidden, 'English mobile venue chart collapses again');
 const statsWindow={};
 vm.runInNewContext(read('static/js/publication-stats.js'),{window:statsWindow,document:{createElement:()=>({set innerHTML(value){this.content={textContent:text(value)};}})}});
 const statsContainer={setAttribute(){}};
 const typed=index.yearlyFiles.flatMap(group=>['journals','conferences'].flatMap(type=>(data(group.file)[type]||[]).flatMap(year=>year.items.map(p=>({...p,type})))));
 statsWindow.renderVenueStats(typed,statsContainer);
 check(statsContainer.className==='pub-stats'&&!/<strong|×|en-surface/.test(statsContainer.innerHTML),'Statistics use unboxed plain text without bold counts or multiplication signs');
 check(statsContainer.innerHTML.includes('期刊')&&statsContainer.innerHTML.includes('会议'),'Both venue groups remain visible');
 check(!statsContainer.innerHTML.includes('pub-stats-note')&&!statsContainer.innerHTML.includes('所列期刊与会议'),'Redundant cumulative-count note is removed');
 const chineseStatsHtml=statsContainer.innerHTML;
 statsWindow.renderVenueStats(typed,statsContainer,'en');
 check(statsContainer.innerHTML.includes('Journals') && statsContainer.innerHTML.includes('Conferences') && !/[\u4e00-\u9fff]/.test(statsContainer.innerHTML), 'English venue chart headings and accessible descriptions are localized');
 const countRows=html=>[...html.matchAll(/data-venue="([^"]+)" data-count="(\d+)"/g)].map(m=>m[1]+':'+m[2]);
 check(JSON.stringify(countRows(statsContainer.innerHTML))===JSON.stringify(countRows(chineseStatsHtml)), 'Both languages show identical venue counts');
 const enPage=read('publications_en.html');
 check(enPage.includes('class="pub-heading-copy"') && enPage.includes('publication-stats.js?v=6'), 'English title wrapper and optional statistics loader are present');
 check(read('static/css/en-site.css').includes('body[data-en-page="publications"] .pub-heading-with-overview'), 'English overview uses a page-scoped matching layout');
 const fixture=[{type:'journals',venue:'IEEE Journal of Solid-State Circuits'},{type:'conferences',venue:'ISCAS',award:'BioCAS'},{type:'conferences',title:'CICC',venue:'unmatched'}];
 statsWindow.renderVenueStats(fixture,statsContainer);
 check(statsContainer.innerHTML.includes('data-venue="JSSC" data-count="1"')&&statsContainer.innerHTML.includes('data-venue="BioCAS" data-count="1"')&&statsContainer.innerHTML.includes('data-venue="CICC" data-count="1"')&&!statsContainer.innerHTML.includes('data-venue="ISCAS"'),'Existing first-match order and title/award matching are preserved');
 check(statsWindow.renderVenueStats([],statsContainer)===false&&statsContainer.innerHTML==='','Empty counts produce no empty groups or active disclosure');

 const nonIeee=all.find(p=>p.url&&!ieeeId(p));
 const exact=await render('?paper='+encodeURIComponent(nonIeee.url));
 check(count(exact.node('publication-results').innerHTML)===1&&exact.node('publication-results').innerHTML.includes(escape(nonIeee.url)),'Exact non-IEEE publisher URLs still identify individual papers');
 const prefix=await render('?paper=101');
 check(prefix.content.innerHTML.includes('暂未找到所链接的论文')&&count(prefix.node('publication-results').innerHTML)===all.length,'Partial document IDs do not match unrelated publications');
 const hostile=await render('?paper='+encodeURIComponent('"><script>query-attack</script>'));
 check(!hostile.content.innerHTML.includes('query-attack')&&count(hostile.node('publication-results').innerHTML)===all.length,'Unrecognized query strings are not injected into the page');
 const missing=await render('?paper=10132492','zh','data/publications/2023.json');
 check(missing.content.innerHTML.includes('部分年份数据加载失败')&&missing.content.innerHTML.includes('暂未找到所链接的论文'),'Partial data failures keep clear notices');
 check(count(missing.node('publication-results').innerHTML)>0,'Available records remain visible after a yearly-file failure');
 check(home.paperAwards.filter(item=>!item.url).length===3,'Unresolved honors are not assigned guessed links');
 check(!/publication-controls|pub-filter-|pub-advanced-filters|pub-clear-filters/.test(read('static/css/zh-locale.css')),'Obsolete publication filter CSS is removed');
 check(!/关键词|主题/.test(data('data/zh-pages.json').publications.intro),'Publication introduction no longer advertises removed filtering features');
 const journalsTotal=typed.filter(p=>p.type==='journals').length,conferencesTotal=typed.filter(p=>p.type==='conferences').length;
 check(normal.content.innerHTML.includes('aria-label="期刊 '+journalsTotal+' 篇，会议 '+conferencesTotal+' 篇"'),'Proportion graphic has an explicit accessible description with exact counts');
 const shares=[...normal.content.innerHTML.matchAll(/class="pub-type-(?:journals|conferences)" style="width:([\d.]+)%"/g)].map(m=>Number(m[1]));
 check(shares.length===2&&Math.abs(shares[0]-journalsTotal/all.length*100)<.01&&Math.abs(shares[1]-conferencesTotal/all.length*100)<.01,'Proportion bar widths are calculated from all loaded papers');
 check(!normal.content.innerHTML.includes('144 / 144')&&!normal.content.innerHTML.includes('paper-count-mobile'),'Old duplicated count lines are not left below the graphical overview');
 check(normal.content.innerHTML.split('id="pub-overview"').length===2&&normal.content.innerHTML.split('id="venue-stats-toggle"').length===2,'Overview and distribution control each exist only once');
 check(english.content.innerHTML.includes('pub-overview') && english.state.overview===english.node('pub-overview'), 'English statistics sit beside the title like Chinese');
 const noHeading=await render('','zh','',true,false);
 check(noHeading.content.innerHTML.includes('pub-overview')&&count(noHeading.node('publication-results').innerHTML)===all.length,'Missing optional heading placement still leaves the overview and publication archive available');
 statsWindow.renderVenueStats(typed,statsContainer);
 const rows=[...statsContainer.innerHTML.matchAll(/class="pub-venue-row" data-venue="([^"]+)" data-count="(\d+)"/g)];
 check(rows.length>0&&rows.every(row=>Number(row[2])>0),'Every venue chart row has a real positive count');
 const scale=Number(statsContainer.innerHTML.match(/data-max-count="(\d+)"/)?.[1]);
 check(scale===Math.max(...rows.map(row=>Number(row[2]))),'Both venue charts use the same count scale');
 const widths=[...statsContainer.innerHTML.matchAll(/style="width:([\d.]+)%"/g)].map(m=>Number(m[1]));
 check(widths.length===rows.length&&widths.every((width,index)=>width>0&&width<=100&&Math.abs(width-Number(rows[index][2])/scale*100)<.01),'Venue bar lengths faithfully represent the displayed counts');
 check(statsContainer.innerHTML.includes('aria-hidden="true"')&&statsContainer.innerHTML.includes('class="pub-venue-count"'),'Decorative bars are backed by visible, accessible numeric labels');
 const css=read('static/css/zh-locale.css');
 const categoryStyle=css.match(/\.zh-unified \.pub-section-nav \{([^}]+)\}/)?.[1]||'';
 check(categoryStyle.includes('margin-left: 0;')&&!categoryStyle.includes('margin-left: auto;'),'Category jump links align with the left edge of the publication list on desktop and mobile');
 check(css.includes('.pub-heading-with-overview { display: grid; grid-template-columns: minmax(190px, .7fr) minmax(0, 2fr);'),'Desktop header reserves a left title column and a wide statistics region');
 check(css.includes('.pub-venue-panel { grid-column: 2; grid-row: 1;')&&css.includes('.pub-overview-summary { grid-column: 1; grid-row: 1;'),'Total metrics sit left of the collapsible venue distribution');
 check(css.includes('@media screen and (min-width: 761px) and (max-width: 1000px)'),'Intermediate widths put the title above the charts instead of squeezing three columns');
 check(css.includes('.pub-overview { display: block; padding: 12px 0 0;')&&normal.content.innerHTML.includes('pub-venue-panel-title'),'Mobile stacks the totals and fold control without a duplicate details heading');
 check(phone.content.innerHTML.indexOf('class="pub-overview-summary"')<phone.content.innerHTML.indexOf('class="pub-venue-panel"'),'Mobile source order presents totals before the expandable details');
 check(css.includes('.pub-heading-with-overview { grid-template-columns: minmax(0, 1fr); gap: 14px; }'),'Narrow screens stack the overview below the title');
 check(css.includes('.pub-venue-panel[data-expanded="false"] .pub-venue-row:nth-child(n+3) { display: none; }'),'Each collapsed venue group previews exactly the first two rows');
 check(css.includes('min-height: 18px; line-height: 1.5;')&&!css.includes('min-height: 96px;'),'Compact chart rows replace the previous oversized blank toggle');
 const titlePosition=normal.content.innerHTML.indexOf('class="pub-venue-panel-title"');
 const chartPosition=normal.content.innerHTML.indexOf('id="venue-stats"');
 const togglePosition=normal.content.innerHTML.indexOf('id="venue-stats-toggle"');
 check(titlePosition<chartPosition&&chartPosition<togglePosition,'Desktop source order is title, chart preview, then expand-all action');
 check(normal.content.innerHTML.includes('pub-disclosure-closed">展开全部'),'Toggle explicitly offers the full chart');
 check(normal.content.innerHTML.includes('pub-disclosure-closed')&&normal.content.innerHTML.includes('pub-disclosure-open'),'Disclosure has explicit open and close labels');
 check(pageHeading.includes('class="pub-heading-copy"'),'Title has a stable left-column wrapper for the overview layout');
 console.log('PASS: '+checks+' publication-link checks; no search/filter UI, exact paper links, return-to-all navigation, year jumps and cumulative statistics.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
