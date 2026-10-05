'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','paper-manager.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const start=script.indexOf('function renderAuthorFormatControl(');
const end=script.indexOf('function escapeAttr(',start);
assert(start>=0&&end>start);
const escape=script.match(/function escapeHtml\(s\) \{[\s\S]*?\n\}/)[0];
function harness(fetch) {
  const input={value:'Wei Zou, Mohamad Sawan*, Jie Yang',dispatchEvent:()=>{}};
  const preview={innerHTML:''};
  const elements={'f-authors':input,'f-authors-formatted-preview':preview};
  const notifications=[];
  const ctx={document:{getElementById:id=>elements[id]},fetch,AbortSignal,Event,showToast:(...v)=>notifications.push(v)};
  vm.createContext(ctx);vm.runInContext(escape+'\n'+script.slice(start,end),ctx);
  return {ctx,input,preview,elements,notifications,button:{textContent:'✦ 格式化作者',disabled:false}};
}
const response=authors=>({ok:true,json:async()=>({ok:true,authors})});
test('author button formats the complete list using only the non-saving endpoint',async()=>{
  const calls=[];const h=harness(async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return response('W. Zou, M. Sawan*, <strong>J. Yang</strong>');});
  await h.ctx.formatAuthorsField('f-authors',h.button);
  assert.deepEqual(calls,[{url:'/api/format-authors',body:{authors:'Wei Zou, Mohamad Sawan*, Jie Yang'}}]);
  assert.equal(h.input.value,'W. Zou, M. Sawan*, <strong>J. Yang</strong>');
  assert.equal(h.preview.innerHTML,'预览：W. Zou, M. Sawan*, <strong>J. Yang</strong>');
  assert.equal(h.button.disabled,false);
  assert(h.notifications[0][0].includes('保存'));
});
test('empty author input does not request formatting',async()=>{
  const h=harness(async()=>assert.fail('must not call API'));h.input.value='  ';
  await h.ctx.formatAuthorsField('f-authors',h.button);assert.equal(h.input.value,'  ');
});
test('an in-flight response cannot overwrite an author edit made meanwhile',async()=>{
  let release;const h=harness(()=>new Promise(resolve=>{release=resolve;}));
  const pending=h.ctx.formatAuthorsField('f-authors',h.button);h.input.value='New draft';
  release(response('Old result'));await pending;
  assert.equal(h.input.value,'New draft');assert.equal(h.preview.innerHTML,'');
  assert.equal(h.button.disabled,false);
});
test('an in-flight response cannot change another paper form',async()=>{
  let release;const h=harness(()=>new Promise(resolve=>{release=resolve;}));
  const pending=h.ctx.formatAuthorsField('f-authors',h.button);
  h.elements['f-authors']={value:'Other paper'};
  release(response('Old result'));await pending;
  assert.equal(h.elements['f-authors'].value,'Other paper');assert.equal(h.preview.innerHTML,'');
});
test('request errors preserve draft text and restore button state',async()=>{
  const h=harness(async()=>{throw Error('test failure');});const before=h.input.value;
  await h.ctx.formatAuthorsField('f-authors',h.button);
  assert.equal(h.input.value,before);assert.equal(h.button.disabled,false);assert.equal(h.notifications[0][1],'error');
});
test('formatted preview escapes all HTML except the exact self-name bold tag',async()=>{
  const h=harness(async()=>response('<img src=x onerror=bad()> <strong>J. Yang*</strong>'));
  await h.ctx.formatAuthorsField('f-authors',h.button);
  assert(!h.preview.innerHTML.includes('<img'));assert(h.preview.innerHTML.includes('<strong>J. Yang*</strong>'));
});
test('format controls exist for both main forms and the autofill author preview',()=>{
  assert.equal((html.match(/renderAuthorFormatControl\('f-authors'\)/g)||[]).length,2);
  assert(html.includes("renderAuthorFormatControl('autofill-edit-authors')"));
});
