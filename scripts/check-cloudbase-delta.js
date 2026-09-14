'use strict';
const assert=require('assert/strict'),crypto=require('crypto'),fs=require('fs');
const {remoteMatches}=require('./build-cloudbase-delta');
const body=Buffer.from('verified public asset'),sha=crypto.createHash('sha256').update(body).digest('hex'),md5=crypto.createHash('md5').update(body).digest('hex');
let checks=0;
async function test(name,responses,expected,methods){
 const calls=[];
 const request=async(url,options)=>{calls.push(options.method);assert.equal(options.redirect,'error');const r=responses.shift();assert(r,'Unexpected network request');return {ok:r.status===200,status:r.status,headers:new Headers(r.headers||{}),arrayBuffer:async()=>r.body||Buffer.alloc(0)};};
 assert.equal(await remoteMatches(new URL('https://example.test/asset'),body,sha,request),expected,name);assert.deepEqual(calls,methods,name);checks++;
}
(async()=>{
 await test('Strong COS ETag and byte length match',[{status:200,headers:{etag:'"'+md5+'"','content-length':String(body.length)}}],true,['HEAD']);
 await test('Missing remote file must upload',[{status:404}],false,['HEAD']);
 await test('Unknown ETag falls back to actual SHA-256',[{status:200},{status:200,body}],true,['HEAD','GET']);
 await test('Weak ETag is not trusted',[{status:200,headers:{etag:'W/"'+md5+'"','content-length':String(body.length)}},{status:200,body:Buffer.from('outdated')}],false,['HEAD','GET']);
 await test('Wrong length cannot skip upload',[{status:200,headers:{etag:'"'+md5+'"','content-length':'1'}},{status:200,body:Buffer.from('outdated')}],false,['HEAD','GET']);
 await test('Multipart ETag falls back to content check',[{status:200,headers:{etag:'"'+md5+'-2"'}},{status:200,body}],true,['HEAD','GET']);
 await test('HEAD unavailable still checks actual content',[{status:405},{status:200,body}],true,['HEAD','GET']);
 await assert.rejects(remoteMatches(new URL('https://example.test/asset'),body,sha,async()=>({ok:false,status:403,headers:new Headers(),arrayBuffer:async()=>new ArrayBuffer(0)})),/HTTP 403/);checks++;
 const workflow=fs.readFileSync('.github/workflows/deploy.yml','utf8');
 assert(workflow.includes('node scripts/build-cloudbase-delta.js'));assert(workflow.indexOf('tcb hosting deploy ./.cloudbase-upload')<workflow.indexOf('tcb hosting deploy ./dist/_release.json'));assert(!workflow.includes('--prune'));checks++;
 console.log('PASS: '+checks+' incremental CloudBase checks; exact-content skips, conservative fallbacks, failures and final manifest ordering.');
})().catch(error=>{console.error(error);process.exitCode=1;});
