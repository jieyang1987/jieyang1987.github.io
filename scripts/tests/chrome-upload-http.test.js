'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {PassThrough}=require('node:stream');const {handleChromeHttp}=require('../paper-manager/chrome-http');
const id='00000000-0000-4000-8000-000000000001';const pdf=Buffer.concat([Buffer.from('%PDF-1.7\n'),Buffer.from([0,255,128,10]),Buffer.alloc(200,42)]);
async function request(headers={},method='POST'){
 const req=new PassThrough();req.method=method;req.headers={'content-type':'application/pdf',authorization:'Bearer test-token','x-paper-job':id,'x-pdf-source':encodeURIComponent('https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?arnumber=12345'),...headers};
 const responseHeaders={};let result;const received=[];
 const res={setHeader:(k,v)=>{responseHeaders[k]=v;},writeHead:status=>{result={status};},end:()=>{}};
 const bridge={authenticate:token=>{if(token!=='test-token'){const e=new Error('unauthorized');e.status=403;throw e;}},complete:async body=>{received.push(body);return {id,state:'complete'};}};
 const pending=handleChromeHttp(req,res,'/api/chrome/extension/upload',bridge,(_,status,body)=>{result={status,body};});req.end(pdf);await pending;
 return {...result,headers:responseHeaders,received};
}
test('authenticated binary handoff preserves PDF bytes without any local-file path',async()=>{
 const r=await request();assert.equal(r.status,200);assert.deepEqual(r.received[0].buffer,pdf);assert.equal(r.received[0].id,id);assert.equal(r.received[0].path,undefined);
});
test('binary upload rejects missing authentication and incorrect MIME type',async()=>{
 assert.equal((await request({authorization:''})).status,403);const r=await request({'content-type':'text/html'});assert.equal(r.status,415);assert.equal(r.received.length,0);
});
test('oversized uploads are rejected before allocating their advertised size',async()=>{
 const r=await request({'content-length':String(100*1024*1024+1)});assert.equal(r.status,413);assert.equal(r.received.length,0);
});
test('extension preflight permits only the declared binary handoff headers',async()=>{
 const r=await request({origin:'chrome-extension://'+'a'.repeat(32)},'OPTIONS');assert.equal(r.status,204);assert(r.headers['Access-Control-Allow-Headers'].includes('X-Paper-Job'));assert.equal(r.headers['Access-Control-Allow-Origin'],'chrome-extension://'+'a'.repeat(32));
});
