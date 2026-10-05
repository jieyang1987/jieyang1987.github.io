'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {proxyConfiguration,proxyUrl,decodeResponseText}=require('../paper-manager/scholar-network');
test('Scholar uses an enabled Windows proxy without changing process-wide networking',()=>{
 const values={ProxyEnable:'0x1',ProxyServer:'127.0.0.1:12002'};const env={};
 const result=proxyConfiguration({env,platform:'win32',readRegistry:key=>values[key]||''});
 assert.equal(result.url,'http://127.0.0.1:12002/');assert.equal(result.source,'windows-system');assert.deepEqual(env,{});
});
test('a disabled Windows proxy is not reused',()=>{
 const result=proxyConfiguration({env:{},platform:'win32',readRegistry:key=>key==='ProxyEnable'?'0x0':'127.0.0.1:12002'});assert.equal(result.source,'direct');assert.equal(result.url,'');
});
test('explicit Scholar proxy overrides general environment proxy and supports protocol mappings',()=>{
 const result=proxyConfiguration({platform:'linux',env:{SCHOLAR_HTTPS_PROXY:'http://localhost:1234',HTTPS_PROXY:'http://localhost:9999'}});assert.equal(result.url,'http://localhost:1234/');
 assert.equal(proxyUrl('http=127.0.0.1:80;https=127.0.0.1:12002'),'http://127.0.0.1:12002/');
 for(const bad of ['socks=localhost:1080','socks5://localhost:1080','http://localhost/path','http://localhost/?secret=x'])assert.throws(()=>proxyUrl(bad));
});


test('response decoding respects Scholar Latin-1 headers and HTML metadata',()=>{
 const value='510µW and 0.738-mm²';const bytes=Buffer.from(value,'latin1');assert.equal(decodeResponseText(bytes,'text/html; charset=ISO-8859-1'),value);
 const html='<meta http-equiv="Content-Type" content="text/html;charset=ISO-8859-1">'+value;assert.equal(decodeResponseText(Buffer.from(html,'latin1'),'text/html'),html);
 assert.equal(decodeResponseText(Buffer.from('μW 中文','utf8'),'application/json'),'μW 中文');
});
