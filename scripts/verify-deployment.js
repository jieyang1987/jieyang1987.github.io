/* Check the remote manifest and representative pages/assets, not just a successful upload. */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
async function verify(){
 const base=new URL(process.env.SITE_URL||process.argv[2]||'');
 if(base.protocol!=='https:')throw new Error('An HTTPS deployment URL is required');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/_release.json'),'utf8'));
 const expected=process.env.GITHUB_SHA||manifest.commit;
 const probes=['index.html','index_en.html','join.html','join_en.html','research.html','publications.html','chip_gallery.html','book-item-bci_en.html','book-references_en.html','static/js/en-site.js','static/css/en-site.css','data/join.json'];
 async function get(file){const url=new URL(file,base);url.searchParams.set('release',expected);const res=await fetch(url,{signal:AbortSignal.timeout(30000)});const body=Buffer.from(await res.arrayBuffer());if(!res.ok)throw new Error(file+': HTTP '+res.status);return body;}
 let last;
 for(let attempt=1;attempt<=6;attempt++){
  try{
   const remote=JSON.parse((await get('_release.json')).toString('utf8'));
   if(remote.commit!==expected||JSON.stringify(remote.files)!==JSON.stringify(manifest.files))throw new Error('Published release manifest does not match this build');
   for(const file of probes){const body=await get(file);if(crypto.createHash('sha256').update(body).digest('hex')!==manifest.files[file])throw new Error('Published content mismatch: '+file);}
   console.log('Verified '+base.origin+': release '+expected.slice(0,12)+', '+probes.length+' page/asset hashes match.');return;
  }catch(error){last=error;console.log('Verification attempt '+attempt+': '+error.message);if(attempt<6)await new Promise(resolve=>setTimeout(resolve,20000));}
 }
 throw last;
}
verify().catch(error=>{console.error(error.message);process.exitCode=1;});
