'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','chrome-paper-helper','popup.js'),'utf8');
async function popup(granted=true){
 const controls={};for(const id of ['status','server','code','pair','check','open','grant','permission-info'])controls[id]={value:id==='server'?'http://127.0.0.1:8002/':'',hidden:false,textContent:'',addEventListener:(event,callback)=>{controls[id][event]=callback;}};
 const messages=[],requests=[];let inClick=false;
 const chrome={runtime:{sendMessage:async message=>{messages.push(message);return {ok:true,connected:true,server:'http://127.0.0.1:8002',permissionRequest:{origins:['https://www.mdpi.com/*']},permissionReason:'Need publisher access'};}},permissions:{request:request=>{assert(inClick,'permission request must be within the click gesture');requests.push(request);return Promise.resolve(granted);}}};
 const context={document:{getElementById:id=>controls[id]},chrome};vm.createContext(context);vm.runInContext(source,context);await new Promise(resolve=>setImmediate(resolve));
 return {controls,messages,requests,click:async()=>{inClick=true;controls.grant.click();inClick=false;await new Promise(resolve=>setImmediate(resolve));}};
}
test('new publisher permission is requested only after the user clicks, and only for that origin',async()=>{
 const h=await popup();assert.equal(h.requests.length,0);assert.equal(h.controls.grant.hidden,false);await h.click();assert.equal(h.requests.length,1);assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0])),{origins:['https://www.mdpi.com/*']});assert(h.messages.some(m=>m.action==='check'));
});
test('declining a site permission does not resume the task automatically',async()=>{
 const h=await popup(false);await h.click();assert(!h.messages.some(m=>m.action==='check'));assert(h.controls.status.textContent.includes('未获得权限'));
});
