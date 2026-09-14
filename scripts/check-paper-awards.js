/* Test paper-honor rendering using the actual static and runtime functions.
 * DOM and shared URL/escaping helpers are stubbed; no remote claims or links are verified here. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const home=JSON.parse(read('data/zh-home.json'));
const source=read('static/js/en-home.js');
const begin=source.indexOf('  function renderPaperAwards(home) {');
const end=source.indexOf('  function renderTeachingCourses(profile) {',begin);
assert(begin>=0&&end>begin);
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=value=>{
 if(!value)return '';
 try{const url=new URL(value,'https://yangjie.ac.cn/');return ['http:','https:','mailto:','tel:'].includes(url.protocol)?url.href:'';}
 catch(_){return '';}
};
const target={innerHTML:''};
const context={document:{getElementById:id=>id==='paper-awards-list'?target:null},escapeHTML:escape,safeHref:safe,URL,location:{origin:'https://yangjie.ac.cn'}};
const render=vm.runInNewContext('('+source.slice(begin,end).trim()+')',context);
const buildSource=read('scripts/build-zh-pages.js');
const buildBegin=buildSource.indexOf('function paperAwardItems(items) {');
const buildEnd=buildSource.indexOf('function teachingCourseItems()',buildBegin);
assert(buildBegin>=0&&buildEnd>buildBegin);
function staticRender(data){
 const fn=vm.runInNewContext(buildSource.slice(buildBegin,buildEnd)+'\n paperAwardsContent', {home:data,esc:escape,URL});
 return fn();
}
let checks=0;
function check(condition,message){assert(condition,message);checks++;}
const before=JSON.stringify(home.paperAwards);
render(home);
const html=target.innerHTML;
const normalizeLinks=value=>value.replace(/href="([^"]*)"/g,(_,href)=>'href="'+escape(new URL(href.replace(/&amp;/g,'&'),'https://yangjie.ac.cn/').href)+'"');
check(normalizeLinks(html)===normalizeLinks(staticRender(home)),'Static and dynamic rendering agree for the supplied records');
const collapsed=html.split('<details class="paper-awards-more">')[0];
const older=html.match(/<details class="paper-awards-more">([\s\S]*?)<\/details>/)?.[1]||'';
check((html.match(/class="paper-award-item"/g)||[]).length===8,'All eight supplied entries are retained');
check((collapsed.match(/class="paper-award-item"/g)||[]).length===4,'Only four entries appear outside the disclosure');
check((older.match(/class="paper-award-item"/g)||[]).length===4,'Four older entries are inside the disclosure');
check(!/<details[^>]*\bopen(?:\s|=|>)/.test(html),'Disclosure starts closed');
check([...collapsed.matchAll(/<time datetime="(\d+)">/g)].map(match=>match[1]).join(',')==='2026,2025,2025,2025','Initial view contains the newest four years');
check([...older.matchAll(/<time datetime="(\d+)">/g)].map(match=>match[1]).join(',')==='2023,2023,2023,2022','Older entries remain in descending year order');
check(html.includes('View more')&&html.includes('View less')&&!/查看全部|收起其余/.test(html),'Disclosure uses compact labels without counts');
check((html.match(/<a class="paper-award-title"/g)||[]).length===home.paperAwards.filter(item=>item.url).length,'Only honors with identified papers become links');
for(const item of home.paperAwards.filter(item=>item.url)){
 check(item.url.startsWith('publications.html?paper=')&&item.url.endsWith('#publication-results'),'Identified paper links stay within the publication page');
 check(!!item.paperTitle&&html.includes(escape(item.paperTitle)),'Linked paper title is available in the hover text');
}
check(!/<(?:strong|b)\b/.test(html),'No bold emphasis is added');
check(JSON.stringify(home.paperAwards)===before,'Sorting does not mutate the source records');
for(const item of home.paperAwards){
 check(html.includes(escape(item.venue+' · '+item.distinction)),'Full venue and distinction remain available in the title attribute');
 check(html.includes('datetime="'+item.year+'"'),'Year is preserved');
 check(html.includes('<p class="paper-award-role">'+escape(item.authorRole)+'</p>'),'Author role is preserved');
}
const tbio=home.paperAwards.filter(item=>item.venue==='TBioCAS'&&item.year===2023);
check(tbio.length===2,'Both user-provided TBioCAS records remain separate');
check(tbio.some(item=>item.authorRole==='通讯作者')&&tbio.some(item=>item.authorRole==='通讯作者、共同第一作者'),'TBioCAS records retain their distinct author roles');
check(home.paperAwards.filter(item=>item.distinction==='当期封面').length===2,'Cover selections are not renamed as paper awards');
check(home.paperAwards.some(item=>item.venue==='AICAS'&&item.authorRole==='共同作者'),'AICAS keeps the co-author role rather than corresponding author');
const longVenue=home.paperAwards.find(item=>item.venue.startsWith('National Conference'));
check(!!longVenue.venueShort&&html.includes(escape(longVenue.venueShort+' · '+longVenue.distinction)),'Long conference uses a compact display label');
render({paperAwards:home.paperAwards.slice(0,4)});
check(!target.innerHTML.includes('<details'),'Four or fewer entries need no disclosure');
render({paperAwards:[...home.paperAwards,{year:2027,venue:'Test venue',distinction:'Test honor',authorRole:'Test role'}]});
check(target.innerHTML.indexOf('Test venue')<target.innerHTML.indexOf('半导体学报'),'A newly supplied later year sorts to the front');
check(target.innerHTML.includes('View more')&&target.innerHTML.includes('View less')&&!/查看全部|收起其余/.test(target.innerHTML),'Compact disclosure labels remain stable when records are added');
const linked={paperAwards:[{year:2025,venue:'Test conference',distinction:'Test award',authorRole:'Author',url:'https://example.invalid/paper?a=1&b=2'}]};
render(linked);
check(target.innerHTML.includes('href="https://example.invalid/paper?a=1&amp;b=2"')&&target.innerHTML.includes('target="_blank" rel="noopener"'),'A later user-supplied external URL becomes a safe clickable title');
check(target.innerHTML===staticRender(linked),'Static and runtime external links agree');
render({paperAwards:[{year:2025,venue:'Test',distinction:'Test award',url:'research.html#research2'}]});
check(target.innerHTML.includes('href="https://yangjie.ac.cn/research.html#research2"')&&!target.innerHTML.includes('target="_blank"'),'Internal links remain in the current tab');
const hostile={paperAwards:[{year:2025,venue:'<img src=x onerror=bad>',distinction:'" onclick="bad',authorRole:'<script>bad</script>',url:'javascript:bad()'},null,{year:'2025" bad',venue:'Bad year',distinction:'Ignored'}]};
render(hostile);
check(!target.innerHTML.includes('<img')&&!target.innerHTML.includes('<script>')&&!target.innerHTML.includes('javascript:')&&!target.innerHTML.includes('onclick="bad'),'Metadata is escaped and unsafe URLs are not linked');
check((target.innerHTML.match(/class="paper-award-item"/g)||[]).length===1,'Malformed rows and invalid years are ignored');
check(target.innerHTML===staticRender(hostile),'Static and runtime invalid-input handling agree');
render({paperAwards:[]});check(target.innerHTML==='','An empty list leaves an empty column');
render({});check(target.innerHTML==='','Missing data is handled');
vm.runInNewContext('('+source.slice(begin,end).trim()+')',{...context,document:{getElementById:()=>null}})(home);
check(true,'Pages without the paper-honor container require no rendering');
const css=read('static/css/zh-locale.css');
check(css.includes('.paper-awards-show-less { display: none; }')&&css.includes('.paper-awards-more[open] .paper-awards-show-more { display: none; }'),'Native disclosure changes the visible summary label');
check(/\.paper-award-title \{[^}]*font-weight: 400/.test(css)&&/\.paper-award-role \{[^}]*font-size: 12px;[^}]*font-weight: 400/.test(css),'Titles and secondary author roles use regular, compact typography');
console.log('PASS: '+checks+' paper-honor checks; latest four, disclosure, attribution, duplicate retention and safe metadata.');
