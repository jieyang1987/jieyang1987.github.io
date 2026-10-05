'use strict';
// Only the Scholar/Crossref discovery client uses this agent. Global fetch and IEEE credentials are untouched.
const https=require('node:https');const path=require('node:path');const {execFileSync}=require('node:child_process');const zlib=require('node:zlib');
function failure(message,code='network_error'){const e=new Error(message);e.code=code;return e;}
function registryValue(name){
 const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','reg.exe');
 try{return execFileSync(exe,['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings','/v',name],{encoding:'utf8',windowsHide:true,timeout:2000,stdio:['ignore','pipe','pipe']}).match(/\bREG_(?:SZ|DWORD)\s+([^\r\n]+)/i)?.[1]?.trim()||'';}catch{return '';}
}
function proxyUrl(value){
 let raw=String(value||'').trim();
 if(raw.includes(';')||/^(?:http|https|socks)=/i.test(raw)){
  const byProtocol={};for(const part of raw.split(';')){const m=part.trim().match(/^(https?|socks)=(.+)$/i);if(m)byProtocol[m[1].toLowerCase()]=m[2];}
  raw=byProtocol.https||byProtocol.http||'';if(!raw)throw failure('当前代理不是 HTTP(S) 代理；请为 Scholar 配置可用的 HTTP 代理','proxy_configuration');
 }
 if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw))raw='http://'+raw;
 let u;try{u=new URL(raw);}catch{throw failure('Scholar 代理地址格式无效','proxy_configuration');}
 if(!['http:','https:'].includes(u.protocol)||u.pathname!=='/'||u.search||u.hash)throw failure('Scholar 只支持 HTTP(S) 代理地址','proxy_configuration');
 return u.href;
}
function proxyConfiguration({env=process.env,platform=process.platform,readRegistry=registryValue}={}){
 const configured=env.SCHOLAR_HTTPS_PROXY||env.HTTPS_PROXY||env.https_proxy;
 if(configured)return {url:proxyUrl(configured),source:'environment'};
 if(platform==='win32'&&Number.parseInt(readRegistry('ProxyEnable'),16)===1){const server=readRegistry('ProxyServer');if(!server)throw failure('系统代理已开启，但没有可用的 HTTP 代理地址','proxy_configuration');return {url:proxyUrl(server),source:'windows-system'};}
 return {url:'',source:'direct'};
}
function decodeResponseText(bytes,contentType='') {
 const type=String(contentType);
 const hasUtf8Bom=bytes.length>=3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf;
 const declared=type.match(/charset\s*=\s*["']?\s*([a-z0-9._-]+)/i)?.[1];
 let htmlCharset='';
 if(!declared&&(!type||/html/i.test(type)))htmlCharset=bytes.subarray(0,4096).toString('latin1').match(/<meta\b[^>]*charset\s*=\s*["']?\s*([a-z0-9._-]+)/i)?.[1]||'';
 return new TextDecoder(hasUtf8Bom?'utf-8':declared||htmlCharset||'utf-8').decode(bytes);
}
async function requestPublicText(value){
 const url=new URL(value);if(url.protocol!=='https:'||!['scholar.google.com','api.crossref.org'].includes(url.hostname))throw failure('发现服务只允许 Scholar 和 Crossref HTTPS 地址','invalid_source');
 const configuration=proxyConfiguration();
 if(configuration.url){const [major,minor]=process.versions.node.split('.').map(Number);if(!(major>=25||major===24&&minor>=5||major===22&&minor>=21))throw failure('当前 Node 版本不支持此代理方式，请使用 Node 24.5 或更新版本','proxy_configuration');}
 const agent=new https.Agent({keepAlive:false,...(configuration.url?{proxyEnv:{HTTPS_PROXY:configuration.url}}:{})});
 return new Promise((resolve,reject)=>{
  let settled=false,req;const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);agent.destroy();if(error)reject(error);else resolve(result);};
  const timer=setTimeout(()=>{req?.destroy();finish(failure('后台连接来源超时，请确认代理仍在运行'));},20000);
  try{req=https.get(url,{agent,headers:{'User-Agent':'PaperManagerScholarWatcher/1.0',Accept:'text/html,application/json,text/plain','Accept-Encoding':'identity'}},res=>{
   const status=res.statusCode||0,headers=res.headers;
   if(status!==200){res.resume();finish(null,{status,headers,body:'',proxySource:configuration.source});return;}
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){req.destroy();finish(failure('来源响应超过大小限制','invalid_response'));}else chunks.push(chunk);});
   res.on('aborted',()=>finish(failure('来源响应中断，请稍后检查网络')));res.on('error',()=>finish(failure('读取来源时网络连接失败')));
   res.on('end',()=>{try{
    let body=Buffer.concat(chunks);const encoding=String(headers['content-encoding']||'identity').toLowerCase();const options={maxOutputLength:2*1024*1024};
    if(encoding==='gzip')body=zlib.gunzipSync(body,options);else if(encoding==='br')body=zlib.brotliDecompressSync(body,options);else if(encoding==='deflate')body=zlib.inflateSync(body,options);else if(encoding!=='identity')throw Error('Unsupported encoding');
    finish(null,{status,headers,body:decodeResponseText(body,headers['content-type']),proxySource:configuration.source});
   }catch{finish(failure('来源响应格式无效或解压后过大','invalid_response'));}});
  });
  req.on('error',()=>finish(failure('后台无法连接来源服务，请确认已启用的代理和网络连接')));
  }catch{finish(failure('无法建立来源连接，请检查代理配置'));}
 });
}
module.exports={proxyUrl,proxyConfiguration,requestPublicText,decodeResponseText};
