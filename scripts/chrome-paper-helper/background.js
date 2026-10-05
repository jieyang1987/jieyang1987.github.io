import {serverAddress,chooseCandidate,ownedDownload,articleFromPage,publicWebUrl,originPermission,doiInUrl,rankPdfLinks,classifyPdfLink} from './protocol.mjs';
const ALARM='paper-download-jobs';
let running=false,wakeAgain=false;
const getState=()=>chrome.storage.local.get(['connection','active','lastError']);
async function api(connection,route,body={}) {
 const response=await fetch(serverAddress(connection.server)+'/api/chrome/extension/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(connection.token?{Authorization:'Bearer '+connection.token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'});
 const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'本地管理系统请求失败');return result;
}
async function patchActive(active){await chrome.storage.local.set({active});}
async function closeBackgroundTab(active){if(!active?.tabId)return;try{const tab=await chrome.tabs.get(active.tabId);if(!tab.active)await chrome.tabs.remove(active.tabId);}catch{}}
async function clearActive(active){await closeBackgroundTab(active);await chrome.storage.local.remove('active');}
async function report(connection,active,state,reason){await api(connection,'progress',{id:active.id,state,reason,articleNumber:active.articleNumber||'',pageDoi:active.pageDoi||'',...(active.downloadUrl?{downloadUrl:active.downloadUrl}:{})});}
async function attention(connection,active,message,reason){active.phase='attention';await patchActive(active);await report(connection,active,'needs_attention',reason);await chrome.storage.local.set({lastError:message});}
async function requireAccess(connection,active,request,resumePhase,reason){
 if(await chrome.permissions.contains(request))return true;
 active.requiredAccess=request;active.permissionReason=reason;active.resumePhase=resumePhase;active.phase='permission';await patchActive(active);
 await report(connection,active,'needs_attention','permission');await chrome.storage.local.set({lastError:reason+'；请在助手弹窗点击“允许所需访问”。'});return false;
}
function failure(message,code,extra={}){const e=new Error(message);e.code=code;Object.assign(e,extra);return e;}
async function smallHtml(response){
 if(!response.body)return '';const reader=response.body.getReader();let n=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;chunks.push(value);if(n>=65536){await reader.cancel();break;}}
 return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}
// Each new origin needs an explicit user grant. No broad all-sites permission is requested.
async function pdfBytesInChrome(url){
 url=publicWebUrl(url);
 if(!await chrome.permissions.contains({origins:[originPermission(url)]}))throw failure('需要授权 PDF 所在站点','permission',{requiredAccess:{origins:[originPermission(url)]}});
 const response=await fetch(url,{credentials:'include',redirect:'follow',signal:AbortSignal.timeout(60000)});
 const destination=publicWebUrl(response.url||url);
 if(!response.ok){await response.body?.cancel();throw failure('站点返回 HTTP '+response.status+'，请核对页面和访问权限',[404,410].includes(response.status)?'unavailable':'access');}
 if(/\/(?:login|signin|sign-in|oauth)(?:[/?]|$)/i.test(new URL(destination).pathname)){await response.body?.cancel();throw failure('PDF 跳转到了登录页面，请自行完成登录','access');}
 if(!await chrome.permissions.contains({origins:[originPermission(destination)]})){
  await response.body?.cancel();throw failure('PDF 跳转到了新的文件站点','permission',{requiredAccess:{origins:[originPermission(destination)]}});
 }

 if(/text\/html|application\/xhtml/i.test(response.headers.get('content-type')||'')){
  const html=await smallHtml(response);
  if(/captcha|verify.{0,25}human|just a moment|access denied|purchase this article|sign in to access|subscribe to access/i.test(html))throw failure('站点要求登录、订阅或人工验证，已停止自动尝试','access');
  throw failure('返回的是 PDF 查看页，将继续查看页面中的 PDF 链接','html',{pageUrl:destination});
 }
 const limit=100*1024*1024;if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw failure('PDF 超过 100 MB','invalid');}
 if(!response.body)throw failure('站点未返回文件内容','invalid');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw failure('PDF 超过 100 MB','invalid');chunks.push(value);}}catch(error){await reader.cancel();throw error;}
 const pdf=new Blob(chunks,{type:'application/pdf'});const signature=new Uint8Array(await pdf.slice(0,5).arrayBuffer());
 if(size<100||String.fromCharCode(...signature)!=='%PDF-')throw failure('链接没有返回 PDF 文件','invalid');
 return pdf;
}
async function transferPdf(connection,active){
 let pdf;
 try{pdf=await pdfBytesInChrome(active.downloadUrl);}
 catch(error){
  if(error.code==='permission'){await requireAccess(connection,active,error.requiredAccess,'fetching',error.message);return;}
  if(['unavailable','invalid','html'].includes(error.code)){
   active.phase='page';active.lastCandidateError=error.message;
   if(error.code==='html'&&!active.visited.includes(error.pageUrl)&&active.visited.length<3)active.candidates.unshift({url:error.pageUrl,direct:false,kind:'viewer',score:100});
   await patchActive(active);wakeAgain=true;return;
  }
  await attention(connection,active,error.message||'获取 PDF 失败，请检查页面或网络');return;
 }
 const response=await fetch(serverAddress(connection.server)+'/api/chrome/extension/upload',{method:'POST',redirect:'error',signal:AbortSignal.timeout(120000),headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/pdf','X-Paper-Job':active.id,'X-Pdf-Source':encodeURIComponent(active.downloadUrl)},body:pdf});
 const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'本地保存失败，未完成关联');await clearActive(active);await chrome.storage.local.set({lastError:''});
}
async function finishLegacyDownload(connection,active,item){
 if(item.state==='in_progress'&&!item.filename)return;
 if(!ownedDownload(item,active,chrome.runtime.id)){await report(connection,active,'failed','path_mismatch');await clearActive(active);throw Error('旧下载文件或来源与任务不一致，未导入');}
 if(item.state==='interrupted'){await report(connection,active,'failed','interrupted');await clearActive(active);return;}
 if(!['safe','accepted','allowlisted','deepScannedSafe'].includes(item.danger||'safe')){await attention(connection,active,'Chrome 正在检查下载，请自行查看下载列表');return;}
 if(item.state!=='complete')return;await api(connection,'complete',{id:active.id,path:item.filename,sourceUrl:item.url,downloadId:item.id});await clearActive(active);await chrome.storage.local.set({lastError:''});
}
// Serialized into the task-owned page: this function must not reference worker/module variables.
function readPdfLinks(){
 const links=[];const add=(value,kind,label='')=>{if(!value||links.length>=150)return;try{links.push({url:new URL(value,location.href).href,kind,label:String(label).slice(0,300)});}catch{}};
 for(const el of document.querySelectorAll('meta[name="citation_pdf_url"],meta[property="citation_pdf_url"],meta[name="eprints.document_url"]'))add(el.content,'citation-meta');
 for(const el of document.querySelectorAll('link[type="application/pdf"][href]'))add(el.href,'pdf-alternate');
 for(const el of document.querySelectorAll('iframe[src],embed[src],object[data]'))add(el.getAttribute('src')||el.getAttribute('data'),/pdf/i.test(el.getAttribute('type')||'')?'embedded-pdf':'embedded');
 for(const el of document.querySelectorAll('a[href]')){
  const href=el.getAttribute('href'),label=[el.textContent,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' ');
  const pdfLabel=/\bpdf\b|download.{0,15}(?:article|full.?text)|下载.{0,8}(?:全文|PDF)|全文下载/i.test(label);
  if(pdfLabel||/\.pdf(?:[?#/]|$)|\/(?:pdf|pdfdirect|pdfft|epdf|stamp)(?:[/?]|$)/i.test(href||''))add(href,pdfLabel?'pdf-link':'url',label);
 }
 const media=value=>{for(const m of [value||[]].flat()){if(m&&typeof m==='object'&&/pdf/i.test(m.encodingFormat||m.fileFormat||''))add(m.contentUrl||m.url,'jsonld-pdf');}};
 for(const el of document.querySelectorAll('script[type="application/ld+json"]')){try{
  const raw=JSON.parse(el.textContent);for(const node of [raw?.['@graph']||raw].flat()){
   const types=[node?.['@type']||[]].flat();if(!types.some(x=>['ScholarlyArticle','Article','ResearchArticle'].includes(x)))continue;
   if(node.url&&new URL(node.url,location.href).href.split('#')[0]!==location.href.split('#')[0])continue;
   media(node.encoding);media(node.associatedMedia);media(node.distribution);
  }
 }catch{}}
 const meta=name=>document.querySelector('meta[name="'+name+'"]')?.content||'';
 const scholarly=!!meta('citation_title');
 const challenge=/^(?:just a moment|attention required|access denied|verify you are human)[.!…\s]*$/i.test(document.title)||(!scholarly&&!!document.querySelector('#challenge-form,#challenge-running,.g-recaptcha'));
 return {url:location.href,links,doi:meta('citation_doi')||meta('prism.doi'),needsHuman:challenge};
}
function contextFor(job,active){return {pageUrl:active.pageUrl||job.url,articleNumber:job.articleNumber||active.articleNumber||'',expectedDoi:job.expectedDoi||active.pageDoi||'',attempted:active.attempted};}
async function step(connection,job,active){
 if(!active){active={...job,phase:'page',visited:[],attempted:[],candidates:rankPdfLinks([...(job.pdfHints||[]),job.url],{pageUrl:job.url,articleNumber:job.articleNumber,expectedDoi:job.expectedDoi}),pageScanned:false,startedAt:Date.now()};await patchActive(active);}
 active.visited ||= [];active.attempted ||= [];active.candidates ||= [];
 if(Date.now()-active.startedAt>30*60000){await report(connection,active,'failed','timeout');await clearActive(active);return;}
 if(active.phase==='permission'){
  if(!await chrome.permissions.contains(active.requiredAccess))return;
  active.phase=active.resumePhase||'page';delete active.requiredAccess;delete active.permissionReason;await patchActive(active);
 }
 if(active.phase==='attention')return;
 if(active.phase==='fetching'){
  if(!await requireAccess(connection,active,{origins:[originPermission(active.downloadUrl)]},'fetching','需要访问当前 PDF 站点'))return;
  await report(connection,active,'downloading');await transferPdf(connection,active);return;
 }
 if(active.downloadId){const items=await chrome.downloads.search({id:active.downloadId});if(!items.length)throw Error('旧下载记录不存在，请取消任务后重试');await finishLegacyDownload(connection,active,items[0]);return;}
 if(active.phase==='starting'){
  const items=await chrome.downloads.search({filenameRegex:active.id+'\\.pdf$',startedAfter:new Date(active.startedAt).toISOString()});const own=items.filter(i=>ownedDownload(i,active,chrome.runtime.id));
  if(own.length===1){active.downloadId=own[0].id;active.phase='downloading';await patchActive(active);await finishLegacyDownload(connection,active,own[0]);return;}
  if(Date.now()-(active.downloadStartedAt||0)>60000){await report(connection,active,'failed','interrupted');await clearActive(active);}return;
 }
 while(active.candidates.length){
  // A failed byte fetch may be a useful HTML viewer; track those visits separately.
  const candidate=active.candidates.shift();if(candidate.direct?active.attempted.includes(candidate.url):active.visited.includes(candidate.url))continue;
  if(active.attempted.length>=6){await attention(connection,active,'已尝试多个页面提供的 PDF 链接，均未成功；请人工核对');return;}
  if(candidate.direct){active.downloadUrl=candidate.url;active.currentCandidate=candidate;active.attempted.push(candidate.url);active.phase='fetching';await patchActive(active);
   if(!await requireAccess(connection,active,{origins:[originPermission(candidate.url)]},'fetching','需要访问 PDF 所在站点'))return;
   await report(connection,active,'downloading');await transferPdf(connection,active);return;
  }
  if(active.visited.length>=3)continue;
  if(!await requireAccess(connection,active,{origins:[originPermission(candidate.url)]},'page','需要访问 PDF 查看页')){active.candidates.unshift(candidate);await patchActive(active);return;}
  active.visited.push(candidate.url);active.pageScanned=false;active.pageUrl=candidate.url;await patchActive(active);
  if(active.tabId){try{await chrome.tabs.update(active.tabId,{url:candidate.url});return;}catch{}}
  const tab=await chrome.tabs.create({url:candidate.url,active:false});active.tabId=tab.id;await patchActive(active);return;
 }
 if(active.pageScanned){await attention(connection,active,active.lastCandidateError||'未找到可用 PDF。开放获取也可能需要特定入口，请打开论文页面核对');return;}
 let tab;if(active.tabId){try{tab=await chrome.tabs.get(active.tabId);}catch{}}
 if(!tab){
  if(!await requireAccess(connection,active,{origins:[originPermission(job.url)]},'page','需要读取当前论文站点的 PDF 链接'))return;
  tab=await chrome.tabs.create({url:job.url,active:false});active.tabId=tab.id;active.visited.push(job.url);await patchActive(active);return;
 }
 if(tab.status!=='complete')return;
 if(!tab.url){await requireAccess(connection,active,{permissions:['tabs']},'page','需要读取助手创建的任务页地址，以识别 DOI 跳转站点');return;}
 const currentUrl=publicWebUrl(tab.url);
 if(!await requireAccess(connection,active,{origins:[originPermission(currentUrl)]},'page','需要读取 DOI 跳转后的论文站点'))return;
 let observed;try{const results=await chrome.scripting.executeScript({target:{tabId:active.tabId},func:readPdfLinks});observed=results[0]?.result;}catch{}
 if(!observed){
  if(!active.attempted.includes(currentUrl)){active.pageScanned=true;active.candidates=[{url:currentUrl,direct:true,kind:'direct-url',score:100}];await patchActive(active);wakeAgain=true;return;}
  await attention(connection,active,'无法读取任务页面或 PDF，请打开任务页后重试');return;
 }
 if(observed.needsHuman){await attention(connection,active,'站点要求人工验证，请打开任务页处理；不会自动绕过验证');return;}
 active.pageUrl=publicWebUrl(observed.url);active.articleNumber=job.articleNumber||articleFromPage(observed.url)||active.articleNumber||'';
 const pageDoi=String(observed.doi||'').replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i,'').trim().toLowerCase();
 if(/^10\.\d{4,9}\/\S+$/.test(pageDoi)){
  if(job.expectedDoi&&pageDoi!==job.expectedDoi){await attention(connection,active,'页面 DOI 与当前论文不同，已停止避免下载错文');return;}active.pageDoi=pageDoi;
 }
 active.pageScanned=true;active.candidates=rankPdfLinks(observed.links,contextFor(job,active),active.visited,active.attempted);await patchActive(active);wakeAgain=true;
}
async function run(){
 if(running){wakeAgain=true;return;}running=true;
 try{
  const {connection,active}=await getState();if(!connection?.token)return;const {job}=await api(connection,'claim',{version:chrome.runtime.getManifest().version});let current=active;
  if(current&&(!job||job.id!==current.id)){
   if(current.downloadId){const items=await chrome.downloads.search({id:current.downloadId});if(items[0]?.state==='in_progress'&&ownedDownload(items[0],current,chrome.runtime.id))await chrome.downloads.cancel(current.downloadId);}
   await clearActive(current);current=null;
  }
  if(job)await step(connection,job,current);
 }catch(error){await chrome.storage.local.set({lastError:error.message||'连接失败，请确认管理系统正在运行'});}
 finally{running=false;if(wakeAgain){wakeAgain=false;queueMicrotask(run);}}
}
async function initialize(){await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});await chrome.alarms.create(ALARM,{periodInMinutes:0.5});await run();}
chrome.runtime.onInstalled.addListener(initialize);chrome.runtime.onStartup.addListener(initialize);chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===ALARM)run();});
chrome.downloads.onChanged.addListener(change=>getState().then(({active})=>{if(active?.downloadId===change.id||active?.phase==='starting')run();}));
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(change.status==='complete')getState().then(({active})=>{if(active?.tabId===tabId)run();});});
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
 if(sender.id!==chrome.runtime.id)return;
 (async()=>{
  if(message.action==='pair'){const connection={server:serverAddress(message.server)};const result=await api(connection,'pair',{code:String(message.code||'').trim(),extensionId:chrome.runtime.id});connection.token=result.token;await chrome.storage.local.set({connection,lastError:''});await initialize();}
  else if(message.action==='check'){
   const {active}=await getState();if(active?.phase==='attention'){active.phase='page';active.visited=[];active.attempted=[];active.candidates=[];active.pageScanned=false;await patchActive(active);}await initialize();
  }else if(message.action==='open'){const {active}=await getState();if(active?.tabId)await chrome.tabs.update(active.tabId,{active:true});else if(active){const tab=await chrome.tabs.create({url:publicWebUrl(active.url),active:true});active.tabId=tab.id;await patchActive(active);}}
  const {connection,active,lastError}=await getState();return {ok:true,version:chrome.runtime.getManifest().version,connected:!!connection?.token,server:connection?.server||'',title:active?.title||'',state:active?.phase||'',permissionRequest:active?.requiredAccess||null,permissionReason:active?.permissionReason||'',lastError:lastError||''};
 })().then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message}));return true;
});
