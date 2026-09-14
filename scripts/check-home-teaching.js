/* Offline tests of the deployed teaching-card renderer and approved homepage copy.
 * The tiny DOM and existing presentation helpers are stubbed; no browser or network is used. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const profile=JSON.parse(read('data/profile.json'));
const home=JSON.parse(read('data/zh-home.json'));
const source=read('static/js/en-home.js');
const start=source.indexOf('  function renderTeachingCards(profile) {');
const end=source.indexOf('  function renderVideoCards(profile) {',start);
assert(start>=0&&end>start,'Find the deployed teaching renderer');
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=value=>String(value||'').replace(/<[^>]*>/g,'');
const safe=value=>{
 if(!value)return '';
 try{const url=new URL(value,'https://local.test/index.html');return ['http:','https:','mailto:','tel:'].includes(url.protocol)?url.href:'';}
 catch(_){return '';}
};
let checks=0;
function check(value,label){assert(value,label);checks++;}
const list={innerHTML:'',hidden:false};
const ctx={document:{getElementById:id=>id==='teaching-resource-links'?list:null},location:{origin:'https://local.test'},URL,escapeHTML:escape,plainText:plain,safeHref:safe};
const render=vm.runInNewContext('('+source.slice(start,end).trim()+')',ctx);
const before=JSON.stringify(profile);
render(profile);
const cards=[...list.innerHTML.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(match=>match[1]);
check(cards.length===3&&!list.hidden,'All three configured resources are visible');
profile.teaching.books.forEach((book,index)=>{
 const card=cards[index];
 check(card.includes('class="teaching-resource-card"'),'Whole card is a link');
 check(card.includes('href="'+escape(safe(book.linkZh))+'"'),'Destination matches the resource record');
 check(card.includes('src="'+escape(safe(book.image))+'"'),'Existing cover image is retained');
 check(card.includes(escape(book.resourceTypeZh))&&card.includes(escape(book.cardTitleZh)),'Resource type and short title remain visible');
 check(card.includes('title="'+escape(book.titleZh)+'"')&&card.includes('aria-label="'+escape(book.resourceTypeZh+'：'+book.titleZh)+'"'),'Full title remains available to hover and assistive technology');
 check(card.includes('loading="lazy"'),'Cover image loads lazily');
 check(!/<(?:strong|b)\b/.test(card),'Card labels are not bolded');
 const external=new URL(safe(book.linkZh)).origin!=='https://local.test';
 check(external?card.includes('target="_blank" rel="noopener"'):!card.includes('target="_blank"'),'Internal/external link behavior is correct');
});
check(profile.teaching.books[0].linkZh==='book-item-bci.html','Online textbook uses a site-relative link');
check(profile.teaching.books[1].linkZh==='https://ieeexplore.ieee.org/document/9648040','Monograph points to its scholarly publication page');
check(!list.innerHTML.includes('127.0.0.1')&&!list.innerHTML.includes('amazon.com'),'Chinese cards contain no preview-only or shopping URLs');
check(JSON.stringify(profile)===before,'Rendering leaves the source metadata unchanged');
render({teaching:{books:[]}});
check(list.hidden&&list.innerHTML==='','Empty resource lists do not leave blank cards');
render({});
check(list.hidden,'Missing teaching resources are handled');
render({teaching:{books:[{titleZh:'<img src=x onerror=bad>Book',cardTitleZh:'" onclick="bad',resourceTypeZh:'<script>bad</script>',linkZh:'book-item-bci.html',image:'javascript:bad()'},{titleZh:'Unsafe',linkZh:'javascript:bad()'},null]}});
check((list.innerHTML.match(/<li>/g)||[]).length===1,'Unsafe destinations and null records are omitted');
check(!list.innerHTML.includes('<script>')&&!list.innerHTML.includes('onclick="bad')&&!list.innerHTML.includes('<img'),'Resource text is escaped and invalid cover URLs are not rendered');
const emptyContext={...ctx,document:{getElementById:()=>null}};
vm.runInNewContext('('+source.slice(start,end).trim()+')',emptyContext)(profile);
check(true,'Pages without teaching cards need no rendering');
const courseStart=source.indexOf('  function renderTeachingCourses(profile) {');
const courseEnd=source.indexOf('  function renderTeachingCards(profile) {',courseStart);
assert(courseStart>=0&&courseEnd>courseStart);
const courseNodes=new Map([['teaching-course-list',{innerHTML:'',hidden:false}],['teaching-collaborators',{innerHTML:'',hidden:false}]]);
const cleaned=[];
const courseContext={document:{getElementById:id=>courseNodes.get(id)||null},escapeHTML:escape,safeRich:value=>{cleaned.push(value);return value;}};
const renderCourses=vm.runInNewContext('('+source.slice(courseStart,courseEnd).trim()+')',courseContext);
renderCourses(profile);
const courseMarkup=courseNodes.get('teaching-course-list').innerHTML;
check((courseMarkup.match(/class="teaching-course-item"/g)||[]).length===5,'Runtime renders all five course records');
for(const course of profile.teaching.courses){
 check(courseMarkup.includes(escape(course.title))&&courseMarkup.includes(course.years)&&courseMarkup.includes(course.institutionZh),'Course title and metadata survive dynamic rendering');
 if(course.levelZh)check(courseMarkup.includes(course.levelZh),'Supplied undergraduate/doctoral course level is retained');
}
const courseByTitle=Object.fromEntries(profile.teaching.courses.map(course=>[course.title,course]));
const biomedical=courseByTitle['Biomedical Circuits and Systems'];
check(biomedical&&biomedical.years==='2026'&&biomedical.institutionZh==='西湖大学'&&biomedical.institutionEn==='Westlake University'&&biomedical.levelZh==='博士生课程'&&biomedical.levelEn==='Doctoral course','2026 Biomedical Circuits and Systems is included as a Westlake doctoral course in both languages');
check(courseByTitle['Digital Circuits'].years==='2023–2026'&&courseByTitle['Digital Circuits'].institutionZh==='西湖大学','Digital Circuits: 2023–2026 at Westlake');
check(courseByTitle['Hardware Description Language and System Simulation'].years==='2021–2023'&&courseByTitle['Hardware Description Language and System Simulation'].institutionZh==='西湖大学','HDL course is at Westlake, not Calgary');
check(courseByTitle['Integrated Circuits Design'].years==='2023'&&courseByTitle['Integrated Circuits Design'].levelZh==='博士课程','IC Design: 2023 doctoral course');
check(courseByTitle['Integrated Micro and Nanotechnology Sensory Systems'].years==='2016–2017'&&courseByTitle['Integrated Micro and Nanotechnology Sensory Systems'].institutionZh==='加拿大卡尔加里大学'&&courseByTitle['Integrated Micro and Nanotechnology Sensory Systems'].levelZh==='研究生课程'&&courseByTitle['Integrated Micro and Nanotechnology Sensory Systems'].levelEn==='Graduate course'&&!courseByTitle['Integrated Micro and Nanotechnology Sensory Systems'].roleZh,'Calgary course retains dates and is labeled as a graduate course in both languages');
check(cleaned.includes(profile.teaching.collaborationZh),'Collaboration note passes through the existing rich-text sanitizer');
for(const url of ['https://mohamadsawan.org/','https://www.ucalgary.ca/labs/integrated-intelligent-sensing/dr-orly-yadid-pecht'])check(courseNodes.get('teaching-collaborators').innerHTML.includes(url),'Co-teacher link retained');
check(!/<(?:strong|b)\b/.test(courseMarkup),'Course list is not bolded');
renderCourses({teaching:{courses:[{title:'<img src=x onerror=bad>Course',years:'<script>bad</script>',institutionZh:'Campus'},null]}});
check(!courseNodes.get('teaching-course-list').innerHTML.includes('<img')&&!courseNodes.get('teaching-course-list').innerHTML.includes('<script>'),'Course text is escaped and null entries ignored');
renderCourses({});
check(courseNodes.get('teaching-course-list').hidden&&courseNodes.get('teaching-collaborators').hidden,'Empty course and collaborator states are hidden');
const copyStart=source.indexOf('  function renderCopy(home) {');
const copyEnd=source.indexOf('  async function renderPublications(',copyStart);
assert(copyStart>=0&&copyEnd>copyStart);
for(const language of ['zh','en']){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',hidden:false});return nodes.get(id);};
 const context={lang:language,document:{getElementById:node},setText:(id,value)=>{if(value)node(id).textContent=value;},escapeHTML:escape,safeHref:safe,safeRich:value=>value};
 const data=JSON.parse(read('data/'+language+'-home.json'));
 vm.runInNewContext('('+source.slice(copyStart,copyEnd).trim()+')',context)(data);
 if(language==='en')check(node('teaching-copy').textContent===data.teaching,'English teaching introduction survives runtime rendering');
 else check(node('teaching-copy').textContent==='','Chinese course list is not overwritten by the old paragraph');
 if(language==='zh')check(node('teaching-materials-copy').textContent===home.teachingMaterials,'Chinese materials paragraph survives runtime rendering');
 else check(node('teaching-materials-copy').textContent===data.teachingMaterials && !/[\u4e00-\u9fff]/.test(data.teachingMaterials),'English homepage gets its own materials paragraph');
}
const css=read('static/css/zh-locale.css');
check(css.includes('.teaching-resource-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr))'),'Desktop resource cards are in one three-column row');
check(css.includes('object-fit: contain;'),'Covers can be shown without cropping');
check(css.includes('.teaching-resource-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }')&&css.includes('.teaching-resource-grid { grid-template-columns: 1fr; }'),'Narrow screens allow the cards to wrap');
check(!css.includes('#teaching-resource-links img'),'Old fixed-size, cropped image styling is removed');
console.log('PASS: '+checks+' teaching checks; approved copy, resource cards, links, source preservation and responsive styles.');
