'use strict';
(() => {
  const pending=new Map();let busy=false;
  const terminal=new Set(['complete','failed','cancelled']);
  const labels={queued:'等待 Chrome',resolving:'查找 PDF',needs_attention:'需要在 Chrome 操作',downloading:'下载中',importing:'核验并归档',complete:'已保存并关联',failed:'未完成',cancelled:'已取消'};
  async function api(route,body){
    const response=await fetch('/api/chrome/'+route,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
    const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'Chrome 助手请求失败');return result;
  }
  function textNode(tag,text){const el=document.createElement(tag);el.textContent=text;return el;}
  function renderJobs(jobs){
    const box=document.getElementById('chrome-job-list');if(!box)return;box.replaceChildren();
    for(const job of jobs){
      const row=textNode('div','');row.style.cssText='border-top:1px solid #e5e7eb;padding:10px 0';
      row.append(textNode('strong',job.title),textNode('p',(labels[job.state]||job.state)+'：'+(job.message||'')));
      if(job.savedPath&&job.state==='complete')row.append(textNode('code',job.savedPath));
      if(job.state==='failed'){
        const retry=textNode('button','恢复归档旧版已下载文件');retry.className='btn-mini';retry.addEventListener('click',async()=>{try{await api('recover',{id:job.id});await loadData();await refresh();showToast('已恢复归档；网站尚未发布','success');}catch(e){showToast(e.message,'error',5000);}});row.append(retry);
      }
      if(!terminal.has(job.state)&&job.state!=='importing'){
        const cancel=textNode('button','取消任务');cancel.className='btn-mini';cancel.addEventListener('click',async()=>{try{await api('cancel',{id:job.id});await refresh();}catch(e){showToast(e.message,'error');}});row.append(cancel);
      }
      box.append(row);
    }
    if(!jobs.length)box.textContent='暂无下载任务。';
  }
  async function refresh(){
    if(busy)return;busy=true;
    try{
      const status=await api('status');
      const connection=document.getElementById('chrome-connection-status');
      if(connection)connection.textContent=(status.clientVersion==='1.0.x'||status.clientVersion==='1.0.0')?'已连接旧版助手，请在 Chrome 扩展管理页重新加载，启用无另存为的直接保存流程。':status.connected?'Chrome 助手已连接，可以接收下载任务。':status.paired?'已配对，但暂未收到 Chrome 心跳；请打开扩展弹窗点击“立即检查任务”。':'尚未配对，请按下面步骤安装并连接。';
      renderJobs(status.jobs);
      for(const job of status.jobs){
        const context=pending.get(job.id);if(!context)continue;
        if(context.status.isConnected)context.status.textContent=(labels[job.state]||job.state)+'：'+(job.message||'');
        if(!terminal.has(job.state))continue;
        pending.delete(job.id);
        if(context.button.isConnected)context.button.disabled=false;
        if(job.state==='complete'){
          // Update only the PDF field; never save unrelated edits or re-render the draft.
          if(document.getElementById('f-pdf')===context.input&&context.input.value===context.before){
            context.input.value=job.savedPath;context.input.dispatchEvent(new Event('input',{bubbles:true}));
            currentDetailId=job.paperId;selectedId=job.paperId;
          }
          await loadData();
          showToast('PDF 已自动命名、保存并关联；其他未保存编辑不变，网站尚未发布','success',5000);
        }else showToast(job.message||'Chrome 下载未完成','error',5000);
      }
    }catch(error){const box=document.getElementById('chrome-connection-status');if(box)box.textContent=error.message;}
    finally{busy=false;}
  }
  window.showChromeSetup=async function(){
    const existing=document.getElementById('chrome-setup-dialog');if(existing){existing.showModal();return;}
    let status;try{status=await api('status');}catch(error){showToast(error.message,'error');return;}
    const dialog=document.createElement('dialog');dialog.id='chrome-setup-dialog';
    dialog.style.cssText='width:720px;max-width:90vw;max-height:85vh;border:1px solid #cbd5e1;border-radius:10px;padding:24px;line-height:1.6;color:#1f2937;overflow:auto;margin:auto';
    dialog.innerHTML=`<h2>连接 Chrome 论文下载助手</h2>
      <p id="chrome-connection-status" role="status"></p>
      <p><b>1.</b> 在你平时访问论文的 Chrome 中打开 <code>chrome://extensions</code>，开启开发者模式，点击“加载已解压的扩展程序”，选择下方目录。安装及权限由你自行确认。</p>
      <input id="chrome-extension-path" class="form-control code" readonly aria-label="Chrome 助手目录">
      <p><b>2.</b> PDF 将自动核验、命名并写入下方网站目录。无需选择 Chrome 下载位置，也不再弹出“另存为”。非 IEEE 下载需 v1.2 助手，请在扩展页重新加载。</p>
      <input id="chrome-target-directory" class="form-control code" readonly aria-label="网站论文保存目录">
      <p><b>3.</b> 生成一次性配对码，打开 Chrome 工具栏里的助手图标，填写本机管理地址和配对码，点击连接。配对码不是 IEEE API Key。</p>
      <p>本机管理地址：<code id="chrome-server-address"></code></p>
      <button id="chrome-pair-code" class="btn btn-primary">生成配对码（5 分钟有效）</button>
      <input id="chrome-pair-output" class="form-control code" style="margin-top:10px" readonly placeholder="生成后复制到 Chrome 助手" aria-label="一次性配对码">
      <p id="chrome-pair-result" role="status"></p>
      <p>助手只处理你手动发起的论文任务，不读取或导出 Cookie。首次访问新出版社/PDF 站点，请在 Chrome 助手弹窗点击“允许所需访问并继续”。DOI 跳转若无法识别地址，会另行询问可选的标签页地址读取权限。正常连接后约 30 秒内领取任务，也可在扩展弹窗点击“立即检查任务”。</p>
      <p><b>自动归档：</b>核验 PDF 后，按年份_刊会缩写_标题命名，保存到网站 <code>papers/</code> 并更新论文关联。同名文件自动加序号，不覆盖。由 Chrome 传输 PDF 内容，本地系统负责落盘，不使用浏览器另存为。不会自动发布网站。</p>
      <h3>下载任务</h3><div id="chrome-job-list"></div>
      <button id="chrome-setup-close" class="btn btn-secondary" style="margin-top:12px">关闭</button>`;
    document.body.append(dialog);
    dialog.querySelector('#chrome-extension-path').value=status.extensionPath;
    dialog.querySelector('#chrome-target-directory').value=status.targetDirectory;
    dialog.querySelector('#chrome-server-address').textContent=location.origin;
    dialog.querySelector('#chrome-setup-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>dialog.remove());
    dialog.querySelector('#chrome-pair-code').addEventListener('click',async()=>{
      const button=dialog.querySelector('#chrome-pair-code');button.disabled=true;
      try{
        const result=await api('pairing',{});
        const output=dialog.querySelector('#chrome-pair-output');output.value=result.code;output.focus();output.select();
        dialog.querySelector('#chrome-pair-result').textContent='请将此码复制到 Chrome 助手。连接配置只保存在本机，不进入 Git 或网站发布包。';
      }catch(error){dialog.querySelector('#chrome-pair-result').textContent=error.message;}finally{button.disabled=false;}
    });
    dialog.showModal();await refresh();
  };
  window.downloadPdfThroughChrome=async function(id){
    const p=allPapers.find(x=>x.id===id);if(!p)return;
    const input=document.getElementById('f-pdf');const button=document.getElementById('btn-chrome-pdf');const status=document.getElementById('chrome-download-status');
    if(!input||!button||!status)return;
    if(document.getElementById('f-title').value!==p.title||document.getElementById('f-url').value.trim()!==(p.url||'')||input.value.trim()!==(p.pdf||'')){
      showToast('请先保存标题、URL 或 PDF 字段的修改，再开始下载','info',4000);return;
    }
    button.disabled=true;status.textContent='正在提交 Chrome 下载任务…';
    try{
      const {job}=await api('jobs',{paperId:id});pending.set(job.id,{input,before:input.value,button,status});
      status.textContent='已排队。Chrome 助手约 30 秒内领取；需要时在扩展弹窗点击“立即检查任务”。';await refresh();
    }catch(error){button.disabled=false;status.textContent=error.message;showToast(error.message,'error',5000);}
  };
  setInterval(()=>{if(pending.size||document.getElementById('chrome-setup-dialog'))refresh();},3000);
})();
