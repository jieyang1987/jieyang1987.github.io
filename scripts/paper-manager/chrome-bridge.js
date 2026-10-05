'use strict';
// Paired Chrome download handoff. Cookies stay in Chrome; only job-scoped file paths cross this bridge.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { ieeeNumber, doiFrom, inputUrl } = require('./metadata');
const { publicWebUrl, samePaperLink } = require('../chrome-paper-helper/pdf-policy.mjs');
const TERMINAL = new Set(['complete', 'failed', 'cancelled']);
const MAX_PDF = 100 * 1024 * 1024;
const EXTENSION = /^[a-p]{32}$/;
const samePath = (a, b) => process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
const fingerprint = p => crypto.createHash('sha256').update(JSON.stringify([p.title || '', p.url || '', p.doi || ''])).digest('hex');
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function equalSecret(a, b) { if(typeof a!=='string'||typeof b!=='string')return false;const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb); }
function writeAtomic(file, value) {
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', {mode:0o600});
    // Dropbox/antivirus can briefly hold the destination on Windows. Keep replacement atomic.
    for(let attempt=0;;attempt++){
      try{fs.renameSync(temp,file);break;}
      catch(error){
        if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=9){console.error('Chrome bridge file update failed',error.code||error.name,error.syscall||'');throw error;}
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25*(attempt+1));
      }
    }
  }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function directory(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || !fs.existsSync(value)) fail('Chrome 下载目录必须是已存在的绝对路径');
  if (!fs.lstatSync(value).isDirectory() || fs.lstatSync(value).isSymbolicLink()) fail('下载目录不能是文件或链接');
  return fs.realpathSync(value);
}
function pageUrl(paper) {
  try { return publicWebUrl(inputUrl(paper.url)); } catch(error) { fail(error.message); }
}
function validDownloadUrl(value, articleNumber = '', context = {}) {
  try { const url=publicWebUrl(value);if(!samePaperLink(url,{...context,articleNumber}))fail('PDF 链接的论文标识与当前任务不一致');return url; }
  catch(error){fail(error.message);}
}
async function validatePdf(buffer) {
  if (buffer.subarray(0,5).toString('ascii') !== '%PDF-' || !buffer.subarray(-2048).includes(Buffer.from('%%EOF'))) fail('下载内容不是完整 PDF，可能是登录页、验证页或未完成的文件');
  try {
    const parsed = await require('pdf-parse')(new Uint8Array(buffer), {max:1});
    if (!parsed.numpages) fail('PDF 没有有效页面');
    return parsed;
  } catch (cause) { const error = new Error('PDF 解析失败，未写入网站', {cause}); error.status=400; throw error; }
}
function createChromeBridge({root, readAllPapers, checkPdf = validatePdf, persist = writeAtomic}) {
  const privateDir = path.join(root, '.codex_tmp');
  const stateFile = path.join(privateDir, 'chrome-download-bridge.json');
  const papersDir = path.join(root, 'papers');
  let state = {version:1, downloadRoot:path.join(os.homedir(),'Downloads'), extensionId:'', token:'', jobs:[]};
  if (fs.existsSync(stateFile)) {
    if (fs.lstatSync(stateFile).isSymbolicLink()) fail('Chrome 助手配置不能是链接');
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (state.version !== 1 || !Array.isArray(state.jobs)) fail('Chrome 助手配置损坏，请检查本机配置');
  }
  let pairing = null, lastSeen = 0, clientVersion = '';
  const imports = new Map();
  function save() {
    fs.mkdirSync(privateDir, {recursive:true});
    if (fs.lstatSync(privateDir).isSymbolicLink()) fail('Chrome 助手配置目录不能是链接');
    persist(stateFile, state);
  }
  function jobById(id) { const job=state.jobs.find(j=>j.id===id); if(!job) fail('下载任务不存在',404); return job; }
  function publicJob(job) {
    return {id:job.id,title:job.title,state:job.state,message:job.message||'',createdAt:job.createdAt,
      suggestedFilename:job.suggestedFilename,savedPath:job.savedPath||'',paperId:job.paperId,bytes:job.bytes||0};
  }
  function status() {
    return {paired:!!state.token,clientVersion,connected:!!lastSeen&&Date.now()-lastSeen<95000,downloadRoot:state.downloadRoot,
      transport:'direct-upload',targetDirectory:papersDir,extensionPath:path.join(root,'scripts','chrome-paper-helper'),jobs:state.jobs.slice(-30).reverse().map(publicJob)};
  }
  function newPairing(downloadRoot) {
    if(state.jobs.some(j=>!TERMINAL.has(j.state))) fail('请先完成或取消当前下载任务，再修改连接设置');
    const approvedRoot=downloadRoot?directory(downloadRoot):state.downloadRoot;
    const staging=path.join(approvedRoot,'PaperManager');
    const relative=path.relative(path.resolve(papersDir),path.resolve(staging));
    if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail('Chrome 下载暂存目录不能放在网站 papers 目录内，以免未核验文件被发布');
    pairing={code:crypto.randomBytes(24).toString('base64url'),expires:Date.now()+5*60000,downloadRoot:approvedRoot};
    return {code:pairing.code,expiresAt:pairing.expires};
  }
  function pair({code,extensionId}) {
    if(!EXTENSION.test(extensionId||'')||!pairing||Date.now()>pairing.expires||!equalSecret(code,pairing.code)) fail('配对码无效或已过期，请在管理面板重新生成',403);
    state.extensionId=extensionId;state.token=crypto.randomBytes(32).toString('base64url');state.downloadRoot=pairing.downloadRoot;
    save();pairing=null;lastSeen=Date.now();return {token:state.token};
  }
  function authenticate(token,origin) {
    if(!state.token||!equalSecret(token,state.token)||(origin&&origin!=='chrome-extension://'+state.extensionId)) fail('Chrome 助手未配对或连接凭据失效',403);
    lastSeen=Date.now();
  }
  function currentPaper(job) {
    const matches=readAllPapers().filter(p=>fingerprint(p)===job.fingerprint);
    if(matches.length!==1) fail('论文已删除、标题/URL 已修改或存在重复条目；为避免误关联，下载文件已保留',409);
    return matches[0];
  }
  function filename(paper) {
    const year=Number.isInteger(paper.groupYear)?paper.groupYear:paper.year;
    if(!Number.isInteger(year)) fail('无法确定论文实际年份，请先核实年份再下载');
    const naming=require('../add-paper');
    return naming.buildCanonicalFilename(year,naming.findVenueAbbrev(paper.venue)||'paper',paper.title||'untitled');
  }
  function enqueue(paperId) {
    if(!status().connected) fail('Chrome 助手未连接，请先安装、配对并在 Chrome 扩展弹窗中点击检查任务');
    if(clientVersion==='1.0.x'||clientVersion==='1.0.0')fail('Chrome 助手仍是旧版，请在 Chrome 扩展管理页点击重新加载，再立即检查任务');
    const matches=readAllPapers().filter(p=>p.id===paperId);
    if(matches.length!==1) fail('无法唯一定位论文，请刷新列表后重试');
    const p=matches[0];const url=pageUrl(p);
    const legacyIeee=new URL(url).hostname==='ieeexplore.ieee.org'||(new URL(url).hostname==='doi.org'&&doiFrom(url).startsWith('10.1109/'));
    const [major,minor]=String(clientVersion||'0.0').split('.').map(Number);
    if(!legacyIeee&&!(major>1||major===1&&minor>=2))fail('非 IEEE 下载需要 Chrome 助手 v1.2，请在扩展管理页重新加载，再打开助手检查任务');
    if(p.pdf&&p.pdf.startsWith('papers/')) fail('这篇论文已关联本地 PDF，不会自动覆盖');
    const existing=state.jobs.find(j=>j.fingerprint===fingerprint(p)&&!TERMINAL.has(j.state));
    if(existing)return publicJob(existing);
    if(state.jobs.filter(j=>!TERMINAL.has(j.state)).length>=10)fail('待处理任务过多，请等待现有下载完成');
    const job={id:crypto.randomUUID(),paperId:p.id,fingerprint:fingerprint(p),title:p.title,url,articleNumber:ieeeNumber(url),
      originalPdf:p.pdf||'',expectedDoi:doiFrom(p.doi||p.url),pdfHints:[],suggestedFilename:filename(p),state:'queued',createdAt:Date.now()};
    if(p.pdf&&/^https?:/i.test(p.pdf)){try{job.pdfHints=[{url:publicWebUrl(p.pdf),kind:'saved-pdf'}];}catch{}}
    state.jobs=state.jobs.filter(j=>!TERMINAL.has(j.state)||Date.now()-j.createdAt<7*86400000);
    state.jobs.push(job);save();return publicJob(job);
  }
  function claim(info) {
    if(info!==undefined)clientVersion=typeof info.version==='string'&&/^\d+\.\d+\.\d+$/.test(info.version)?info.version:'1.0.x';
    const job=state.jobs.find(j=>!TERMINAL.has(j.state));
    if(!job)return null;
    if(job.state==='queued'){job.state='resolving';job.message='Chrome 正在查找 PDF 链接';save();}
    return {id:job.id,url:job.url,articleNumber:job.articleNumber,expectedDoi:job.expectedDoi||doiFrom(job.url),pdfHints:job.pdfHints||[],title:job.title,createdAt:job.createdAt,
      transport:'direct-upload',stagingFilename:'PaperManager/'+job.id+'.pdf',state:job.state};
  }
  function progress({id,state:next,downloadUrl,reason,articleNumber,pageDoi}) {
    const job=jobById(id);if(TERMINAL.has(job.state)||job.state==='importing')return publicJob(job);
    if(next==='downloading') {
      if(!job.articleNumber&&/^\d+$/.test(articleNumber||''))job.articleNumber=articleNumber;
      const observedDoi=doiFrom(pageDoi),expected=job.expectedDoi||doiFrom(job.url);
      if(observedDoi&&expected&&observedDoi!==expected)fail('页面 DOI 与当前论文不一致，已停止下载');
      job.expectedDoi=expected||observedDoi;
      job.downloadUrl=validDownloadUrl(downloadUrl,job.articleNumber,{pageUrl:job.url,expectedDoi:job.expectedDoi});job.message='Chrome 正在尝试获取 PDF，完成后直接写入网站目录';
    }
    else if(next==='needs_attention')job.message=reason==='permission'?'请打开 Chrome 助手，允许当前任务所需的站点访问后继续':'请在 Chrome 助手中打开任务页面，核对 PDF 链接、登录或人工验证，再点击立即检查任务';
    else if(next==='failed')job.message=({path_mismatch:'Chrome 下载文件名或来源不符；原文件已保留，请检查其他扩展或下载设置',interrupted:'Chrome 下载中断，未导入网站',blocked:'Chrome 拦截了下载，请自行检查',timeout:'等待超时，请完成登录后重试',not_pdf:'未取得可下载的 PDF，请检查 Chrome 中的论文页面'})[reason]||'Chrome 未能完成下载，请打开任务页面检查';
    else fail('无效的任务状态');
    job.state=next;save();return publicJob(job);
  }
  function cancel(id) {const job=jobById(id);if(job.state==='importing')fail('文件正在核验/归档，请等待结果',409);if(!TERMINAL.has(job.state)){job.state='cancelled';job.message='已取消；已下载文件不会被擅自删除';save();}return publicJob(job);}
  function legacySources(job) {
    const base=directory(state.downloadRoot);
    return [path.join(base,'PaperManager',job.id+'.pdf'),path.join(base,job.id+'.pdf')];
  }
  function checkedSource(job,sourcePath) {
    if(typeof sourcePath!=='string'||!path.isAbsolute(sourcePath))fail('未收到 Chrome 下载文件路径');
    const expected=legacySources(job).find(p=>samePath(p,sourcePath));
    if(!expected)fail('只接受当前任务在下载目录中的文件；无需手动搬动文件');
    if(!fs.existsSync(expected))fail('Chrome 下载文件不存在，未改动网站');
    const folder=path.dirname(expected);
    if(fs.lstatSync(folder).isSymbolicLink()||!samePath(fs.realpathSync(folder),folder))fail('暂存目录不能通过链接跳转到其他位置');
    const stat=fs.lstatSync(expected);
    if(!stat.isFile()||stat.isSymbolicLink()||!samePath(fs.realpathSync(expected),expected))fail('只允许任务对应的普通 PDF 文件');
    if(stat.size<100||stat.size>MAX_PDF)fail('PDF 大小无效或超过 100 MB；原文件已保留');
    return expected;
  }
  function targetPath(relative) {
    if(typeof relative!=='string'||!relative.startsWith('papers/')||!/^papers\/[^\\/:*?"<>|\x00-\x1f]+\.pdf$/i.test(relative)||relative.slice(7)!==path.basename(relative))fail('无效的目标文件路径');
    fs.mkdirSync(papersDir,{recursive:true});
    if(fs.lstatSync(papersDir).isSymbolicLink())fail('网站 papers 目录不能是链接');
    return path.join(papersDir,path.basename(relative));
  }
  function commitPdf(paper,job,relative) {
    const file=path.resolve(root,paper.file);const base=path.resolve(root,'data','publications');
    if(path.dirname(file)!==base||fs.lstatSync(file).isSymbolicLink())fail('无效的论文数据文件');
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    const group=data[paper.section]?.find(g=>g.year===paper.groupYear);
    const item=group?.items?.[paper.index];
    if(!item||fingerprint(item)!==job.fingerprint||(item.pdf||'')!==job.originalPdf)fail('论文关联已改变，未覆盖当前 PDF',409);
    item.pdf=relative;persist(file,data);
  }
  async function importFile(job,body,recover=false) {
    if(job.state==='complete')return publicJob(job);
    if(TERMINAL.has(job.state)&&!(recover&&job.state==='failed'))fail('该下载任务已经终止',409);
    let createdTarget='';
    try {
      if(!job.downloadUrl||validDownloadUrl(body.sourceUrl,job.articleNumber,{pageUrl:job.url,expectedDoi:job.expectedDoi})!==job.downloadUrl)fail('下载来源与当前任务不一致');
      // Recover a crash after JSON commit but before the completion receipt was saved.
      let p=currentPaper(job);
      if(job.savedPath&&p.pdf===job.savedPath&&fs.existsSync(targetPath(job.savedPath))){
        if(crypto.createHash('sha256').update(fs.readFileSync(targetPath(job.savedPath))).digest('hex')!==job.sha256)fail('已归档文件校验不一致，请人工检查');
        job.state='complete';job.paperId=p.id;job.message='PDF 已保存并关联（已恢复完成状态）';save();return publicJob(job);
      }
      if((p.pdf||'')!==job.originalPdf)fail('你已为论文更改 PDF，不会覆盖新的关联',409);
      let buffer;
      if(body.buffer!==undefined){
        if(!Buffer.isBuffer(body.buffer))fail('PDF 数据格式无效');
        buffer=body.buffer;
      }else buffer=fs.readFileSync(checkedSource(job,body.path));
      if(buffer.length<100||buffer.length>MAX_PDF)fail('PDF 大小无效或超过 100 MB');
      job.state='importing';job.message='正在核验 PDF 并直接保存到网站 papers 目录';save();
      const parsed=await checkPdf(buffer);
      const expectedDoi=doiFrom(p.doi||p.url)||job.expectedDoi||'';
      const found=[...new Set((parsed?.text||'').match(/10\.\d{4,9}\/[^\s"<>]+/gi)||[])].map(doiFrom);
      if(expectedDoi&&found.length===1&&found[0]!==expectedDoi)fail('PDF 中的 DOI 与论文不一致，未写入网站');
      // Re-read after asynchronous PDF parsing; author edits and row moves must survive.
      p=currentPaper(job);if((p.pdf||'')!==job.originalPdf)fail('下载期间 PDF 关联已改变，未覆盖',409);
      const digest=crypto.createHash('sha256').update(buffer).digest('hex');
      const resume=job.savedPath&&job.sha256===digest&&fs.existsSync(targetPath(job.savedPath))&&
        crypto.createHash('sha256').update(fs.readFileSync(targetPath(job.savedPath))).digest('hex')===digest;
      if(!resume){
        const canonical=filename(p);let name=canonical;let n=2;
        fs.mkdirSync(papersDir,{recursive:true});
        const used=new Set(fs.readdirSync(papersDir).map(x=>x.toLowerCase()));
        while(used.has(name.toLowerCase()))name=path.basename(canonical,'.pdf')+'_'+(n++)+'.pdf';
        job.savedPath='papers/'+name;job.sha256=digest;job.bytes=buffer.length;save();
        const target=targetPath(job.savedPath);
        // Exclusive creation protects existing files even if another program races us.
        fs.writeFileSync(target,buffer,{flag:'wx'});createdTarget=target;
      }
      commitPdf(p,job,job.savedPath);
      createdTarget=''; // JSON now references it: never roll it back after this point.
      job.state='complete';job.paperId=p.id;job.message='PDF 已规范命名、保存并关联；尚未发布网站';
      for(const other of state.jobs)if(other.id!==job.id&&other.fingerprint===job.fingerprint&&other.state==='failed'){other.state='cancelled';other.message='同一篇论文已由另一下载任务成功归档';}
      save();
      // Keep Chrome's staging copy for recovery. The browser must not redownload or delete it implicitly.
      return publicJob(job);
    } catch(error) {
      if(createdTarget&&fs.existsSync(createdTarget))fs.unlinkSync(createdTarget);
      if(job.state!=='complete'){job.state='failed';job.message=error.status?error.message:'保存失败，论文关联未被覆盖，请检查磁盘或权限后重试';save();}
      if(!error.status)fail('保存失败，Chrome 下载文件已保留，请检查磁盘或权限后重试',500);
      throw error;
    }
  }
  function complete(body,options={}) {
    const job=jobById(body.id);
    if(imports.has(job.id))return imports.get(job.id);
    const pending=importFile(job,body,options.recover===true).finally(()=>imports.delete(job.id));imports.set(job.id,pending);return pending;
  }
  function recover(id) {
    const job=jobById(id);
    if(job.state==='complete')return Promise.resolve(publicJob(job));
    const candidates=legacySources(job).filter(p=>fs.existsSync(p));
    if(candidates.length!==1)fail('没有找到唯一的已下载任务文件，请重新加载新版 Chrome 助手后重试');
    return complete({id,path:candidates[0],sourceUrl:job.downloadUrl},{recover:true});
  }
  return {status,newPairing,pair,authenticate,enqueue,claim,progress,cancel,complete,recover};
}
module.exports={createChromeBridge,validatePdf,validDownloadUrl,fingerprint};
