/* Check the English academic sections against the deployed shared renderers and source records. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const en=JSON.parse(read('data/en-home.json')),zh=JSON.parse(read('data/zh-home.json')),profile=JSON.parse(read('data/profile.json'));
const html=read('index_en.html'),source=read('static/js/en-home.js'),css=read('static/css/en-home.css');
let checks=0;
const check=(condition,message)=>{assert(condition,message);checks++;};
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const before=JSON.stringify(profile);
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',hidden:false});return nodes.get(id);};
const context={document:{documentElement:{lang:'en'},getElementById:node},location:{origin:'https://local.test'},URL,escapeHTML:esc,plainText:s=>String(s||'').replace(/<[^>]*>/g,''),safeRich:s=>s,safeHref:s=>{if(!s)return '';try {const u=new URL(s,'https://local.test/');return ['http:','https:','mailto:','tel:'].includes(u.protocol)?u.href:'';}catch{return '';}}};
const rendered={};
for(const [name,next,input,id] of [['renderPaperAwards','renderTeachingCourses',en,'paper-awards-list'],['renderTeachingCourses','renderTeachingCards',profile,'teaching-course-list'],['renderTeachingCards','renderVideoCards',profile,'teaching-resource-links']]){
 const begin=source.indexOf('  function '+name+'('),end=source.indexOf('  function '+next+'(',begin);
 check(begin>=0&&end>begin,'Renderer can be extracted: '+name);
 const render=vm.runInNewContext('('+source.slice(begin,end).trim()+')',context);render(input);rendered[id]=node(id).innerHTML;
}
const normalize=s=>s.replace(/(href|src)="([^"]*)"/g,(_,attr,url)=>attr+'="'+esc(new URL(url.replace(/&amp;/g,'&'),'https://local.test/').href)+'"').trim();
for(const [id,pattern] of [
 ['paper-awards-list',/<div id="paper-awards-list">([\s\S]*?)<\/div><\/section>/],
 ['teaching-course-list',/<ul class="teaching-course-list" id="teaching-course-list"[^>]*>([\s\S]*?)<\/ul>/],
 ['teaching-resource-links',/<ul class="teaching-resource-grid" id="teaching-resource-links"[^>]*>([\s\S]*?)<\/ul>/]
]){
 check(normalize(html.match(pattern)?.[1]||'')===normalize(rendered[id]),'Static content equals runtime renderer: '+id);
 check(!/[\u4e00-\u9fff]/.test(rendered[id]),'English labels, metadata and disclosure controls: '+id);
}
check(html.includes('<p id="teaching-materials-copy">' + esc(en.teachingMaterials) + '</p>'), 'Static English textbook introduction matches its data');
check(!html.includes('id="about"')&&html.includes('id="honors"')&&html.includes('id="teaching"'),'Biography is in the opening; honors and teaching remain independent');
check(!html.includes('class="content-section about-grid"'),'No legacy biography/teaching split');
check(html.indexOf('id="hero-intro"')<html.indexOf('id="honors"')&&html.indexOf('id="honors"')<html.indexOf('id="teaching"'),'Section order is stable');
check(en.paperAwards.length===zh.paperAwards.length,'All Chinese paper-honor records represented');
en.paperAwards.forEach((a,i)=>{
 const original=zh.paperAwards[i];
 check(a.year===original.year,'Honor year retained '+i);
 check(a.url===(original.url?.replace('publications.html','publications_en.html')),'Known paper links localized, missing links not invented '+i);
 check(a.paperTitle===original.paperTitle,'Publication title preserved '+i);
});
const awards=rendered['paper-awards-list'];
check((awards.split('<details')[0].match(/class="paper-award-item"/g)||[]).length===3,'Three latest English paper honors initially visible');
check(!awards.split('<details')[0].includes('ISCAS') && awards.split('<details')[1].includes('ISCAS'), 'ISCAS is kept inside the English disclosure');
check(awards.includes('View more')&&awards.includes('View less')&&!/<details[^>]*\bopen\b/.test(awards),'English disclosure closed initially');
check((rendered['teaching-course-list'].match(/class="teaching-course-item"/g)||[]).length===5,'Five courses');
check((rendered['teaching-resource-links'].match(/class="teaching-resource-card"/g)||[]).length===3,'Three resource cards');
for(const course of profile.teaching.courses)check(rendered['teaching-course-list'].includes(course.years)&&rendered['teaching-course-list'].includes(course.institutionEn),'Course dates and institution retained');
check(rendered['teaching-resource-links'].includes('book-item-bci_en.html')&&!rendered['teaching-resource-links'].includes('amazon.com'),'English online book and scholarly monograph destination');
check(!/九三学社|Jiusan/.test(JSON.stringify(en.selectedHonors)),'Personal-honor exclusion preserved');
check(css.includes('body[data-en-page="home"] .home-honors-grid')&&css.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'),'Matching two-column desktop layout');
check(css.includes('body[data-en-page="home"] .home-teaching-grid { grid-template-columns: 1fr;'),'Single-column narrow layout');
const copyStart=source.indexOf('  function renderCopy(home) {'),copyEnd=source.indexOf('  async function renderPublications(',copyStart);
check(copyStart>=0&&copyEnd>copyStart,'Homepage copy renderer can be tested');
const copyContext={...context,lang:'en',setText:(id,value)=>{node(id).textContent=value;}};
vm.runInNewContext('('+source.slice(copyStart,copyEnd).trim()+')',copyContext)(en);
check(node('hero-intro').innerHTML===en.introHtml,'Runtime keeps the approved introduction and its links at the top');
check(!source.includes('home.backgroundItems'),'Runtime no longer recreates the removed About list');
check(JSON.stringify(profile)===before,'Metadata not mutated');
console.log('PASS: '+checks+' English academic-section checks; static/runtime agreement, bilingual records, links, disclosures and responsive structure.');
