'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {createScholarWatcher,parseProfile,scholarTitle,profile,robotsAllows,matchPaper,dedupTitleKey,titleKey,DAY,MANUAL_GAP}=require('../paper-manager/scholar-watch');
const USER='6T786i8AAAAJ';
const ROBOTS='User-agent: *\nDisallow: /scholar\nDisallow: /citations?\nAllow: /citations?user=\nDisallow: /citations?*cstart=\nDisallow: /citations?*email_for_op=';
const title='An Energy-Efficient Neural Signal Processor for Wearable Healthcare';
function page(rows=[{sourceId:'one',title,authors:'J Yang, M Sawan',venue:'Test Journal',year:2026}]){
 return '<div id="gsc_prf_in">Jie Yang</div><table><tbody id="gsc_a_b">'+rows.map(r=>`<tr class="other gsc_a_tr"><td class="gsc_a_t"><a class="gsc_a_at" href="/citations?view_op=view_citation&amp;user=${USER}&amp;citation_for_view=${USER}:${r.sourceId}">${r.title}</a><div class="gs_gray">${r.authors}</div><div class="gs_gray">${r.venue}</div></td><td class="gsc_a_y"><span>${r.year||''}</span></td></tr>`).join('')+'</tbody></table>';
}
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'paper-scholar-test-'));t.after(()=>{if(!path.basename(root).startsWith('paper-scholar-test-'))throw Error('unsafe fixture');fs.rmSync(root,{recursive:true,force:true});});
 let time=Date.UTC(2026,8,16,1),html=page(),failure=null,robots=ROBOTS,crossref={message:{items:[]}};const papers=[],calls=[];
 const request=async url=>{calls.push(url);if(url.includes('api.crossref.org')){if(crossref instanceof Error)throw crossref;return JSON.stringify(crossref);}if(url.endsWith('/robots.txt'))return robots;if(failure)throw failure;return html;};
 const make=()=>createScholarWatcher({root,getProfileUrl:()=>`https://scholar.google.com/citations?user=${USER}&hl=en`,readAllPapers:()=>papers,request,now:()=>time});
 const watcher=make();t.after(()=>watcher.stop());
 return {root,watcher,make,papers,calls,setHtml:v=>{html=v;},setFailure:v=>{failure=v;},setRobots:v=>{robots=v;},setCrossref:v=>{crossref=v;},advance:v=>{time+=v;},time:()=>time};
}
test('only the configured public profile is requested; robot rules reject pagination',()=>{
 const p=profile(`https://scholar.google.com/citations?hl=en&user=${USER}`);assert(p.url.startsWith('https://scholar.google.com/citations?user='+USER));assert(robotsAllows(ROBOTS,p.url));assert(!robotsAllows(ROBOTS,p.url+'&cstart=100'));assert(!robotsAllows(ROBOTS,'https://scholar.google.com/scholar?q=anything'));
 assert(!robotsAllows('User-agent: *\nAllow: /\nUser-agent: PaperManagerScholarWatcher\nDisallow: /',p.url));
 for(const u of ['http://localhost/citations?user='+USER,'https://other.example/citations?user='+USER,'https://scholar.google.com/scholar?q=author'])assert.throws(()=>profile(u));
});
test('profile rows decode text, extract author/year, and keep Scholar detail links as links only',()=>{
 const entries=parseProfile(page([{sourceId:'paper',title:'A &amp; B: A <sup>3-D</sup> Paper',authors:'J Yang, M Sawan',venue:'Journal &amp; Proceedings',year:2026}]),profile('https://scholar.google.com/citations?user='+USER));
 assert.equal(entries[0].title,'A & B: A 3-D Paper');assert.equal(entries[0].year,2026);assert.equal(entries[0].publisherUrl,'');assert(entries[0].scholarUrl.includes('view_op=view_citation'));
});
test('verification, unexpected markup and foreign profile rows fail instead of producing empty success',()=>{
 const p=profile('https://scholar.google.com/citations?user='+USER);
 for(const html of ['<html>unusual traffic</html>','<html>Please sign in</html>',page().replaceAll(USER+':one','otherUser:one')])assert.throws(()=>parseProfile(html,p));
});
test('complete matching titles are existing even when other publication metadata differs',()=>{
 const entry={title,authors:'J Yang, M Sawan',year:2026,venue:'Test Journal',doi:'',publisherUrl:''};
 const paper={id:'2026/journals/0',title,authors:'<strong>J. Yang*</strong>, M. Sawan',groupYear:2026,venue:'Test Journal',url:'https://doi.org/10.1234/one'};
 assert.equal(matchPaper(entry,[paper]).status,'existing');assert.equal(matchPaper({...entry,year:2025},[paper]).status,'existing');assert.equal(matchPaper({...entry,venue:'arXiv preprint'},[paper]).status,'existing');
 assert.equal(matchPaper({...entry,doi:'10.1234/one'},[paper]).status,'existing');assert.equal(matchPaper({...entry,title:'An unrelated publication on a different subject'},[paper]).status,'pending');
});
test('daily check is persistent, concurrency-safe and never requests details or extra pages',async t=>{
 const f=fixture(t);const first=await Promise.all([f.watcher.check(),f.watcher.check()]);assert.equal(f.calls.length,2);assert.equal(first[0].entries.length,1);assert.equal(first[0].checking,false);
 assert(!f.calls.some(u=>u.includes('view_op')||u.includes('cstart')));
 const deferred=await f.watcher.check();assert.equal(deferred.deferred,true);assert.equal(f.calls.length,2);
 const restarted=f.make();await restarted.check('automatic');assert.equal(f.calls.length,2);f.advance(DAY);await restarted.check('automatic');assert.equal(f.calls.length,4);assert.equal(restarted.status().entries.length,1);
});
test('manual checks have a minimum interval and do not modify website papers',async t=>{
 const f=fixture(t);f.papers.push({id:'one',title:'Existing unrelated title',authors:'J. Yang'});const before=structuredClone(f.papers);await f.watcher.check();f.advance(MANUAL_GAP-1);await f.watcher.check();assert.equal(f.calls.length,2);f.advance(2);await f.watcher.check();assert.equal(f.calls.length,4);assert.deepEqual(f.papers,before);
});
test('429 preserves last successful candidates and respects a longer Retry-After',async t=>{
 const f=fixture(t);await f.watcher.check();const successful=f.watcher.status().lastSuccessAt;f.advance(MANUAL_GAP);const e=new Error('Scholar rate limit');e.code='blocked';e.retryAfter=3*DAY;f.setFailure(e);
 const failed=await f.watcher.check();assert.equal(failed.lastOutcome,'blocked');assert.equal(failed.lastSuccessAt,successful);assert.equal(failed.entries.length,1);assert(failed.manualAllowedAt>=f.time()+3*DAY);
 const count=f.calls.length;f.advance(DAY);await f.watcher.check();assert.equal(f.calls.length,count);
});
test('a robots refusal stops before loading the profile',async t=>{
 const f=fixture(t);f.setRobots('User-agent: *\nDisallow: /');const result=await f.watcher.check();assert.equal(result.lastOutcome,'policy_blocked');assert.deepEqual(f.calls,['https://scholar.google.com/robots.txt']);
});
test('unexpected profile HTML keeps cached candidates and reports a failure',async t=>{
 const f=fixture(t);await f.watcher.check();f.advance(MANUAL_GAP);f.setHtml('<html>changed layout</html>');const result=await f.watcher.check();assert.equal(result.lastOutcome,'failed');assert.equal(result.entries.length,1);assert.equal(result.lastScanned,1);
});
test('ignoring a candidate persists and duplicate source records do not create repeated candidates',async t=>{
 const f=fixture(t);await f.watcher.check();const id=f.watcher.status().entries[0].id;f.watcher.review(id,true);f.advance(DAY);f.setHtml(page([{sourceId:'two',title,authors:'J Yang, M Sawan',venue:'Test Journal',year:2026}]));await f.watcher.check();assert.equal(f.watcher.status().entries.length,1);assert.equal(f.watcher.status().entries[0].status,'ignored');assert.equal(f.make().status().entries[0].status,'ignored');f.watcher.review(id,false);assert.equal(f.watcher.status().pendingCount,1);
});
function crossref(doi){return {DOI:doi,title:[title],author:[{given:'Jie',family:'Yang'},{given:'Mohamad',family:'Sawan'}],'container-title':['Test Journal'],published:{'date-parts':[[2026]]}};}
test('a single matching Crossref title, author and year hands off a DOI without saving a paper',async t=>{
 const f=fixture(t);await f.watcher.check();const id=f.watcher.status().entries[0].id;f.setCrossref({message:{items:[crossref('10.1234/one')]}});const found=await f.watcher.resolve(id);assert.equal(found.url,'https://doi.org/10.1234/one');assert.equal(f.papers.length,0);
 f.advance(DAY);await f.watcher.check();assert.equal(f.watcher.status().entries[0].doi,'10.1234/one');
 f.papers.push({id:'saved',title,doi:'10.1234/one',url:found.url});assert.equal(f.watcher.status().pendingCount,0);
});
test('ambiguous DOI results require explicit choice and never choose the first result automatically',async t=>{
 const f=fixture(t);await f.watcher.check();const id=f.watcher.status().entries[0].id;f.setCrossref({message:{items:[crossref('10.1234/one'),crossref('10.1234/two')]}});const found=await f.watcher.resolve(id);assert.equal(found.matched,false);assert.equal(found.options.length,2);assert.equal(f.watcher.status().entries[0].doi,'');
 await assert.rejects(()=>f.watcher.resolve(id,'10.1234/not-offered'));assert.equal((await f.watcher.resolve(id,'10.1234/two')).url,'https://doi.org/10.1234/two');
});
test('Crossref failures are cached instead of retrying on every click',async t=>{
 const f=fixture(t);await f.watcher.check();f.setCrossref(new Error('unavailable'));const id=f.watcher.status().entries[0].id;assert.equal((await f.watcher.resolve(id)).ok,false);const count=f.calls.length;await f.watcher.resolve(id);assert.equal(f.calls.length,count);
});
test('automatic checks can be disabled without disabling manual review',async t=>{
 const f=fixture(t);f.watcher.configure(false);await f.watcher.check('automatic');assert.equal(f.calls.length,0);await f.watcher.check('manual');assert.equal(f.calls.length,2);assert.equal(f.make().status().enabled,false);
});


test('a paper disappearing from the first page is not deleted from the candidate archive',async t=>{
 const f=fixture(t);await f.watcher.check();f.advance(DAY);f.setHtml(page([]));await f.watcher.check();assert.equal(f.watcher.status().lastScanned,0);assert.equal(f.watcher.status().entries.length,1);
});
test('watcher state and snapshots stay out of website releases',()=>{
 const {isPublicFile}=require('../build-release');assert.equal(isPublicFile('.codex_tmp/scholar-watch.json'),false);assert.equal(isPublicFile('.codex_tmp/scholar-last-profile-response.html'),false);assert.equal(isPublicFile('scripts/paper-manager/scholar-ui.js'),false);
});


test('an explicit retry after fixing the network is allowed once, but cannot bypass a Scholar block',async t=>{
 const f=fixture(t);const unavailable=new Error('Network unavailable');unavailable.code='network_error';f.setFailure(unavailable);await f.watcher.check();assert.equal(f.watcher.status().lastOutcome,'failed');
 const first=f.calls.length;await f.watcher.check();assert.equal(f.calls.length,first);
 f.setFailure(null);const retried=await f.watcher.check('network-retry');assert.equal(retried.lastOutcome,'success');assert.equal(f.calls.length,first+2);
 const count=f.calls.length;await f.watcher.check('network-retry');assert.equal(f.calls.length,count);
 f.advance(MANUAL_GAP);const blocked=new Error('Blocked');blocked.code='blocked';f.setFailure(blocked);await f.watcher.check();const n=f.calls.length;f.setFailure(null);await f.watcher.check('network-retry');assert.equal(f.calls.length,n);assert.equal(f.watcher.status().lastOutcome,'blocked');
});


test('title-only matches ignore missing or differently formatted authors, years, venues and DOIs',()=>{
 const entry={title:'Neural Signal Processing: A Review',authors:'Different author formatting',year:2024,venue:'arXiv preprint',doi:'10.1234/new'};
 const paper={id:'existing',title:'NEURAL SIGNAL PROCESSING — A REVIEW',authors:'J. Yang',year:2026,venue:'Journal',doi:'10.1234/old'};
 assert.equal(matchPaper(entry,[paper]).status,'existing');assert.equal(matchPaper({...entry,authors:'',year:null},[paper]).status,'existing');
 assert.equal(matchPaper(entry,[paper,{...paper,id:'another'}]).status,'existing');
});
test('minor known title formatting differences are ignored without loosening Crossref DOI matching',()=>{
 assert.equal(dedupTitleKey('A 0.99-to-4.38 uJ/class Processor'),dedupTitleKey('A 0.99-to-4.38 μJ/class Processor'));
 assert.equal(dedupTitleKey('36.6 A Neural Interface','ISSCC'),dedupTitleKey('Neural Interface','ISSCC'));
 assert.equal(dedupTitleKey('The Neural Interface'),dedupTitleKey('Neural Interface'));
 assert.equal(dedupTitleKey('A co-design toward neural prediction'),dedupTitleKey('A co-design towards neural prediction'));
 assert.equal(dedupTitleKey('36.6 A Neural Interface','2026 IEEE International Solid-State Circuits Conference (ISSCC)'),dedupTitleKey('A Neural Interface','ISSCC'));
 assert.notEqual(dedupTitleKey('36.6 A Neural Interface','Journal'),dedupTitleKey('A Neural Interface','Journal'));
 assert.notEqual(titleKey('Toward neural prediction'),titleKey('Towards neural prediction'));
});
test('truncated, corrupt or substantively different titles are not silently hidden',()=>{
 const paper={id:'existing',title:'A 510 μW Neuromorphic Processor With Efficient Neural Signal Processing',authors:'J. Yang',groupYear:2026};
 for(const entry of [
  {title:paper.title,titleTruncated:true},
  {title:paper.title+'…'},
  {title:'A 510 �W Neuromorphic Processor With Efficient Neural Signal Processing'},
  {title:'A 610 μW Neuromorphic Processor With Efficient Neural Signal Processing'},
  {title:'A 510 μW Neuromorphic Processor With Efficient Neural Signal Processing Part II'},
 ])assert.notEqual(matchPaper({...entry,authors:'J Yang',year:2026},[paper]).status,'existing');
});
test('a cached same-title candidate drops out of pending immediately without a new Scholar request',async t=>{
 const f=fixture(t);await f.watcher.check();assert.equal(f.watcher.status().pendingCount,1);const count=f.calls.length;
 f.papers.push({id:'old',title:title.toUpperCase(),authors:'',year:2021,venue:'Other venue'});
 assert.equal(f.watcher.status().pendingCount,0);assert.equal(f.watcher.status().newCandidates,0);assert.equal(f.calls.length,count);
});


test('Scholar SVG math labels preserve micro-units and squared area for exact website matching',()=>{
 const html=String.raw`A 510 <svg class="gs_fsvg" aria-label="\mu"><path d="ignored"/></svg>W 0.738-mm<svg class="gs_fsvg" aria-label="^{2}"><path d="ignored"/></svg> 6.2-pJ/SOP Online Learning Multi-Topology SNN Processor With Unified Computation Engine in 40-nm CMOS`;
 const result=scholarTitle(html);
 assert.equal(result.text,'A 510 μW 0.738-mm² 6.2-pJ/SOP Online Learning Multi-Topology SNN Processor With Unified Computation Engine in 40-nm CMOS');
 assert.equal(result.unresolved,false);
 const entries=parseProfile(page([{sourceId:'math',title:html,authors:'C Fang, J Yang',year:2023,venue:'Journal'}]),profile('https://scholar.google.com/citations?user='+USER));
 const paper={id:'old',title:'A 510μW 0.738-mm² 6.2-pJ/SOP Online Learning Multi-Topology SNN Processor with Unified Computation Engine in 40-nm CMOS'};
 assert.equal(matchPaper(entries[0],[paper]).status,'existing');
 assert.notEqual(matchPaper({...entries[0],title:entries[0].title.replace('510 μW','510 W')},[paper]).status,'existing');
});
test('unknown SVG math remains explicit rather than silently disappearing',()=>{
 const result=scholarTitle('A processor with <svg><path d="unknown"/></svg> precision');assert.equal(result.unresolved,true);assert(result.text.includes('未识别公式'));
});
test('old cached titles are repaired from the saved HTML without new requests or resetting review state',async t=>{
 const f=fixture(t);const html=String.raw`A 510 <svg class="gs_fsvg" aria-label="\mu"></svg>W Neural Processor for Efficient Signal Processing`;
 f.setHtml(page([{sourceId:'one',title:html,authors:'J Yang',year:2026,venue:'Journal'}]));await f.watcher.check();
 const stateFile=path.join(f.root,'.codex_tmp','scholar-watch.json'),snapshot=path.join(f.root,'.codex_tmp','scholar-last-profile-response.html');
 const state=JSON.parse(fs.readFileSync(stateFile));state.titleParserVersion=1;state.entries[0].title='A 510 W Neural Processor for Efficient Signal Processing';state.entries[0].ignored=true;fs.writeFileSync(stateFile,JSON.stringify(state));fs.utimesSync(snapshot,state.lastSuccessAt/1000,state.lastSuccessAt/1000);
 const calls=f.calls.length,lastAttempt=state.lastAttemptAt;
 const updated=f.make().status();assert.equal(updated.entries[0].title,'A 510 μW Neural Processor for Efficient Signal Processing');assert.equal(updated.entries[0].ignored,true);assert.equal(updated.lastAttemptAt,lastAttempt);assert.equal(f.calls.length,calls);
});
