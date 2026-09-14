/* Check the actual staged source and public artifact without printing matched secrets. */
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),cp=require('child_process'),crypto=require('crypto');
const {root,isPublicFile,collect}=require('./build-release');
let checks=0;
function check(value,message){assert(value,message);checks++;}
for(const file of ['.cloudbase-upload/index.html','.codex_tmp/preview.html','output/test.png','.env','data/.env','data/.env.json','cloudbaserc.json','scripts/build-release.js','AGENTS.md','deploy_all.bat','static/node_modules/x.js','images/private.pem','static/notes.md'])check(!isPublicFile(file),'Forbidden public artifact entry: '+file);
for(const file of ['join.html','join_en.html','book-item-bci_en.html','book-references_en.html','static/js/en-site.js','data/join.json','images/research1_en.svg'])check(isPublicFile(file),'Required public file allowed: '+file);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/_release.json'),'utf8'));
const expected=collect();
function artifactFiles(dir,rel=''){return fs.readdirSync(dir).flatMap(name=>{const file=rel?rel+'/'+name:name,abs=path.join(dir,name);return fs.statSync(abs).isDirectory()?artifactFiles(abs,file):[file];});}
check(JSON.stringify(artifactFiles(path.join(root,'dist')).sort())===JSON.stringify([...expected,'_release.json'].sort()),'Artifact has no extra files, including stale local output');
check(JSON.stringify(Object.keys(manifest.files))===JSON.stringify(expected),'Artifact manifest must exactly match the public allowlist');
const sensitive=/(?:\bsk-[a-zA-Z0-9_-]{16,}|\bAKID[a-zA-Z0-9]{16,}|\bgh[pousr]_[a-zA-Z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
for(const file of expected){
 const body=fs.readFileSync(path.join(root,'dist',file));
 check(crypto.createHash('sha256').update(body).digest('hex')===manifest.files[file],'Artifact hash matches: '+file);
 if(/\.(?:html|js|json|css|svg|txt|xml)$/.test(file)){
  const text=body.toString('utf8');check(!sensitive.test(text),'Credential-like content blocked in '+file);
  check(!/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(text),'Development host URL blocked in '+file);
 }
}
// Exact-case static references must resolve inside the release on Linux hosts.
const published=new Set(expected);
for(const file of expected){
 if(!/\.(?:html|css)$/.test(file))continue;
 const text=fs.readFileSync(path.join(root,'dist',file),'utf8');
 const refs=file.endsWith('.html')?/(?:href|src|poster)=["']([^"']+)["']/g:/url\(["']?([^)'"\s]+)["']?\)/g;
 for(const match of text.matchAll(refs)){
  let url=match[1].replace(/&amp;/g,'&');
  if(!url||/^(?:[a-z]+:|\/\/|#)/i.test(url))continue;
  url=url.split(/[?#]/)[0];if(!url)continue;
  try{url=decodeURIComponent(url);}catch{throw new Error('Invalid URL encoding in '+file);}
  const target=path.posix.normalize(url.startsWith('/')?url.slice(1):path.posix.join(path.posix.dirname(file),url));
  check(published.has(target)||published.has(target+'index.html'),'Missing public reference: '+file+' → '+target);
 }
}
const probes=['.cloudbase-upload/index.html','.codex_tmp/probe.html','output/probe.png','dist/index.html','.env','.env.local','cloudbaserc.json','private.pem'];
const ignored=cp.execFileSync('git',['check-ignore','--stdin'],{cwd:root,input:probes.join('\n')+'\n',encoding:'utf8'}).trim().split(/\r?\n/);
check(probes.every(p=>ignored.includes(p)),'Git must ignore scratch output and credential fixtures');
// Audit files that would be committed (tracked + non-ignored new files).
const candidates=cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of candidates){
 check(!/(^|\/)(?:\.codex_tmp|\.cloudbase-upload|output|dist|node_modules|\.env(?:\.[^/]*)?|cloudbaserc\.json)(\/|$)/i.test(file),'Local-only file must not enter Git: '+file);
 const abs=path.join(root,file);if(!fs.existsSync(abs)||!fs.statSync(abs).isFile())continue;
 if(/\.(?:html|js|json|css|svg|txt|xml|md|yml|yaml|bat|ps1)$/.test(file))check(!sensitive.test(fs.readFileSync(abs,'utf8')),'Credential-like content blocked from Git: '+file);
}
console.log('PASS: '+checks+' release checks; allowlist, hashes, required new pages, temporary-file exclusion and credential-pattern scan.');
