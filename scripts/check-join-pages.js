/* Offline checks for equal-visibility academic recruitment and native disclosure behavior. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const data=JSON.parse(read('data/join.json'));
const before=JSON.stringify(data);
const source=read('static/js/en-site.js');
const start=source.indexOf('  async function join() {');
const end=source.indexOf('  const renderers=',start);
assert(start>=0&&end>start);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let checks=0;
function check(value,message){assert(value,message);checks++;}
async function render(lang='zh',hash='',records=data){
 const content={innerHTML:'',handlers:{},addEventListener(type,handler){this.handlers[type]=handler;}};
 const nodes=new Map(),events={},location={hash};let anchors=0;
 function node(id){
  if(!content.innerHTML.includes('id="'+id+'"'))return null;
  if(!nodes.has(id))nodes.set(id,{open:false,focused:false,querySelector(selector){assert.equal(selector,'summary');return {focus:options=>{assert.equal(options.preventScroll,true);this.focused=true;}};}});
  return nodes.get(id);
 }
 const ctx={lang,content,location,window:{addEventListener:(event,handler)=>{events[event]=handler;}},document:{getElementById:node,querySelector:selector=>selector==='.en-join-actions'?{}:null},json:async file=>{assert.equal(file,'data/join.json');return records;},esc,rich:value=>String(value),href:value=>value,t:(en,zh)=>lang==='zh'?zh:en,initialAnchor:()=>{anchors++;}};
 await vm.runInNewContext('('+source.slice(start,end).trim()+')',ctx)();
 return {content,node,events,location,anchors};
}
async function main(){
 const academic=data.directions.filter(d=>d.category==='academic');
 const group=data.categories.find(c=>c.id==='academic');
 for(const lang of ['zh','en']){
  const r=await render(lang),html=r.content.innerHTML;
  const overview=html.match(/<nav class="en-join-overview"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
  check((overview.match(/class="en-join-overview-link"/g)||[]).length===3,lang+': all three openings are shown together');
  check(html.indexOf('</nav>',html.indexOf('class="en-join-overview"'))<html.indexOf('<article'),lang+': all overview links precede any long role content');
  check(html.includes('en-join-grid--academic'),lang+': detailed roles use a full-width stack');
  for(const d of academic){
   check(overview.includes('href="#'+d.id+'"')&&overview.includes('data-join-target="'+d.id+'"'),lang+': existing role anchors remain usable');
   check(overview.includes(esc(d.recruitmentOverview.title[lang]))&&overview.includes(esc(d.recruitmentOverview.summary[lang])),lang+': overview includes a short name and the candidate specialty');
   const article=html.match(new RegExp('<article[^>]*id="'+d.id+'"[\\s\\S]*?<\\/article>'))?.[0]||'';
   const split=article.indexOf('<details');const visible=article.slice(0,split),details=article.slice(split);
   check(visible.includes(esc(d.title[lang])),lang+': title remains visible');
   if(lang==='zh') check(visible.includes(d.background.zh),'Chinese full background remains visible');
   else {
    check(d.backgroundHighlights.en.every(item=>visible.includes(esc(item))),'English concise eligibility checklist is visible');
    check(!visible.includes(esc(d.recruitmentOverview.summary.en)),'English cards do not duplicate the overview summary');
    if(d.backgroundNote?.en) check(details.includes(d.backgroundNote.en),'Supplementary eligibility is retained in details');
   }
   check(details.includes('id="'+d.id+'-details"')&&!/<details[^>]*\bopen(?:\s|=|>)/.test(details),lang+': native details start collapsed');
   check(details.includes('<summary>')&&details.includes('en-join-details-open'),lang+': keyboard-accessible disclosure has open and closed labels');
   for(const work of d.work)check(details.includes(work[lang]),lang+': all work descriptions are retained inside details');
   for(const project of d.projects)check(details.includes(project[lang]),lang+': all supporting projects are retained');
   check(details.includes('<h4>'+esc(d.projectLabel?.[lang]||data.labels.projects[lang])+'</h4>'),lang+': direction-specific section labels override the funded-project default');
   if(d.id==='join-bci-chip') {
    check(details.includes(lang==='zh'?'重点研究方向':'Research priorities'),lang+': unapproved chip projects are presented as research priorities');
    check(!/国家科技重大专项|尖兵|National Science and Technology Major Project|Jianbing|Selected funded projects|项目支持/.test(details),lang+': chip priorities do not imply approved project funding');
   }

   check(details.indexOf(d.work[0][lang])<details.indexOf(d.projects[0][lang]),lang+': work precedes funding information');
   for(const p of d.positions){
    if(group.sharedPositions.some(common=>common[lang]===p[lang]))check(html.includes(esc(p[lang]))&&!details.includes('<li>'+p[lang]+'</li>'),lang+': common positions are shown once at category level');
    else check(details.includes(p[lang]),lang+': specialized roles are preserved');
   }
   check(details.includes(d.researchLink[lang]),lang+': research-detail link retained');
  }
  const company=data.directions.find(d=>d.category==='industry');
  const industry=html.match(new RegExp('<article[^>]*id="'+company.id+'"[\\s\\S]*?<\\/article>'))?.[0]||'';
  if(lang==='zh') check(industry&&!industry.includes('<details')&&industry.includes('class="en-tags"'),'Chinese industry remains expanded with existing tags');
  else {
   check(industry.includes('<details')&&!/<details[^>]*\bopen(?:\s|=|>)/.test(industry),'English industry details start collapsed');
   const visible=industry.split('<details')[0];
   check(company.positions.every(p=>visible.includes(esc(p.en))),'All industry openings remain visible');
   check(company.backgroundHighlights.en.every(item=>visible.includes(esc(item))),'Industry checklist remains visible');
   check(!visible.includes(company.work[0].en),'Industry responsibilities are progressively disclosed');
  }
  for(const item of [...company.projects,...company.work,...company.positions])check(industry.includes(item[lang])||industry.includes(esc(item[lang])),lang+': industry content retained');
  if(lang==='zh') check(industry.includes(company.background.zh),'Chinese industry background retained');
  else check(industry.includes(company.backgroundNote.en),'Industry supplementary background retained');
  check(r.anchors===1,lang+': initial anchor navigation runs after rendering');
  r.content.handlers.click({button:0,target:{closest:()=>({dataset:{joinTarget:'join-bci-decoding'}})}});
  check(r.node('join-bci-decoding-details').open&&r.node('join-bci-decoding-details').focused,lang+': overview activation expands and focuses decoding details');
  check(!r.node('join-bci-chip-details').open&&!r.node('join-bci-system-details').open,lang+': unrelated roles stay collapsed');
  r.content.handlers.click({button:0,ctrlKey:true,target:{closest:()=>({dataset:{joinTarget:'join-bci-chip'}})}});
  check(!r.node('join-bci-chip-details').open,lang+': modified clicks preserve ordinary new-tab behavior');
  r.location.hash='#join-bci-system';r.events.hashchange();
  check(r.node('join-bci-system-details').open,lang+': later URL-fragment navigation reveals the relevant role');
 }
 for(const role of academic){const r=await render('zh','#'+role.id);check(r.node(role.id+'-details').open,'Direct role links open the corresponding details');}
 const companyLink=await render('en','#join-company');check(companyLink.node('join-company-details').open,'English company deep link reveals role details');
 const malformed=await render('zh','#%E0%A4%A');check(malformed.anchors===1,'Malformed URL fragments do not break recruitment rendering');
 const hidden=structuredClone(data);hidden.directions.find(d=>d.id==='join-bci-system').enabled=false;
 check(!(await render('zh','',hidden)).content.innerHTML.includes('data-join-target="join-bci-system"'),'Disabled roles do not leave dead overview links');
 const unsafe=structuredClone(data);unsafe.directions[0].recruitmentOverview.title.zh='<img onerror=bad>';
 check(!(await render('zh','',unsafe)).content.innerHTML.includes('<img onerror=bad>'),'Overview titles cannot inject HTML');
 const css=read('static/css/en-site.css');
 check(css.includes('.en-join-overview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));'),'Three equal desktop overview columns');
 check(css.includes('.en-join-overview { grid-template-columns: minmax(0, 1fr); gap: 8px; }'),'Small screens use compact stacked overview links');
 check(css.includes('.en-join-overview-link:focus-visible')&&css.includes('.en-join-role-details > summary:focus-visible'),'Overview and disclosures have visible keyboard focus');
 check(css.includes('.en-join-role-details[open] .en-join-details-open { display: inline; }'),'Open disclosures show the collapse label');
 check(JSON.stringify(data)===before,'Recruitment rendering does not mutate the source data');
 console.log('PASS: '+checks+' recruitment checks; equal-visibility overview, disclosures, deep links, bilingual content and industry preservation.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
