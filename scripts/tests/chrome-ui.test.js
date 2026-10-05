'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','paper-manager','chrome-ui.js'),'utf8');
function harness(){
  const paper={id:'2026/journals/0',title:'Saved title',url:'https://ieeexplore.ieee.org/document/12345',pdf:''};
  const input={value:'',dispatchEvent:()=>{},isConnected:true};const button={disabled:false,isConnected:true};const status={textContent:'',isConnected:true};
  const elements={'f-title':{value:paper.title},'f-url':{value:paper.url},'f-pdf':input,'f-authors':{value:'Unsaved author draft'},'btn-chrome-pdf':button,'chrome-download-status':status};
  let jobs=[];let refreshTimer;const calls=[],toasts=[];let loadCount=0;
  const ctx={window:{},allPapers:[paper],currentDetailId:paper.id,selectedId:paper.id,document:{getElementById:id=>elements[id]||null},AbortSignal,Event,
    setInterval:callback=>{refreshTimer=callback;},showToast:(...args)=>toasts.push(args),loadData:async()=>{loadCount++;},
    fetch:async(url,options)=>{calls.push({url,body:options.body?JSON.parse(options.body):null});
      if(url.endsWith('/jobs')){jobs=[{id:'job-1',state:'queued',title:paper.title,paperId:paper.id}];return {ok:true,json:async()=>({ok:true,job:jobs[0]})};}
      return {ok:true,json:async()=>({ok:true,jobs})};
    }};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {ctx,paper,input,button,elements,calls,toasts,get loadCount(){return loadCount;},complete:()=>{jobs[0]={...jobs[0],state:'complete',savedPath:'papers/2026_JSSC_Test.pdf',message:'done'};},tick:async()=>{refreshTimer();await new Promise(resolve=>setImmediate(resolve));}};
}
test('Chrome completion updates only PDF and never saves unrelated author drafts',async()=>{
  const h=harness();await h.ctx.window.downloadPdfThroughChrome(h.paper.id);h.complete();await h.tick();
  assert.equal(h.input.value,'papers/2026_JSSC_Test.pdf');assert.equal(h.elements['f-authors'].value,'Unsaved author draft');
  assert.equal(h.button.disabled,false);assert.equal(h.loadCount,1);assert(!h.calls.some(c=>c.url==='/api/paper'));
});
test('an edited PDF input is not overwritten by the asynchronous download result',async()=>{
  const h=harness();await h.ctx.window.downloadPdfThroughChrome(h.paper.id);h.input.value='papers/my-draft.pdf';h.complete();await h.tick();
  assert.equal(h.input.value,'papers/my-draft.pdf');
});
test('switching paper forms does not apply the previous download to the new form',async()=>{
  const h=harness();await h.ctx.window.downloadPdfThroughChrome(h.paper.id);h.elements['f-pdf']={value:'other.pdf'};h.ctx.currentDetailId='other';h.complete();await h.tick();
  assert.equal(h.elements['f-pdf'].value,'other.pdf');assert.equal(h.ctx.currentDetailId,'other');
});
test('unsaved title or URL changes must be saved before a job can be queued',async()=>{
  const h=harness();h.elements['f-title'].value='Changed title';await h.ctx.window.downloadPdfThroughChrome(h.paper.id);
  assert.equal(h.calls.length,0);assert(h.toasts[0][0].includes('先保存'));
});
