'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createChromeBridge,validatePdf}=require('../paper-manager/chrome-bridge');
function pdfBytes(){
  const stream='BT /F1 12 Tf 40 700 Td (Chrome paper import test) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let body='%PDF-1.4\n';const offsets=[0];
  objects.forEach((value,i)=>{offsets.push(Buffer.byteLength(body));body+=(i+1)+' 0 obj\n'+value+'\nendobj\n';});
  const offset=Buffer.byteLength(body);body+='xref\n0 6\n0000000000 65535 f \n';
  for(const n of offsets.slice(1))body+=String(n).padStart(10,'0')+' 00000 n \n';
  return Buffer.from(body+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF\n');
}
const pdf=pdfBytes();
const direct='https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?arnumber=12345';
function fixture(t,options={}){
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'paper-chrome-test-')));
  t.after(()=>{if(!path.basename(root).startsWith('paper-chrome-test-'))throw Error('Unsafe fixture');fs.rmSync(root,{recursive:true,force:true});});
  const downloads=path.join(root,'Downloads');fs.mkdirSync(path.join(downloads,'PaperManager'),{recursive:true});
  fs.mkdirSync(path.join(root,'data','publications'),{recursive:true});fs.mkdirSync(path.join(root,'papers'));
  const file=path.join(root,'data','publications','2026.json');
  const original={title:'A Test of Chrome Import',authors:'<strong>J. Yang*</strong>, M. Sawan*',venue:'IEEE Journal of Solid-State Circuits',url:'https://ieeexplore.ieee.org/document/12345',doi:'10.1109/test',pdf:'',award:'Keep award',titleEn:'Keep translation',custom:{keep:true}};
  fs.writeFileSync(file,JSON.stringify({journals:[{year:2026,items:[original]}],conferences:[]}));
  const read=()=>JSON.parse(fs.readFileSync(file,'utf8'));
  const write=value=>fs.writeFileSync(file,JSON.stringify(value));
  const readAllPapers=()=>read().journals.flatMap(group=>group.items.map((p,index)=>({...p,id:'2026/journals/'+index,section:'journals',groupYear:group.year,index,file:'data/publications/2026.json',year:2026})));
  const make=()=>createChromeBridge({root,readAllPapers,...options});const bridge=make();
  const code=bridge.newPairing(downloads).code;const extensionId='a'.repeat(32);const {token}=bridge.pair({code,extensionId});
  const begin=()=>{const job=bridge.enqueue('2026/journals/0');bridge.claim();bridge.progress({id:job.id,state:'downloading',downloadUrl:direct});return job;};
  const source=job=>path.join(downloads,'PaperManager',job.id+'.pdf');
  const complete=(job,extra={})=>bridge.complete({id:job.id,path:source(job),sourceUrl:direct,...extra});
  return {root,downloads,file,original,bridge,make,read,write,begin,source,complete,token,extensionId};
}
test('PDF validator parses a valid PDF and rejects HTML disguised as a PDF',async()=>{
  await validatePdf(pdf);
  await assert.rejects(()=>validatePdf(Buffer.from('<html>Sign in</html>')));
});
test('pairing is one-time, origin-bound, persistent and absent from public status',t=>{
  const f=fixture(t);assert.throws(()=>f.bridge.pair({code:'bad',extensionId:f.extensionId}));
  assert.throws(()=>f.bridge.authenticate('wrong','chrome-extension://'+f.extensionId));
  assert.throws(()=>f.bridge.authenticate(f.token,'chrome-extension://'+'b'.repeat(32)));
  assert(!JSON.stringify(f.bridge.status()).includes(f.token));
  const restarted=f.make();restarted.authenticate(f.token,'chrome-extension://'+f.extensionId);assert.equal(restarted.status().connected,true);
});
test('completed download is canonically named, linked without dropping metadata, and idempotent',async t=>{
  const f=fixture(t);const job=f.begin();fs.writeFileSync(f.source(job),pdf);
  const result=await f.complete(job);assert.equal(result.state,'complete');
  assert.equal(result.savedPath,'papers/2026_JSSC_A_Test_of_Chrome_Import.pdf');
  assert.deepEqual(f.read().journals[0].items[0],{...f.original,pdf:result.savedPath});
  assert.deepEqual(fs.readFileSync(path.join(f.root,result.savedPath)),pdf);
  assert(fs.existsSync(f.source(job)),'Chrome staging copy retained');
  assert.equal((await f.complete(job)).savedPath,result.savedPath);assert.equal(fs.readdirSync(path.join(f.root,'papers')).length,1);
});
test('duplicate clicks reuse a job; existing destination is not overwritten',async t=>{
  const f=fixture(t);const job=f.begin();assert.equal(f.bridge.enqueue('2026/journals/0').id,job.id);
  const existing=path.join(f.root,'papers','2026_JSSC_A_Test_of_Chrome_Import.pdf');fs.writeFileSync(existing,'original content');fs.writeFileSync(f.source(job),pdf);
  const result=await f.complete(job);assert.equal(result.savedPath,'papers/2026_JSSC_A_Test_of_Chrome_Import_2.pdf');assert.equal(fs.readFileSync(existing,'utf8'),'original content');
});
test('row movement and unrelated edits during parsing do not misassociate or overwrite',async t=>{
  let onParse;const f=fixture(t,{checkPdf:async()=>onParse()});
  const job=f.begin();fs.writeFileSync(f.source(job),pdf);
  onParse=()=>{const d=f.read();d.journals[0].items[0].authors='Edited author';d.journals[0].items.unshift({title:'Other',url:'https://example.org',pdf:''});f.write(d);};
  const result=await f.complete(job);assert.equal(result.paperId,'2026/journals/1');assert.equal(f.read().journals[0].items[0].pdf,'');
  assert.equal(f.read().journals[0].items[1].authors,'Edited author');assert.equal(f.read().journals[0].items[1].award,'Keep award');
});
test('a newly edited PDF association is never overwritten',async t=>{
  const f=fixture(t);const job=f.begin();fs.writeFileSync(f.source(job),pdf);
  const d=f.read();d.journals[0].items[0].pdf='papers/user-choice.pdf';f.write(d);
  await assert.rejects(()=>f.complete(job),/不会覆盖/);assert.equal(f.read().journals[0].items[0].pdf,'papers/user-choice.pdf');assert(fs.existsSync(f.source(job)));
});
test('renamed/deleted paper identity is rejected rather than using an obsolete row index',async t=>{
  const f=fixture(t);const job=f.begin();fs.writeFileSync(f.source(job),pdf);const d=f.read();d.journals[0].items[0].title='Another paper';f.write(d);
  await assert.rejects(()=>f.complete(job),/为避免误关联/);assert.equal(f.read().journals[0].items[0].pdf,'');
});
test('HTML, mismatched document ID and unregistered paths never enter papers',async t=>{
  for(const mode of ['html','path','url'])await t.test(mode,async t=>{
    const f=fixture(t);const job=f.begin();fs.writeFileSync(f.source(job),mode==='html'?Buffer.from('<html>'+'.'.repeat(200)+'</html>'):pdf);
    const extra=mode==='path'?{path:path.join(f.root,'outside.pdf')}:mode==='url'?{sourceUrl:direct.replace('12345','99999')}:{};
    await assert.rejects(()=>f.complete(job,extra));assert.equal(fs.readdirSync(path.join(f.root,'papers')).length,0);assert.deepEqual(f.read().journals[0].items[0],f.original);
  });
});
test('JSON write failure rolls back the new published copy and keeps the original download',async t=>{
  const f=fixture(t,{persist:(file,data)=>{if(file.endsWith('2026.json'))throw Error('disk failure');fs.writeFileSync(file,JSON.stringify(data));}});
  const job=f.begin();fs.writeFileSync(f.source(job),pdf);await assert.rejects(()=>f.complete(job),/保存失败/);
  assert.equal(fs.readdirSync(path.join(f.root,'papers')).length,0);assert(fs.existsSync(f.source(job)));assert.deepEqual(f.read().journals[0].items[0],f.original);
});
test('a restart recovers a committed association without duplicating the file',async t=>{
  const f=fixture(t);const job=f.begin();fs.writeFileSync(f.source(job),pdf);const completed=await f.complete(job);
  const stateFile=path.join(f.root,'.codex_tmp','chrome-download-bridge.json');const state=JSON.parse(fs.readFileSync(stateFile));state.jobs[0].state='importing';fs.writeFileSync(stateFile,JSON.stringify(state));
  const restarted=f.make();restarted.authenticate(f.token,'chrome-extension://'+f.extensionId);
  const result=await restarted.complete({id:job.id,path:f.source(job),sourceUrl:direct});assert.equal(result.state,'complete');assert.equal(result.savedPath,completed.savedPath);assert.equal(fs.readdirSync(path.join(f.root,'papers')).length,1);
});
test('cancelled jobs do not import files and preserve downloads',async t=>{
  const f=fixture(t);const job=f.begin();fs.writeFileSync(f.source(job),pdf);f.bridge.cancel(job.id);
  await assert.rejects(()=>f.complete(job),/终止/);assert(fs.existsSync(f.source(job)));assert.equal(f.bridge.claim(),null);
});


test('staging inside the public papers folder is rejected before pairing',t=>{
  const f=fixture(t);assert.throws(()=>f.bridge.newPairing(path.join(f.root,'papers')),/不能放在网站/);
});
test('a restart after copying but before JSON commit reuses the verified copy',async t=>{
  const f=fixture(t);const job=f.begin();fs.writeFileSync(f.source(job),pdf);const completed=await f.complete(job);
  const data=f.read();data.journals[0].items[0].pdf='';f.write(data);
  const stateFile=path.join(f.root,'.codex_tmp','chrome-download-bridge.json');const state=JSON.parse(fs.readFileSync(stateFile));state.jobs[0].state='importing';fs.writeFileSync(stateFile,JSON.stringify(state));
  const restarted=f.make();restarted.authenticate(f.token,'chrome-extension://'+f.extensionId);
  const result=await restarted.complete({id:job.id,path:f.source(job),sourceUrl:direct});assert.equal(result.savedPath,completed.savedPath);assert.equal(fs.readdirSync(path.join(f.root,'papers')).length,1);
});


test('direct byte upload saves to papers without requiring a Chrome download location',async t=>{
  const f=fixture(t);const job=f.begin();fs.rmSync(f.downloads,{recursive:true});
  const result=await f.bridge.complete({id:job.id,sourceUrl:direct,buffer:pdf});
  assert.equal(result.state,'complete');assert(fs.existsSync(path.join(f.root,result.savedPath)));
  assert.deepEqual(f.read().journals[0].items[0],{...f.original,pdf:result.savedPath});
});
test('failed legacy root-folder download can be recovered without moving or downloading again',async t=>{
  const f=fixture(t);const job=f.begin();const source=path.join(f.downloads,job.id+'.pdf');fs.writeFileSync(source,pdf);
  f.bridge.progress({id:job.id,state:'failed',reason:'path_mismatch'});
  const result=await f.bridge.recover(job.id);assert.equal(result.state,'complete');assert(fs.existsSync(source));assert(fs.existsSync(path.join(f.root,result.savedPath)));
});
test('legacy helper version blocks new Save As jobs until the extension is reloaded',t=>{
  const f=fixture(t);f.bridge.claim({});assert.throws(()=>f.bridge.enqueue('2026/journals/0'),/旧版/);f.bridge.claim({version:'1.1.0'});assert.equal(f.bridge.enqueue('2026/journals/0').state,'queued');
});


test('atomic state updates retry transient Windows/Dropbox file locks',t=>{
  const f=fixture(t);const original=fs.renameSync;let failures=2;
  t.mock.method(fs,'renameSync',(from,to)=>{if(String(to).endsWith('chrome-download-bridge.json')&&failures>0){failures--;const error=new Error('temporary lock');error.code='EBUSY';throw error;}return original(from,to);});
  const job=f.begin();assert.equal(failures,0);assert.equal(f.bridge.status().jobs[0].id,job.id);
});


test('a non-IEEE paper can be queued and its authenticated PDF bytes are archived through the same pipeline',async t=>{
 const f=fixture(t);const d=f.read();const p=d.journals[0].items[0];p.url='https://www.frontiersin.org/articles/10.3389/fnins.2024.1340164/full';p.doi='10.3389/fnins.2024.1340164';p.pdf='https://www.frontiersin.org/articles/10.3389/fnins.2024.1340164/pdf';f.write(d);
 f.bridge.claim({version:'1.1.0'});assert.throws(()=>f.bridge.enqueue('2026/journals/0'),/v1.2/);
 f.bridge.claim({version:'1.2.0'});const job=f.bridge.enqueue('2026/journals/0');const claimed=f.bridge.claim();assert.equal(claimed.pdfHints[0].url,p.pdf);
 f.bridge.progress({id:job.id,state:'downloading',downloadUrl:p.pdf,pageDoi:p.doi});const result=await f.bridge.complete({id:job.id,sourceUrl:p.pdf,buffer:pdf});assert.equal(result.state,'complete');assert.equal(f.read().journals[0].items[0].pdf,result.savedPath);assert.equal(f.read().journals[0].items[0].award,'Keep award');
});
test('a page DOI mismatch stops a generic publisher download before registration',t=>{
 const f=fixture(t);const d=f.read();d.journals[0].items[0].url='https://www.mdpi.com/1424-8220/23/21/8882';d.journals[0].items[0].doi='10.3390/s23218882';f.write(d);f.bridge.claim({version:'1.2.0'});const job=f.bridge.enqueue('2026/journals/0');
 assert.throws(()=>f.bridge.progress({id:job.id,state:'downloading',downloadUrl:'https://www.mdpi.com/1424-8220/23/21/8882/pdf',pageDoi:'10.3390/s23219999'}),/DOI/);assert.equal(f.read().journals[0].items[0].pdf,'');
});
