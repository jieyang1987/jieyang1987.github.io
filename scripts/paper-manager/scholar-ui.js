'use strict';
(() => {
 let current=null,filter='pending',refreshing=false,checking=false,renderedSignature='';
 const networkRetryReady=data=>data&&data.lastOutcome==='failed'&&(data.lastErrorCode==='network_error'||(!data.lastErrorCode&&String(data.lastError||'').startsWith('网络或页面读取失败')))&&Date.now()>=(data.networkRetryAllowedAt||0);
 const labels={pending:'待录入',possible_duplicate:'疑似重复 / 不同版本',existing:'网站已有',ignored:'已忽略'};
 const date=value=>value?new Date(value).toLocaleString('zh-CN'):'—';
 const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
 async function api(route,body){const response=await fetch('/api/scholar/'+route,{...(body!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Scholar 检查请求失败');return data;}
 function notify(data){
  const button=document.getElementById('btn-scholar-inbox');if(button)button.textContent='待录入论文'+(data.pendingCount?' ('+data.pendingCount+')':'');
  const check=document.getElementById('btn-scholar-check');if(check){check.disabled=checking||data.checking;check.textContent=checking||data.checking?'Scholar 检查中…':'检查我的新论文';}
  if(data.lastOutcome==='success'&&data.newCandidates>0){try{const key='paper-manager-scholar-seen-'+data.profileId;if(Number(localStorage.getItem(key)||0)<data.lastSuccessAt){showToast('Scholar 发现 '+data.newCandidates+' 条需核对的论文，请查看待录入列表','info',6000);localStorage.setItem(key,String(data.lastSuccessAt));}}catch{}}
 }
 async function openDraft(url,dialog){if(!dialog?.isConnected)return false;if(window.showUrlImport(url)===false)return false;dialog.close();return true;}
 async function resolveCandidate(entry,button,selectedDoi){
  const dialog=document.getElementById('scholar-inbox-dialog');const box=document.getElementById('scholar-options-'+entry.id);if(!dialog||!box)return;
  button.disabled=true;box.textContent='正在查询 DOI，匹配成功后进入原有 URL 补全表单…';
  try{
   const result=await api('resolve',{id:entry.id,...(selectedDoi?{doi:selectedDoi}:{})});
   if(!dialog.isConnected||!document.getElementById('scholar-options-'+entry.id))return;
   if(result.matched&&result.url){if(!await openDraft(result.url,dialog))box.textContent='已找到 DOI；你保留了当前编辑表单，可稍后再次点击审核。';return;}
   const target=document.getElementById('scholar-options-'+entry.id);target.replaceChildren(node('p',result.message||'请核对候选信息。'));
   for(const option of result.options||[]){const row=node('div','');row.style.cssText='padding:8px;border:1px solid #e5e7eb;margin:6px 0;border-radius:5px';row.append(node('strong',option.title),node('p',[option.year,option.venue].filter(Boolean).join(' · ')),node('p',option.authors),node('code',option.doi));const choose=node('button','确认是这篇，使用此 DOI');choose.className='btn-mini';choose.addEventListener('click',()=>resolveCandidate(entry,choose,option.doi));row.append(choose);target.append(row);}
  }catch(error){if(box.isConnected)box.textContent=error.message;}finally{if(button.isConnected)button.disabled=false;}
 }
 async function viewExisting(match,dialog){await loadData();const paper=allPapers.find(p=>p.title===match.title&&p.url===match.url);if(!paper){showToast('已有论文信息发生变化，请刷新待录入列表','info');return;}if(document.getElementById('f-title')&&!confirm('离开当前编辑表单会丢弃未保存内容。继续吗？'))return;dialog.close();selectPaper(paper.id);}
 function renderEntries(data){
  const container=document.getElementById('scholar-candidates');if(!container)return;
  const signature=JSON.stringify([filter,data.entries.map(e=>[e.id,e.status,e.title,e.authors,e.venue,e.year,e.matches])]);
  if(signature===renderedSignature)return;renderedSignature=signature;container.replaceChildren();
  const visible=data.entries.filter(e=>filter==='all'||(filter==='pending'?['pending','possible_duplicate'].includes(e.status):e.status===filter));
  if(!visible.length){container.append(node('p',!data.lastSuccessAt?'尚未取得一次有效的 Scholar 列表，暂时不能判断有没有新论文。':filter==='pending'?'上次成功读取的近期列表中，没有未处理候选；这不是对 Scholar 全部历史论文的完整检查。':'此分类暂无条目。'));return;}
  for(const entry of visible){
   const card=node('section','');card.style.cssText='padding:14px;border:1px solid #e2e8f0;border-radius:6px;margin:10px 0;background:white';
   card.append(node('strong',entry.title),node('p',(labels[entry.status]||entry.status)+' · '+(entry.year||'年份未提供')));
   card.append(node('p',entry.authors||'作者信息未提供'),node('p',entry.venue||'刊会信息未提供'));
   const source=node('a','查看 Scholar 条目 ↗');source.href=entry.scholarUrl;source.target='_blank';source.rel='noopener noreferrer';card.append(source);
   card.append(node('p','首次在本工具中发现：'+date(entry.firstSeenAt)+'；不代表论文刚刚发表。'));
   if(entry.titleTruncated||entry.titleMathUnresolved)card.append(node('p','标题疑似省略或含未识别公式，请核对完整标题。'));
   for(const match of entry.matches||[]){const item=node('div','');item.append(node('p',match.reason+'：'+match.title));const view=node('button','查看网站已有条目');view.className='btn-mini';view.addEventListener('click',()=>viewExisting(match,document.getElementById('scholar-inbox-dialog')));item.append(view);card.append(item);}
   const actions=node('div','');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';
   if(entry.status!=='existing'&&entry.status!=='ignored'){const enrich=node('button','自动补全并审核');enrich.className='btn btn-primary';enrich.addEventListener('click',()=>resolveCandidate(entry,enrich));actions.append(enrich);}
   const ignore=node('button',entry.status==='ignored'?'恢复待核对':'忽略此候选');ignore.className='btn btn-secondary';ignore.addEventListener('click',async()=>{ignore.disabled=true;try{current=await api('review',{id:entry.id,ignored:entry.status!=='ignored'});render(current);}catch(error){showToast(error.message,'error');}finally{ignore.disabled=false;}});actions.append(ignore);card.append(actions);
   const options=node('div','');options.id='scholar-options-'+entry.id;card.append(options);container.append(card);
  }
 }
 function render(data){
  current=data;notify(data);const dialog=document.getElementById('scholar-inbox-dialog');if(!dialog)return;
  const status=dialog.querySelector('#scholar-check-status');const stateLabel=data.checking?'正在检查公开主页…':data.lastOutcome==='success'?'上次检查成功':data.lastOutcome==='never'?'尚未检查':'本次未能完成检查';
  status.textContent=stateLabel+(data.lastError?'：'+data.lastError:'');status.style.color=['blocked','failed','policy_blocked','storage_error'].includes(data.lastOutcome)?'var(--warning)':'var(--text)';
  dialog.querySelector('#scholar-check-times').textContent='最近尝试：'+date(data.lastAttemptAt)+'；最近成功：'+date(data.lastSuccessAt)+'；下次自动检查：'+(data.enabled?(data.nextAutomaticAt?date(data.nextAutomaticAt):'启动后检查'):'已关闭');
  dialog.querySelector('#scholar-check-summary').textContent='上次成功读取 '+data.lastScanned+' 条近期记录；当前待核对 '+data.pendingCount+' 条。失败时保留上次成功结果，不会按“没有新论文”处理。';
  const link=dialog.querySelector('#scholar-profile-link');link.href=data.profileUrl||'#';link.hidden=!data.profileUrl;
  const enabled=dialog.querySelector('#scholar-auto-enabled');enabled.checked=data.enabled;enabled.disabled=!data.configured||data.lastOutcome==='storage_error';
  const button=dialog.querySelector('#scholar-run-check');button.disabled=checking||data.checking||!data.configured;button.textContent=checking||data.checking?'检查中…':networkRetryReady(data)?'网络恢复后重试':'立即检查';
  dialog.querySelector('#scholar-rate-note').textContent=Date.now()<data.manualAllowedAt?'为避免频繁请求，手动检查最早可在 '+date(data.manualAllowedAt)+' 进行。':'手动检查至少间隔 15 分钟；遇到限流或验证时至少暂停 24 小时，不自动重试。';
  renderEntries(data);
 }
 async function refresh(){if(refreshing)return;refreshing=true;try{const data=await api('status');render(data);}catch(error){const box=document.getElementById('scholar-check-status');if(box)box.textContent='读取本机检查状态失败：'+error.message;}finally{refreshing=false;}}
 window.showScholarInbox=async function(){
  const existing=document.getElementById('scholar-inbox-dialog');if(existing){existing.showModal();await refresh();return;}
  renderedSignature='';const dialog=document.createElement('dialog');dialog.id='scholar-inbox-dialog';dialog.style.cssText='width:960px;max-width:94vw;max-height:88vh;border:1px solid #cbd5e1;border-radius:10px;padding:22px;line-height:1.6;color:#1f2937;background:#f8fafc;overflow:auto;margin:auto';
  dialog.innerHTML=`<h2>Scholar 新论文 · 待录入</h2>
   <p id="scholar-check-status" role="status" aria-live="polite">正在读取本机记录…</p>
   <p id="scholar-check-times"></p><p id="scholar-check-summary"></p>
   <p>只检查你配置的公开主页近期单页（最多 100 条），不抓取分页或详情。Scholar 是发现入口，信息需要复核；缺失条目不会从网站删除。</p>
   <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0">
    <button id="scholar-run-check" class="btn btn-primary">立即检查</button>
    <label><input type="checkbox" id="scholar-auto-enabled"> 启动时及运行期间每日自动检查</label>
    <a id="scholar-profile-link" target="_blank" rel="noopener noreferrer">打开 Scholar 主页 ↗</a>
    <button id="scholar-inbox-close" class="btn btn-secondary">关闭</button>
   </div><p id="scholar-rate-note"></p>
   <label for="scholar-view-filter">显示：</label><select id="scholar-view-filter" class="form-control" style="width:220px"><option value="pending">待录入 / 疑似重复</option><option value="existing">网站已有</option><option value="ignored">已忽略</option><option value="all">全部检查记录</option></select>
   <div id="scholar-candidates"></div>`;
  document.body.append(dialog);dialog.querySelector('#scholar-view-filter').value=filter;
  dialog.querySelector('#scholar-view-filter').addEventListener('change',event=>{filter=event.target.value;if(current)renderEntries(current);});
  dialog.querySelector('#scholar-run-check').addEventListener('click',runCheck);
  dialog.querySelector('#scholar-inbox-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>dialog.remove());
  dialog.querySelector('#scholar-auto-enabled').addEventListener('change',async event=>{const input=event.target;input.disabled=true;try{render(await api('settings',{enabled:input.checked}));}catch(error){showToast(error.message,'error');await refresh();}finally{input.disabled=false;}});
  dialog.showModal();await refresh();
 };
 async function runCheck(){
  if(checking)return;checking=true;if(current)render(current);
  try{const data=await api('check',networkRetryReady(current)?{networkRetry:true}:{});render(data);showToast(data.deferred?'未重复请求 Scholar；请等待界面显示的下次可检查时间。':data.lastOutcome==='success'?'检查完成，请在待录入列表中核对。':data.lastError||'检查未完成',data.lastOutcome==='success'&&!data.deferred?'success':'info',6000);}
  catch(error){showToast(error.message,'error');}
  finally{checking=false;await refresh();}
 }
 window.checkScholarNow=async function(){await window.showScholarInbox();await runCheck();};
 setInterval(()=>{if(document.getElementById('scholar-inbox-dialog'))refresh();},3000);
 setInterval(()=>{if(document.visibilityState!=='hidden')refresh();},60000);
 refresh();
})();
