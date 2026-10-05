'use strict';
function readJson(req) {
  return new Promise((resolve,reject)=>{
    let size=0,body='';let failed=false;
    req.on('data',chunk=>{size+=chunk.length;if(size>16384){if(!failed){failed=true;const e=new Error('请求过大');e.status=413;reject(e);}return;}body+=chunk;});
    req.on('error',reject);
    req.on('end',()=>{if(failed)return;try{const value=JSON.parse(body||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error();resolve(value);}catch{const e=new Error('无效的 JSON 请求');e.status=400;reject(e);}});
  });
}
function readPdfBody(req) {
  return new Promise((resolve,reject)=>{
    const limit=100*1024*1024;let size=0;const chunks=[];let failed=false;
    const stop=(message,status)=>{if(failed)return;failed=true;chunks.length=0;const e=new Error(message);e.status=status;reject(e);};
    if(Number(req.headers['content-length'])>limit){req.resume();stop('PDF 超过 100 MB 限制',413);return;}
    req.on('data',chunk=>{if(failed)return;size+=chunk.length;if(size>limit){stop('PDF 超过 100 MB 限制',413);return;}chunks.push(chunk);});
    req.on('error',()=>stop('PDF 传输中断',400));req.on('aborted',()=>stop('PDF 传输中断',400));
    req.on('end',()=>{if(!failed)resolve(Buffer.concat(chunks));});
  });
}
async function handleChromeHttp(req,res,pathname,bridge,sendJson) {
  res.setHeader('Cache-Control','no-store');
  try{
    const extension=pathname.startsWith('/api/chrome/extension/');
    if(extension){
      const origin=req.headers.origin;
      if(origin&&!/^chrome-extension:\/\/[a-p]{32}$/.test(origin))return sendJson(res,403,{ok:false,error:'只允许 Chrome 助手访问此接口'});
      if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
      if(req.method==='OPTIONS'){
        if(!origin)return sendJson(res,403,{ok:false,error:'缺少扩展来源'});
        res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Paper-Job, X-Pdf-Source');
        if(req.headers['access-control-request-private-network']==='true')res.setHeader('Access-Control-Allow-Private-Network','true');
        res.writeHead(204);return res.end();
      }
      if(req.method!=='POST')return sendJson(res,405,{ok:false,error:'只支持 POST'});
      const route=pathname.slice('/api/chrome/extension/'.length);
      if(route!=='pair')bridge.authenticate(String(req.headers.authorization||'').replace(/^Bearer /,''),origin);
      if(route==='upload'){
        if(!String(req.headers['content-type']||'').startsWith('application/pdf'))return sendJson(res,415,{ok:false,error:'只接受 PDF 文件内容'});
        let sourceUrl;try{sourceUrl=decodeURIComponent(String(req.headers['x-pdf-source']||''));}catch{return sendJson(res,400,{ok:false,error:'PDF 来源无效'});}
        const id=String(req.headers['x-paper-job']||'');
        if(!/^[0-9a-f-]{36}$/.test(id))return sendJson(res,400,{ok:false,error:'任务编号无效'});
        const buffer=await readPdfBody(req);
        return sendJson(res,200,{ok:true,job:await bridge.complete({id,sourceUrl,buffer})});
      }
      const body=await readJson(req);
      if(route==='pair'){
        if(origin&&origin!=='chrome-extension://'+body.extensionId)return sendJson(res,403,{ok:false,error:'扩展身份不匹配'});
        return sendJson(res,200,{ok:true,...bridge.pair(body)});
      }
      if(route==='claim')return sendJson(res,200,{ok:true,job:bridge.claim(body)});
      if(route==='progress')return sendJson(res,200,{ok:true,job:bridge.progress(body)});
      if(route==='complete')return sendJson(res,200,{ok:true,job:await bridge.complete(body)});
    }else{
      if(pathname==='/api/chrome/status'&&req.method==='GET')return sendJson(res,200,{ok:true,...bridge.status()});
      if(req.method==='POST'){
        const body=await readJson(req);
        if(pathname==='/api/chrome/pairing')return sendJson(res,200,{ok:true,...bridge.newPairing(body.downloadRoot)});
        if(pathname==='/api/chrome/jobs')return sendJson(res,200,{ok:true,job:bridge.enqueue(body.paperId)});
        if(pathname==='/api/chrome/recover')return sendJson(res,200,{ok:true,job:await bridge.recover(body.id)});
        if(pathname==='/api/chrome/cancel')return sendJson(res,200,{ok:true,job:bridge.cancel(body.id)});
      }
    }
    return sendJson(res,404,{ok:false,error:'接口不存在'});
  }catch(error){return sendJson(res,error.status||500,{ok:false,error:error.status?error.message:'Chrome 助手处理失败，请检查本机文件或配置'});}
}
module.exports={handleChromeHttp,readJson};
