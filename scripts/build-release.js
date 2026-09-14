/* Build a public-only static artifact. No repository, scripts, credentials or scratch files. */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
const pages=['index.html','index_en.html','research.html','research_en.html','publications.html','publications_en.html','chip_gallery.html','chip_gallery_en.html','coverage.html','coverage_en.html','join.html','join_en.html','book-item-bci.html','book-item-bci_en.html','book-references_en.html','bci_book.html'];
const topFiles=[...pages,'robots.txt','sitemap.xml'];
const assetTypes={static:new Set(['.html','.css','.js','.map','.woff2','.woff','.ttf','.ico','.svg','.png','.jpg','.jpeg','.webp','.gif']),images:new Set(['.svg','.png','.jpg','.jpeg','.webp','.gif','.ico']),book:new Set(['.html','.css','.js','.svg','.png','.jpg','.jpeg','.webp','.gif','.wmf']),papers:new Set(['.pdf']),data:new Set(['.json'])};
function isPublicFile(file){
 const parts=file.split('/');
 if(parts.some(p=>p.startsWith('.')||/^(?:node_modules|output|dist|__pycache__)$/i.test(p)))return false;
 if(file==='static/assets/fonts/inter/OFL.txt')return true;
 return parts.length===1?topFiles.includes(file)||file==='CNAME':Boolean(assetTypes[parts[0]]?.has(path.posix.extname(file).toLowerCase()));
}
function collect(){
 const files=[];
 function walk(rel){
  const abs=path.join(root,rel),stat=fs.lstatSync(abs);
  if(stat.isSymbolicLink())throw new Error('Release sources must not be symbolic links: '+rel);
  if(stat.isDirectory())for(const entry of fs.readdirSync(abs).sort())walk(rel+'/'+entry);
  else if(stat.isFile()&&isPublicFile(rel))files.push(rel);
 }
 for(const file of topFiles){if(!fs.existsSync(path.join(root,file)))throw new Error('Missing page: '+file);walk(file);}
 if(fs.existsSync(path.join(root,'CNAME')))walk('CNAME');
 for(const folder of Object.keys(assetTypes))walk(folder);
 return files.sort();
}
function build(){
 const out=path.resolve(root,'dist');
 // Fixed child of the repository; never follow an output symlink during cleanup.
 if(path.dirname(out)!==root||path.basename(out)!=='dist')throw new Error('Unsafe release directory');
 if(fs.existsSync(out)&&fs.lstatSync(out).isSymbolicLink())throw new Error('Release directory cannot be a symlink');
 const files=collect();
 // Dropbox can hold directory handles on Windows. Prune stale files rather than
 // removing the output root; reject links before touching any generated path.
 const keep=new Set([...files,'_release.json']);
 function prune(dir,relative=''){
  for(const name of fs.readdirSync(dir)){
   const file=relative?relative+'/'+name:name,abs=path.resolve(dir,name);
   if(!abs.startsWith(out+path.sep))throw new Error('Unsafe generated path');
   const stat=fs.lstatSync(abs);
   if(stat.isSymbolicLink())throw new Error('Generated directory contains a symlink: '+file);
   if(stat.isDirectory())prune(abs,file);
   else if(!keep.has(file))fs.unlinkSync(abs);
  }
 }
 fs.mkdirSync(out,{recursive:true});
 prune(out);
 const hashes={};
 for(const file of files){const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});const body=fs.readFileSync(path.join(root,file));fs.writeFileSync(target,body);hashes[file]=crypto.createHash('sha256').update(body).digest('hex');}
 const commit=process.env.GITHUB_SHA||cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 fs.writeFileSync(path.join(out,'_release.json'),JSON.stringify({commit,files:hashes},null,2)+'\n');
 console.log('Public release: '+files.length+' files, output dist/; local and development files excluded.');
 return {files,commit};
}
if(require.main===module)build();
module.exports={root,pages,isPublicFile,collect,build};
