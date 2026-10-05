'use strict';
// One configured public Scholar profile page, not search results, detail pages or pagination.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {doiFrom,identityUrl,inputUrl}=require('./metadata');
const {requestPublicText}=require('./scholar-network');
const DAY=24*60*60*1000, MANUAL_GAP=15*60*1000;
const idHash=value=>crypto.createHash('sha256').update(value).digest('hex').slice(0,24);
function error(message,code='failed',retryAfter=0){const e=new Error(message);e.code=code;e.retryAfter=retryAfter;return e;}
function decode(value){return String(value||'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|ndash|mdash|micro|mu);/gi,(m,k)=>{
 if(k[0]==='#'){const n=k[1].toLowerCase()==='x'?parseInt(k.slice(2),16):parseInt(k.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}
 return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',micro:'μ',mu:'μ'}[k.toLowerCase()]||m;
});}
function plain(value){return decode(String(value||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();}
function attributes(tag){const a={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))a[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);return a;}
const hasClass=(tag,name)=>String(attributes(tag).class||'').split(/\s+/).includes(name);

const TITLE_PARSER_VERSION=2;
function mathLabelText(value){
 let text=decode(value);const greek={mu:'μ',alpha:'α',beta:'β',gamma:'γ',delta:'δ',Delta:'Δ',theta:'θ',lambda:'λ',pi:'π',sigma:'σ',Omega:'Ω',omega:'ω',times:'×',pm:'±',leq:'≤',geq:'≥',cdot:'·'};
 text=text.replace(/\\(mu|alpha|beta|gamma|delta|Delta|theta|lambda|pi|sigma|Omega|omega|times|pm|leq|geq|cdot)\b/g,(_,name)=>greek[name]);
 text=text.replace(/\\(?:mathrm|textrm|text|operatorname)\{([^{}]*)\}/g,'$1');
 const sup={'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻'};
 text=text.replace(/\^\{([0-9+-]+)\}|\^([0-9])/g,(_,group,single)=>[...(group||single)].map(c=>sup[c]).join(''));
 return text;
}
function scholarTitle(html){
 let unresolved=false;
 const restored=String(html).replace(/(<svg\b[^>]*>)([\s\S]*?)<\/svg>/gi,(_,open,inside)=>{
  const attr=attributes(open);const label=attr['aria-label']||plain(inside.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  if(!label){if(attr['aria-hidden']==='true')return '';unresolved=true;return ' [未识别公式] ';}
  // Escape restored text before the normal HTML-to-text pass. Never render/evaluate SVG or TeX.
  const rendered=mathLabelText(label);
  if(/\\[A-Za-z]+|[_^]\{/.test(rendered))unresolved=true;
  return rendered.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 });
 return {text:plain(restored),unresolved};
}

function profile(value){let u;try{u=new URL(value);}catch{throw error('网站尚未配置有效的 Google Scholar 公开主页','not_configured');}
 const user=u.searchParams.get('user');if(u.protocol!=='https:'||u.hostname!=='scholar.google.com'||u.pathname!=='/citations'||u.username||u.password||!user||!/^[A-Za-z0-9_-]{6,64}$/.test(user))throw error('只支持配置中的 Google Scholar 作者公开主页','not_configured');
 const url=new URL('https://scholar.google.com/citations');url.search=new URLSearchParams({user,hl:'en',sortby:'pubdate',pagesize:'100'});return {id:user,url:url.href};
}
function robotsAllows(robots,value){
 const groups=[];let agents=[],rules=[],started=false;
 const flush=()=>{if(agents.length)groups.push({agents,rules});agents=[];rules=[];started=false;};
 for(const raw of String(robots).split(/\r?\n/)){const line=raw.replace(/#.*$/,'').trim();if(!line)continue;const match=line.match(/^([^:]+):\s*(.*)$/);if(!match)continue;const key=match[1].trim().toLowerCase(),val=match[2].trim();
  if(key==='user-agent'){if(started)flush();agents.push(val.toLowerCase());}
  else if(['allow','disallow'].includes(key)&&agents.length){started=true;if(val)rules.push({allow:key==='allow',pattern:val});}
 }
 flush();if(!groups.length)throw error('未能解析 Scholar 访问规则，未请求主页','policy_unavailable');
 const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&'papermanagerscholarwatcher'.startsWith(a)));
 const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
 const u=new URL(value),target=u.pathname+u.search;let best=null;
 for(const rule of selected.flatMap(g=>g.rules)){const end=rule.pattern.endsWith('$');const pattern=end?rule.pattern.slice(0,-1):rule.pattern;
  const rx='^'+pattern.split('*').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+(end?'$':'');
  if(new RegExp(rx).test(target)){const length=pattern.replace(/\*/g,'').length;if(!best||length>best.length||(length===best.length&&rule.allow))best={...rule,length};}
 }
 return best?best.allow:true;
}
async function requestText(value){
 const response=await requestPublicText(value);
 if(response.status===429||response.status===403){const raw=response.headers['retry-after'];const retry=/^\d+$/.test(raw||'')?Number(raw)*1000:Math.max(0,Date.parse(raw||'')-Date.now())||0;throw error('Scholar 限流或拒绝自动访问；至少 24 小时后再检查，不会自动重试或绕过验证','blocked',retry);}
 if(response.status>=300&&response.status<400)throw error('页面要求跳转或登录，本次未读取论文列表','needs_verification');
 if(response.status!==200)throw error('来源返回 HTTP '+response.status+'，本次检查未完成','http_error');
 return response.body;
}
function safePublisherUrl(value){try{const u=new URL(inputUrl(value));if(u.hostname==='scholar.google.com'||u.hostname.endsWith('.google.com'))return '';return u.href;}catch{return '';}}
function parseProfile(html,source){
 if(/(?:g-recaptcha|recaptcha\/api|\/sorry\/|unusual traffic|not a robot|verify you are human)/i.test(html))throw error('Scholar 要求人工验证；已停止自动检查，不会把本次结果视为没有新论文','needs_verification');
 html=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
 if(!/<(?:div|h1)\b[^>]*\bid\s*=\s*["']gsc_prf_in["']/i.test(html)||!/<tbody\b[^>]*\bid\s*=\s*["']gsc_a_b["']/i.test(html))throw error('没有识别到公开作者论文列表，可能是访问受限或页面结构变化','parse_error');
 const entries=[];let rowCount=0;
 for(const row of html.matchAll(/(<tr\b[^>]*>)([\s\S]*?)<\/tr>/gi)){
  if(!hasClass(row[1],'gsc_a_tr'))continue;rowCount++;
  const anchors=[...row[2].matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/gi)];const titleLink=anchors.find(a=>hasClass(a[1],'gsc_a_at'));
  if(!titleLink)throw error('部分论文行无法解析，保留上次结果','parse_error');
  const parsedTitle=scholarTitle(titleLink[2]);const title=parsedTitle.text.slice(0,1600);let article;
  try{article=new URL(attributes(titleLink[1]).href,source.url);}catch{throw error('论文来源链接无效','parse_error');}
  const sourceId=article.searchParams.get('citation_for_view');
  if(!title||article.hostname!=='scholar.google.com'||article.protocol!=='https:'||!sourceId?.startsWith(source.id+':'))throw error('论文条目与配置的 Scholar 作者不匹配','parse_error');
  const gray=[...row[2].matchAll(/(<div\b[^>]*>)([\s\S]*?)<\/div>/gi)].filter(a=>hasClass(a[1],'gs_gray')).map(a=>plain(a[2]));
  const yearCell=[...row[2].matchAll(/(<td\b[^>]*>)([\s\S]*?)<\/td>/gi)].find(a=>hasClass(a[1],'gsc_a_y'));
  const year=Number(plain(yearCell?.[2]).match(/\b(?:19|20|21)\d{2}\b/)?.[0])||null;
  let publisherUrl='';for(const a of anchors){const href=attributes(a[1]).href;if(!href)continue;try{const u=new URL(href,source.url);publisherUrl=safePublisherUrl(u.hostname==='scholar.google.com'?u.searchParams.get('url'):u.href);if(publisherUrl)break;}catch{}}
  entries.push({sourceId,scholarUrl:article.href,title,authors:(gray[0]||'').slice(0,1800),venue:(gray[1]||'').slice(0,1000),year,publisherUrl,doi:doiFrom(publisherUrl),titleMathUnresolved:parsedTitle.unresolved,titleTruncated:/(?:…|\.\.\.)$/.test(title)});
 }
 if(rowCount>100)throw error('主页条目数量超出单页检查范围','parse_error');
 const ids=new Set();return entries.filter(e=>{if(ids.has(e.sourceId))return false;ids.add(e.sourceId);return true;});
}
function titleKey(value){return plain(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');}
// Website de-duplication is title-first by the user's preference. Keep the stricter
// titleKey unchanged for Crossref DOI resolution and source-record identity.
function dedupTitleKey(value,venue=''){
 let text=plain(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
 // An ISSCC session/presentation number is not part of the paper title.
 if(/\bISSCC\b|international solid-state circuits conference/i.test(venue))text=text.replace(/^[1-9]\d?\.\d{1,2}\s+(?=(?:a|an|the)\s)/,'');
 text=text.replace(/^(?:a|an|the)\s+/,'');
 text=text.replace(/\btowards\b/g,'toward');
 // Equivalent printed micro-units: 4.38 μJ vs 4.38 uJ; do not discard numbers.
 text=text.replace(/(\d)\s*[μµ]\s*(?=(?:w|j|a|v|s|f|hz|m|g|l|c)\b)/g,'$1u');
 return text.replace(/[^\p{L}\p{N}]/gu,'');
}
const incompleteTitle=entry=>!!entry.titleTruncated||!!entry.titleMathUnresolved||/(?:…|\.\.\.)$/.test(plain(entry.title))||String(entry.title||'').includes('\uFFFD');
function authorKeys(value){
 if(Array.isArray(value))return new Set(value.map(a=>a.family?titleKey((a.given||'')[0]+' '+a.family):'').filter(Boolean));
 return new Set(plain(value).split(/,|;|\band\b/).map(name=>{const parts=name.replace(/\*|…|\.\.\./g,'').trim().split(/\s+/);return parts.length>1?titleKey(parts[0][0]+' '+parts.at(-1)):'';}).filter(Boolean));
}
const overlaps=(a,b)=>[...a].some(x=>b.has(x));
function titleSimilarity(a,b){const tokens=s=>new Set(plain(s).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]);const x=tokens(a),y=tokens(b);if(x.size<5||y.size<5)return 0;return 2*[...x].filter(t=>y.has(t)).length/(x.size+y.size);}
function matchPaper(entry,papers){
 const title=dedupTitleKey(entry.title,entry.venue),authors=authorKeys(entry.authors),doi=doiFrom(entry.doi||entry.publisherUrl);
 const matches=[];
 for(const p of papers){let strength='',reason='';const pdoi=doiFrom(p.doi||p.url);
  if(doi&&pdoi===doi){strength='exact';reason='DOI 一致';}
  else if(entry.publisherUrl&&identityUrl(entry.publisherUrl)===identityUrl(p.url)){strength='exact';reason='论文链接一致';}
  else if(title&&title===dedupTitleKey(p.title,p.venue)){
    strength=!incompleteTitle(entry)&&!incompleteTitle(p)?'title':'possible';
    reason=strength==='title'?'标题一致（已忽略排版、缩写符号及元数据差异）':'标题疑似截断或含乱码，需核对完整标题';
  }else if(overlaps(authors,authorKeys(p.authors))&&titleSimilarity(entry.title,p.title)>=0.82){strength='possible';reason='标题相近且作者重合，可能是另一版本';}
  if(strength)matches.push({id:p.id,title:p.title,url:p.url,year:p.groupYear||p.year,strength,reason});
 }
 const exact=matches.filter(m=>m.strength==='exact');if(exact.length)return {status:'existing',matches:exact.slice(0,5)};
 const same=matches.filter(m=>m.strength==='title');if(same.length)return {status:'existing',matches:same.slice(0,5)};
 return {status:matches.length?'possible_duplicate':'pending',matches:matches.slice(0,5)};
}
function atomic(file,value){const temp=file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});for(let n=0;;n++){try{fs.renameSync(temp,file);break;}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||n===9)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25*(n+1));}}}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function createScholarWatcher({root,getProfileUrl,readAllPapers,request=requestText,now=Date.now}){
 const dir=path.join(root,'.codex_tmp'),file=path.join(dir,'scholar-watch.json');let source,configError='';
 try{source=profile(getProfileUrl());}catch(e){configError=e.message;}
 let state={version:1,titleParserVersion:TITLE_PARSER_VERSION,profileId:source?.id||'',enabled:true,lastAttemptAt:0,lastSuccessAt:0,nextAutomaticAt:0,manualAllowedAt:0,lastOutcome:'never',lastError:'',lastErrorCode:'',lastNetworkRetryAt:0,lastScanned:0,newCandidates:0,entries:[]};let corrupt=false;
 if(fs.existsSync(file)){try{if(fs.lstatSync(dir).isSymbolicLink()||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>8*1024*1024)throw Error();const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.version!==1||!Array.isArray(saved.entries)||saved.profileId!==state.profileId)throw Error();state=saved;}catch{corrupt=true;state.enabled=false;state.lastOutcome='storage_error';state.lastError='Scholar 候选记录损坏或主页配置已改变；原文件未覆盖，请检查本机配置';}}
 let inFlight=null,timer=null,started=false;const resolving=new Map();
 function save(){if(corrupt)throw error(state.lastError,'storage_error');fs.mkdirSync(dir,{recursive:true});if(fs.lstatSync(dir).isSymbolicLink())throw error('候选目录不能是链接');atomic(file,state);}
 function status(){const papers=readAllPapers();const entries=state.entries.map(e=>{const match=matchPaper(e,papers);return {...e,...match,status:e.ignored?'ignored':match.status};}).sort((a,b)=>(b.year||0)-(a.year||0)||b.firstSeenAt-a.firstSeenAt);
  return {ok:true,configured:!!source,profileUrl:source?.url||'',profileId:source?.id||'',enabled:state.enabled,checking:!!inFlight,lastAttemptAt:state.lastAttemptAt,lastSuccessAt:state.lastSuccessAt,nextAutomaticAt:state.nextAutomaticAt,manualAllowedAt:state.manualAllowedAt,lastOutcome:configError?'not_configured':state.lastOutcome,lastError:configError||state.lastError,lastErrorCode:state.lastErrorCode||'',networkRetryAllowedAt:(state.lastNetworkRetryAt||0)+MANUAL_GAP,lastScanned:state.lastScanned,newCandidates:Math.min(state.newCandidates||0,entries.filter(e=>['pending','possible_duplicate'].includes(e.status)&&e.firstSeenAt>=state.lastAttemptAt&&e.firstSeenAt<=state.lastSuccessAt).length),pendingCount:entries.filter(e=>['pending','possible_duplicate'].includes(e.status)).length,entries};
 }
 function schedule(){if(timer)clearTimeout(timer);timer=null;if(!started||!state.enabled||!source||corrupt)return;const delay=Math.max(10000,Math.min(DAY,state.nextAutomaticAt-now()));timer=setTimeout(()=>{timer=null;check('automatic').catch(()=>{});},delay);timer.unref?.();}
 async function perform(){
  state.lastAttemptAt=now();state.nextAutomaticAt=now()+DAY;state.manualAllowedAt=now()+MANUAL_GAP;state.lastError='';save();
  try{
    const robots=await request('https://scholar.google.com/robots.txt');
    if(!robotsAllows(robots,source.url))throw error('Scholar 当前访问规则不允许读取此主页，自动检查已停止','policy_blocked');
    const html=await request(source.url);
    // A bounded local snapshot permits parser diagnostics without re-requesting Scholar. Never execute it.
    try{fs.writeFileSync(path.join(dir,'scholar-last-profile-response.html'),html,{mode:0o600});}catch{}
    const entries=parseProfile(html,source);let added=0;
    for(const incoming of entries){
      let item=state.entries.find(e=>e.sourceIds.includes(incoming.sourceId));
      if(!item)item=state.entries.find(e=>(incoming.doi&&e.doi===incoming.doi)||(titleKey(e.title)===titleKey(incoming.title)&&e.year===incoming.year&&overlaps(authorKeys(e.authors),authorKeys(incoming.authors))));
      if(item){const same=titleKey(item.title)===titleKey(incoming.title);const doi=incoming.doi||(same?item.doi:'');const publisherUrl=incoming.publisherUrl||(same?item.publisherUrl:'');if(!same)delete item.lookup;item.sourceIds=[...new Set([...item.sourceIds,incoming.sourceId])];Object.assign(item,incoming,{doi,publisherUrl,lastSeenAt:now()});}
      else {item={id:idHash(source.id+':'+incoming.sourceId),...incoming,sourceIds:[incoming.sourceId],firstSeenAt:now(),lastSeenAt:now(),ignored:false};state.entries.push(item);if(matchPaper(item,readAllPapers()).status!=='existing')added++;}
    }
    state.lastSuccessAt=now();state.titleParserVersion=TITLE_PARSER_VERSION;state.lastOutcome='success';state.lastErrorCode='';state.lastScanned=entries.length;state.newCandidates=added;state.lastError='';save();
  }catch(e){state.lastErrorCode=e.code||'unknown';state.lastOutcome=e.code==='blocked'||e.code==='needs_verification'?'blocked':e.code==='policy_blocked'?'policy_blocked':'failed';state.lastError=e.code?e.message:'网络或页面读取失败，本次检查未完成；上次结果保留';state.nextAutomaticAt=now()+Math.max(DAY,e.retryAfter||0);state.manualAllowedAt=state.nextAutomaticAt;save();}
  return status();
 }
 function check(trigger='manual'){
  if(inFlight)return inFlight;
  if(!source||corrupt)return Promise.resolve(status());
  const networkFailure=state.lastOutcome==='failed'&&(state.lastErrorCode==='network_error'||(!state.lastErrorCode&&state.lastError.startsWith('网络或页面读取失败')));
  const explicitNetworkRetry=trigger==='network-retry'&&networkFailure&&now()>=(state.lastNetworkRetryAt||0)+MANUAL_GAP;
  const allowed=trigger==='automatic'?state.nextAutomaticAt:explicitNetworkRetry?0:state.manualAllowedAt;
  if((trigger==='automatic'&&!state.enabled)||now()<allowed){schedule();return Promise.resolve({...status(),deferred:true});}
  if(explicitNetworkRetry)state.lastNetworkRetryAt=now();
  inFlight=perform().then(()=>{inFlight=null;schedule();return status();},e=>{inFlight=null;schedule();throw e;});return inFlight;
 }
 function configure(enabled){if(typeof enabled!=='boolean')throw error('自动检查设置无效');state.enabled=enabled;save();schedule();return status();}
 function review(id,ignored){const entry=state.entries.find(e=>e.id===id);if(!entry||typeof ignored!=='boolean')throw error('候选记录或操作无效');entry.ignored=ignored;save();return status();}
 async function lookup(entry,selectedDoi){
  if(selectedDoi){const doi=doiFrom(selectedDoi);if(!entry.lookup?.options?.some(o=>o.doi===doi))throw error('请从已展示的 DOI 候选中选择');entry.doi=doi;entry.publisherUrl='https://doi.org/'+doi;save();return {ok:true,url:entry.publisherUrl,matched:true};}
  if(entry.publisherUrl)return {ok:true,url:entry.publisherUrl,matched:true};
  if(entry.lookup&&now()<(entry.lookup.expiresAt||entry.lookup.at+DAY))return entry.lookup.result;
  const query=new URL('https://api.crossref.org/works');query.search=new URLSearchParams({'query.bibliographic':entry.title,rows:'5'});
  try{
    const json=JSON.parse(await request(query.href));const options=[];
    for(const work of json.message?.items||[]){const doi=doiFrom(work.DOI),title=plain(work.title?.[0]);if(!doi||!title)continue;
      const year=Number((work['published-print']||work['published-online']||work.published||work.issued)?.['date-parts']?.[0]?.[0])||null;
      const exact=titleKey(title)===titleKey(entry.title)&&!entry.titleTruncated;
      const authorMatch=overlaps(authorKeys(entry.authors),authorKeys(work.author||[]));
      options.push({doi,title,year,venue:plain(work['container-title']?.[0]),authors:(work.author||[]).map(a=>[a.given,a.family].filter(Boolean).join(' ')||a.name||'').join(', '),confident:exact&&authorMatch&&(!entry.year||!year||Math.abs(entry.year-year)<=1)});
    }
    const unique=[...new Map(options.map(o=>[o.doi,o])).values()];const confident=unique.filter(o=>o.confident);
    const result=confident.length===1?{ok:true,matched:true,url:'https://doi.org/'+confident[0].doi}:{ok:true,matched:false,options:unique,message:unique.length?'未能唯一匹配，请核对标题、作者、年份和刊会后选择；也可手动提供出版社 URL。':'Crossref 未找到候选，请从 Scholar 条目手动查看出版社 URL。'};
    entry.lookup={at:now(),expiresAt:now()+DAY,options:unique,result};if(result.matched){entry.doi=confident[0].doi;entry.publisherUrl=result.url;}save();return result;
  }catch(e){const result={ok:false,error:'未能从 Crossref 查询 DOI，本次没有修改论文数据；请稍后重试或手动提供 URL。'};entry.lookup={at:now(),expiresAt:now()+Math.max(MANUAL_GAP,e.retryAfter||0),options:[],result};save();return result;}
 }
 function resolve(id,doi){const entry=state.entries.find(e=>e.id===id);if(!entry)return Promise.reject(error('候选论文不存在'));if(resolving.has(id))return resolving.get(id);const promise=lookup(entry,doi).finally(()=>resolving.delete(id));resolving.set(id,promise);return promise;}
 function start(){started=true;schedule();}
 function stop(){started=false;if(timer)clearTimeout(timer);timer=null;}
 // Reparse only a recent successful local snapshot; no Scholar request and no website edits.
 if(source&&!corrupt&&state.lastOutcome==='success'&&(state.titleParserVersion||0)<TITLE_PARSER_VERSION){
  const snapshot=path.join(dir,'scholar-last-profile-response.html');
  try{
   const stat=fs.lstatSync(snapshot);
   if(!stat.isSymbolicLink()&&stat.size<=2*1024*1024&&Math.abs(stat.mtimeMs-state.lastSuccessAt)<60000){
    const parsed=parseProfile(fs.readFileSync(snapshot,'utf8'),source);let repaired=0;
    for(const entry of state.entries){const record=parsed.find(p=>(entry.sourceIds||[entry.sourceId]).includes(p.sourceId));if(!record)continue;
     if(entry.title!==record.title){entry.title=record.title;delete entry.lookup;repaired++;}
     entry.titleMathUnresolved=record.titleMathUnresolved;entry.titleTruncated=record.titleTruncated;
    }
    state.titleParserVersion=TITLE_PARSER_VERSION;state.cachedTitlesRepaired=repaired;save();
   }
  }catch{/* Keep existing records on missing, stale or non-profile snapshots. */}
 }
 return {status,check,configure,review,resolve,start,stop};
}
module.exports={createScholarWatcher,parseProfile,scholarTitle,profile,robotsAllows,matchPaper,titleKey,dedupTitleKey,authorKeys,requestText,DAY,MANUAL_GAP};
