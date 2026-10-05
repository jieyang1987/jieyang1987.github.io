'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {pathToFileURL}=require('node:url');
const dir=path.join(__dirname,'..','chrome-paper-helper');
const source=fs.readFileSync(path.join(dir,'background.js'),'utf8').replace(/^import[^\n]+\n/,'');
const direct='https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?arnumber=12345';const viewer='https://ieeexplore.ieee.org/stamp/stamp.jsp?arnumber=12345';const id='00000000-0000-4000-8000-000000000001';
async function harness(){
  const protocol=await import(pathToFileURL(path.join(dir,'protocol.mjs')).href);
  const storage={connection:{server:'http://127.0.0.1:8002',token:'fixture-token'}};
  let job={id,url:'https://ieeexplore.ieee.org/document/12345',articleNumber:'12345',title:'Fixture paper',createdAt:Date.now(),stagingFilename:'PaperManager/'+id+'.pdf',state:'resolving'};
  let links=[viewer],html=false,failUpload=false,allowed=true,remoteStatus=200,remoteDestination='';const calls=[],downloads=[];const tabs=new Map();const listener=()=>({addListener:()=>{}});
  const chrome={permissions:{contains:async request=>typeof allowed==='function'?allowed(request):allowed},runtime:{id:'a'.repeat(32),getManifest:()=>({version:'1.2.0'}),onInstalled:listener(),onStartup:listener(),onMessage:listener()},alarms:{create:async()=>{},onAlarm:listener()},
    storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,structuredClone(storage[k])])),set:async values=>Object.assign(storage,structuredClone(values)),remove:async key=>{delete storage[key];},setAccessLevel:async()=>{}}},
    tabs:{onUpdated:listener(),create:async options=>{const tab={id:1,status:'complete',active:options.active,url:options.url};tabs.set(1,tab);return tab;},get:async key=>{if(!tabs.has(key))throw Error('no tab');return tabs.get(key);},update:async(key,options)=>Object.assign(tabs.get(key),options),remove:async key=>tabs.delete(key)},
    scripting:{executeScript:async()=>[{result:{url:tabs.get(1)?.url,links}}]},downloads:{onChanged:listener(),download:async()=>assert.fail('New workflow must not open Chrome Save As/downloads API'),search:async query=>downloads.filter(d=>query.id?d.id===query.id:true),cancel:async()=>{}}};
  const fetch=async(url,options)=>{
    if(url.startsWith('https://')){calls.push({remote:url,credentials:options.credentials});const response=new Response(html?(typeof html==='string'?html:'<html>Sign in to access this article</html>'):'%PDF-1.4\n'+'.'.repeat(200)+'\n%%EOF',{status:typeof remoteStatus==='function'?remoteStatus(url):remoteStatus,headers:{'Content-Type':html?'text/html':'application/pdf'}});if(remoteDestination)Object.defineProperty(response,'url',{value:remoteDestination});return response;}
    assert(url.startsWith('http://127.0.0.1:8002/api/chrome/extension/'));
    const route=url.split('/').pop();
    if(route==='upload'){calls.push({route,size:options.body.size,headers:options.headers});if(failUpload){failUpload=false;throw Error('temporary local server failure');}job=null;return {ok:true,json:async()=>({ok:true,job:{id,state:'complete'}})};}
    const body=JSON.parse(options.body);calls.push({route,body});
    if(route==='claim')return {ok:true,json:async()=>({ok:true,job})};
    if(route==='progress'){if(job)job.state=body.state;return {ok:true,json:async()=>({ok:true})};}
    if(route==='complete'){job=null;return {ok:true,json:async()=>({ok:true,job:{id,state:'complete'}})};}
    throw Error('Unexpected request');
  };
  function context(){const ctx={...protocol,chrome,fetch,AbortSignal,Date,URL,Blob,Uint8Array,TextDecoder,queueMicrotask,console};vm.createContext(ctx);vm.runInContext(source,ctx);return ctx;}
  const ctx=context();return {ctx,context,storage,calls,downloads,tabs,setJob:value=>{job={...job,...value};},setPermissions:value=>{allowed=value;},setRemoteDestination:value=>{remoteDestination=value;},setRemoteStatus:value=>{remoteStatus=value;},setLinks:value=>{links=value;},setHtml:value=>{html=value;},failUpload:()=>{failUpload=true;},drain:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('Chrome fetches authenticated PDF bytes and uploads directly without invoking Save As',async()=>{
  const h=await harness();await h.ctx.run();await h.ctx.run();await h.drain();assert.equal(h.tabs.get(1).url,viewer);
  h.setLinks([direct]);await h.ctx.run();await h.drain();
  const remote=h.calls.find(c=>c.remote);assert.equal(remote.credentials,'include');
  const upload=h.calls.find(c=>c.route==='upload');assert(upload.size>100);assert.equal(upload.headers['X-Paper-Job'],id);assert.equal(decodeURIComponent(upload.headers['X-Pdf-Source']),direct);assert(!upload.headers.Cookie);
  assert.equal(h.storage.active,undefined);assert.equal(h.tabs.size,0);
});
test('login/verification pages remain manual and never become downloads or uploaded PDFs',async()=>{
  const h=await harness();h.setLinks([direct]);h.setHtml(true);await h.ctx.run();await h.ctx.run();await h.drain();
  assert(h.calls.some(c=>c.route==='progress'&&c.body.state==='needs_attention'));assert(!h.calls.some(c=>c.route==='upload'));
  assert.equal(h.storage.active.phase,'attention');const n=h.calls.filter(c=>c.remote).length;await h.ctx.run();assert.equal(h.calls.filter(c=>c.remote).length,n,'do not keep retrying a verification page');
});
test('a worker restart can retry transfer after a temporary local upload failure',async()=>{
  const h=await harness();h.setLinks([direct]);h.failUpload();await h.ctx.run();await h.ctx.run();await h.drain();assert.equal(h.storage.active.phase,'fetching');
  const restarted=h.context();await restarted.run();assert.equal(h.storage.active,undefined);assert.equal(h.calls.filter(c=>c.route==='upload').length,2);
});
test('legacy downloads in the default Downloads folder can still be handed off safely',async()=>{
  const h=await harness();h.storage.active={id,title:'Fixture',phase:'downloading',downloadId:1,downloadUrl:direct,startedAt:Date.now()};
  h.downloads.push({id:1,url:direct,filename:'C:/Downloads/'+id+'.pdf',byExtensionId:'a'.repeat(32),state:'complete',danger:'safe'});
  await h.ctx.run();assert.equal(h.calls.find(c=>c.route==='complete').body.path,'C:/Downloads/'+id+'.pdf');
});
test('unrelated legacy Chrome downloads are never imported',async()=>{
  const h=await harness();h.storage.active={id,title:'Fixture',phase:'downloading',downloadId:1,downloadUrl:direct,startedAt:Date.now()};
  h.downloads.push({id:1,url:direct,filename:'C:/Downloads/'+id+'.pdf',byExtensionId:'b'.repeat(32),state:'complete',danger:'safe'});
  await h.ctx.run();assert(!h.calls.some(c=>c.route==='complete'));assert(h.storage.lastError.includes('不一致'));
});
test('extension restricts hosts and never asks for cookies permission',async()=>{
  const p=await import(pathToFileURL(path.join(dir,'protocol.mjs')).href);
  for(const url of ['https://example.org','http://example.org','http://127.0.0.1:8002/path','http://user:pass@localhost:8002'])assert.throws(()=>p.serverAddress(url));
  assert.equal(p.serverAddress('http://localhost:8002/'),'http://localhost:8002');assert.equal(p.ieeeUrl(direct.replace('12345','99999'),'12345'),null);assert.equal(p.ieeeUrl('https://evil.example/paper.pdf'),null);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));assert(!manifest.permissions.includes('cookies'));assert(!manifest.host_permissions.includes('<all_urls>'));assert.equal(manifest.version,'1.2.0');assert.deepEqual(manifest.optional_host_permissions,['https://*/*']);assert(!manifest.permissions.includes('tabs'));
});
test('extension and pairing secrets are excluded from the public website release',()=>{
  const {isPublicFile}=require('../build-release');for(const file of ['scripts/chrome-paper-helper/manifest.json','scripts/chrome-paper-helper/background.js','.codex_tmp/chrome-download-bridge.json'])assert.equal(isPublicFile(file),false);assert.equal(isPublicFile('papers/2026_JSSC_Test.pdf'),true);
});


test('non-IEEE OA metadata links can be fetched and uploaded without a save dialog',async()=>{
 const h=await harness();const page='https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2024.1340164/full',pdf=page.replace(/full$/, 'pdf');
 h.setJob({url:page,articleNumber:'',expectedDoi:'10.3389/fnins.2024.1340164'});h.setLinks([{url:pdf,kind:'citation-meta'}]);
 await h.ctx.run();await h.ctx.run();await h.drain();
 assert.equal(h.calls.find(c=>c.remote).remote,pdf);assert(h.calls.some(c=>c.route==='upload'));assert.equal(h.storage.active,undefined);
});
test('an optional site permission pauses before any publisher request and resumes after a user grant',async()=>{
 const h=await harness();h.setJob({url:'https://arxiv.org/pdf/2410.12866',articleNumber:''});h.setPermissions(false);
 await h.ctx.run();assert.equal(h.storage.active.phase,'permission');assert.deepEqual(h.storage.active.requiredAccess.origins,['https://arxiv.org/*']);assert(!h.calls.some(c=>c.remote));
 h.setPermissions(true);await h.ctx.run();await h.drain();assert(h.calls.some(c=>c.route==='upload'));
});
test('an access refusal stops instead of probing more links or retrying automatically',async()=>{
 const h=await harness();h.setJob({url:'https://arxiv.org/pdf/2410.12866',articleNumber:''});h.setRemoteStatus(403);
 await h.ctx.run();assert.equal(h.storage.active.phase,'attention');const n=h.calls.filter(c=>c.remote).length;
 await h.ctx.run();assert.equal(h.calls.filter(c=>c.remote).length,n);assert(!h.calls.some(c=>c.route==='upload'));
});


test('a PDF redirect to a new content host pauses for that origin permission',async()=>{
 const h=await harness();h.setJob({url:'https://arxiv.org/pdf/2410.12866',articleNumber:''});h.setRemoteDestination('https://cdn.frontiersin.org/verified-paper.pdf');h.setPermissions(req=>!req.origins?.includes('https://cdn.frontiersin.org/*'));
 await h.ctx.run();assert.equal(h.storage.active.phase,'permission');assert.deepEqual(h.storage.active.requiredAccess.origins,['https://cdn.frontiersin.org/*']);assert(!h.calls.some(c=>c.route==='upload'));
 h.setPermissions(true);await h.ctx.run();assert(h.calls.some(c=>c.route==='upload'));
});
test('an unavailable explicit PDF link falls through to another link from the same paper page',async()=>{
 const h=await harness();const page='https://www.frontiersin.org/articles/10.3389/fnins.2024.1340164/full';const first=page.replace('full','pdf')+'?download=1',second=page.replace('full','pdf')+'?download=2';
 h.setJob({url:page,articleNumber:'',expectedDoi:'10.3389/fnins.2024.1340164'});h.setLinks([{url:first,kind:'citation-meta'},{url:second,kind:'pdf-link'}]);h.setRemoteStatus(url=>url===first?404:200);
 await h.ctx.run();await h.ctx.run();await h.drain();assert.deepEqual(h.calls.filter(c=>c.remote).map(c=>c.remote),[first,second]);assert(h.calls.some(c=>c.route==='upload'));
});


test('the page scanner reads PDF metadata, alternate links and download anchors without needing IEEE markup',async()=>{
 const h=await harness();const make=(attrs,text='')=>({content:attrs.content,href:attrs.href,textContent:text,getAttribute:key=>attrs[key]||null});
 const meta=make({content:'https://www.mdpi.com/1424-8220/23/21/8882/pdf'});
 const link=make({href:'https://example.org/content/file.pdf',type:'application/pdf'});
 const anchor=make({href:'/download/123'},'Download PDF');
 h.ctx.document={title:'A scientific article',querySelectorAll:selector=>selector.startsWith('meta[')?[meta]:selector.startsWith('link[')?[link]:selector==='a[href]'?[anchor]:[],querySelector:selector=>selector.includes('citation_title')?make({content:'A scientific article'}):null};h.ctx.location={href:'https://example.org/article/123'};
 const result=h.ctx.readPdfLinks();assert(result.links.some(x=>x.kind==='citation-meta'&&x.url.endsWith('/pdf')));assert(result.links.some(x=>x.kind==='pdf-alternate'));assert(result.links.some(x=>x.kind==='pdf-link'&&x.url==='https://example.org/download/123'));assert.equal(result.needsHuman,false);
});

test('an HTML PDF wrapper is opened once even after its URL was already fetched as bytes',async()=>{
 const h=await harness();const page='https://www.frontiersin.org/articles/10.3389/fnins.2024.1340164/full';
 const wrapper=page.replace('/full','/pdf'),pdf='https://cdn.frontiersin.org/paper.pdf';
 h.setJob({url:page,articleNumber:'',expectedDoi:'10.3389/fnins.2024.1340164'});h.setLinks([{url:wrapper,kind:'citation-meta'}]);h.setHtml('<html><title>PDF viewer</title><iframe src="'+pdf+'"></iframe></html>');
 await h.ctx.run();await h.ctx.run();await h.drain();assert.equal(h.tabs.get(1).url,wrapper);assert(h.storage.active.visited.includes(wrapper));
 h.setLinks([{url:pdf,kind:'embedded-pdf'}]);h.setHtml(false);await h.ctx.run();await h.drain();
 assert.deepEqual(h.calls.filter(c=>c.remote).map(c=>c.remote),[wrapper,pdf]);assert(h.calls.some(c=>c.route==='upload'));
});
test('a wrapper pointing back to itself pauses instead of repeatedly fetching or navigating',async()=>{
 const h=await harness();const page='https://www.frontiersin.org/articles/10.3389/fnins.2024.1340164/full',wrapper=page.replace('/full','/pdf');
 h.setJob({url:page,articleNumber:''});h.setLinks([{url:wrapper,kind:'citation-meta'}]);h.setHtml('<html><title>PDF viewer</title></html>');
 await h.ctx.run();await h.ctx.run();await h.drain();await h.ctx.run();await h.drain();
 assert.equal(h.storage.active.phase,'attention');assert.equal(h.calls.filter(c=>c.remote).length,1);assert(!h.calls.some(c=>c.route==='upload'));
});
