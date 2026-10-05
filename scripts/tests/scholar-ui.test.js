'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const dir=path.join(__dirname,'..','paper-manager');
function urlContext(allow){
 const input={value:'https://example.org/original',events:[],focus:()=>{},dispatchEvent:event=>input.events.push(event.type)};
 const elements={'url-import-panel':{},'f-title':{value:'Unsaved title'},'paper-import-url':input};
 const ctx={window:{},document:{getElementById:id=>elements[id]||null},confirm:()=>allow,Event};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(dir,'url-import.js'),'utf8'),ctx);return {ctx,input};
}
test('Scholar handoff can prefill an existing URL panel after user confirmation',()=>{
 const h=urlContext(true);assert.equal(h.ctx.window.showUrlImport('https://doi.org/10.1234/paper'),true);assert.equal(h.input.value,'https://doi.org/10.1234/paper');assert.deepEqual(h.input.events,['input']);
});
test('declining Scholar handoff preserves the current unsaved URL draft',()=>{
 const h=urlContext(false);assert.equal(h.ctx.window.showUrlImport('https://doi.org/10.1234/paper'),false);assert.equal(h.input.value,'https://example.org/original');assert.deepEqual(h.input.events,[]);
});
async function scholarContext(data){
 const buttons={'btn-scholar-inbox':{textContent:''},'btn-scholar-check':{disabled:false,textContent:''}};const calls=[],notices=[],timers=[];const storage=new Map();
 const ctx={window:{},document:{getElementById:id=>buttons[id]||null,visibilityState:'visible'},AbortSignal,setInterval:(callback,ms)=>timers.push({callback,ms}),showToast:(...args)=>notices.push(args),localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({ok:true,...data})};}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(dir,'scholar-ui.js'),'utf8'),ctx);await new Promise(resolve=>setImmediate(resolve));return {ctx,buttons,calls,notices,timers};
}
test('status refresh only reads local state and never triggers a new upstream check',async()=>{
 const h=await scholarContext({profileId:'user',lastOutcome:'blocked',lastError:'Rate limited',lastSuccessAt:0,newCandidates:0,pendingCount:0,checking:false});
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/api/scholar/status');assert.equal(h.notices.length,0);
 h.timers.find(t=>t.ms===60000).callback();await new Promise(resolve=>setImmediate(resolve));assert(h.calls.every(c=>c.url==='/api/scholar/status'));
});
test('new candidate notifications are meaningful and not repeated on each local refresh',async()=>{
 const h=await scholarContext({profileId:'user',lastOutcome:'success',lastSuccessAt:12345,newCandidates:2,pendingCount:2,checking:false});assert.equal(h.notices.length,1);assert(h.buttons['btn-scholar-inbox'].textContent.includes('(2)'));
 h.timers.find(t=>t.ms===60000).callback();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.notices.length,1);
});
