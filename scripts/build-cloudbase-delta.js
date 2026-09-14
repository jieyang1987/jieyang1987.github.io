/* Build a non-destructive CloudBase upload set from the same validated public artifact.
 * Existing COS objects expose a strong MD5 ETag; otherwise verify the downloaded SHA-256.
 * The homepage is always uploaded last by the CLI, and _release.json is sent separately afterwards.
 */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {root,isPublicFile}=require('./build-release');
const hash=(algorithm,body)=>crypto.createHash(algorithm).update(body).digest('hex');
async function remoteMatches(url,body,expectedSha,request=fetch){
 async function call(method){
  for(let attempt=0;attempt<3;attempt++){
   try{return await request(url,{method,redirect:'error',signal:AbortSignal.timeout(20000)});}
   catch(error){if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,1000));}
  }
 }
 const head=await call('HEAD');
 if(head.status===404)return false;
 if(head.ok){
  const etag=head.headers.get('etag')||'',length=head.headers.get('content-length');
  if(/^"[0-9a-f]{32}"$/i.test(etag)&&length!==null&&Number(length)===body.length&&etag.slice(1,-1).toLowerCase()===hash('md5',body))return true;
 }
 const response=await call('GET');
 const remote=Buffer.from(await response.arrayBuffer());
 if(response.status===404)return false;
 if(!response.ok)throw new Error('Remote inspection returned HTTP '+response.status);
 return hash('sha256',remote)===expectedSha;
}
async function buildDelta(){
 const base=new URL(process.env.SITE_URL||'');
 if(base.protocol!=='https:')throw new Error('An HTTPS site URL is required');
 const source=path.join(root,'dist'),out=path.join(root,'.cloudbase-upload');
 const manifest=JSON.parse(fs.readFileSync(path.join(source,'_release.json'),'utf8'));
 const files=Object.keys(manifest.files).sort();
 if(files.some(file=>!isPublicFile(file)||file.includes('..')||path.isAbsolute(file)))throw new Error('Unexpected release path');
 // Refuse to reuse stale staging content. Each Actions checkout starts with a fresh directory.
 if(fs.existsSync(out))throw new Error('CloudBase staging directory already exists; use a fresh checkout.');
 fs.mkdirSync(out);
 let cursor=0,unchanged=0,changed=0,bytes=0;
 async function worker(){
  while(cursor<files.length){
   const file=files[cursor++],body=fs.readFileSync(path.join(source,file));
   if(hash('sha256',body)!==manifest.files[file])throw new Error('Local artifact hash mismatch: '+file);
   const url=new URL(file,base);url.searchParams.set('release',manifest.commit);
   // Re-send the homepage even when cached metadata matches, so it remains the final entry update.
   if(file!=='index.html'&&await remoteMatches(url,body,manifest.files[file])){unchanged++;continue;}
   const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);changed++;bytes+=body.length;
  }
 }
 await Promise.all(Array.from({length:6},worker));
 console.log('CloudBase: '+unchanged+' identical files skipped; '+changed+' files ('+bytes+' bytes) to upload. No remote files are deleted.');
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'changed_count='+changed+'\n');
 return {unchanged,changed,bytes};
}
if(require.main===module)buildDelta().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={remoteMatches};
