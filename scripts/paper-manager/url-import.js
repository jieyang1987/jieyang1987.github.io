'use strict';

// The URL-first workflow deliberately reuses the existing paper review/save form.
(() => {
  let requestId = 0;
  let pending = null;
  let debounce = null;
  const labels = {title:'标题',authors:'作者',venue:'期刊/会议',year:'年份',section:'论文类型',abstract:'摘要',pdf:'PDF 链接'};

  window.showUrlImport = function (initialUrl = '') {
    if (document.getElementById('url-import-panel')) {
      if (!initialUrl) { document.getElementById('paper-import-url').focus(); return true; }
      if (document.getElementById('f-title') && !confirm('切换候选论文会替换当前未保存的导入草稿。继续吗？')) return false;
      const existingInput = document.getElementById('paper-import-url');
      existingInput.value = initialUrl; existingInput.dispatchEvent(new Event('input', { bubbles: true })); existingInput.focus(); return true;
    }
    if (document.getElementById('f-title') && !confirm('打开 URL 新增入口将离开当前编辑表单，未保存内容不会保留。继续吗？')) return false;
    requestId++;
    pending?.abort(); clearTimeout(debounce);
    selectedId = null; currentDetailId = null;
    renderList();
    const detail = document.getElementById('detail');
    detail.innerHTML = `
      <section id="url-import-panel">
        <div class="detail-header">
          <h2>从 URL 添加网站论文</h2>
          <div class="venue-line">粘贴论文链接或 DOI → 自动补齐 → 复核后保存。不会自动发布网站。</div>
        </div>
        <div class="form-section">
          <label for="paper-import-url">新发表论文的 URL / DOI</label>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input class="form-control code" id="paper-import-url" placeholder="https://doi.org/10.… 或出版社论文链接" autocomplete="off">
            <button class="btn btn-primary" id="paper-import-fetch" style="white-space:nowrap">获取信息</button>
          </div>
          <div class="field-meta">粘贴完整链接后自动开始；也可按 Enter。无法核实的字段保持空白，不会生成虚构摘要或作者。</div>
        </div>
        <div id="paper-import-status" role="status" aria-live="polite"></div>
        <div id="extract-loading" style="display:none"></div>
        <div id="extract-form" style="display:none"></div>
      </section>`;
    const panel = document.getElementById('url-import-panel');
    const input = document.getElementById('paper-import-url');
    const button = document.getElementById('paper-import-fetch');
    const status = document.getElementById('paper-import-status');
    const draft = document.getElementById('extract-form');
    const run = async () => {
      clearTimeout(debounce);
      const value = input.value.trim(); if (!value) return;
      const id = ++requestId; pending?.abort(); pending = new AbortController();
      draft.innerHTML = ''; draft.style.display = 'none';
      button.disabled = true; button.textContent = '获取中…';
      status.textContent = '正在识别论文并从公开元数据来源补齐，可能需要几十秒…';
      try {
        const response = await fetch('/api/import-url', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:value}),signal:pending.signal});
        const result = await response.json();
        if (id !== requestId || !panel.isConnected || input.value.trim() !== value) return;
        if (!response.ok || !result.ok) throw new Error(result.error || '请求失败');
        const meta = result.metadata;
        status.innerHTML = '';
        const summary = document.createElement('div'); summary.className = 'form-section';
        const heading = document.createElement('h3'); heading.textContent = meta.identified ? '已取得论文信息，请复核' : '未能可靠识别论文'; summary.appendChild(heading);
        const source = document.createElement('p'); source.textContent = '来源：' + (meta.source || '尚未取得可用元数据'); summary.appendChild(source);
        if (meta.missing?.length) {
          const missing = document.createElement('p'); missing.style.color = 'var(--warning)';
          missing.textContent = '未取得：' + meta.missing.map(k=>labels[k]||k).join('、') + '。必填项需补齐后才能保存。'; summary.appendChild(missing);
        }
        for (const warning of meta.warnings || []) { const p = document.createElement('p'); p.className = 'field-meta'; p.textContent = warning; summary.appendChild(p); }
        status.appendChild(summary);
        if (result.duplicates?.length) {
          const p = document.createElement('p'); p.textContent = '网站已经有这篇论文，不会重复新增：'; summary.appendChild(p);
          for (const existing of result.duplicates) { const b = document.createElement('button'); b.className='btn btn-secondary'; b.textContent=existing.title; b.addEventListener('click',()=>selectPaper(existing.id));summary.appendChild(b); }
          return;
        }
        if (!meta.identified) return;
        renderNewPaperForm(meta, {year:meta.year,venueInfo:{name:meta.venue,type:meta.section === 'conferences'?'conference':'journal'}},meta.pdf||'','URL 导入');
        document.getElementById('f-url').value = meta.url;
        document.getElementById('f-url').readOnly = true;
        document.getElementById('f-url').title = '修改导入链接请使用上方 URL 输入框，以便重新识别论文';
        document.getElementById('f-groupYear').value = meta.year || '';
        const type = document.getElementById('f-section');
        if (!meta.section) {const blank = document.createElement('option');blank.value='';blank.textContent='未识别，请选择';type.prepend(blank);}
        type.value = meta.section || '';
        document.getElementById('f-venueHighlight').checked = !!meta.venueHighlight;
        for (const topic of meta.topics || []) pickTopic(topic);
        const doi = document.createElement('input');doi.type='hidden';doi.id='f-doi';doi.value=meta.doi||'';draft.appendChild(doi);
        for (const [field, src] of Object.entries(meta.fieldSources || {})) {
          const element=document.getElementById(field==='year'?'f-groupYear':'f-'+field);
          if(element) element.title='自动补全来源：'+src;
        }
        // Replace PDF-import-specific help and retry action in the shared form.
        const authorsHint=document.getElementById('f-authors').parentElement.querySelector('.field-meta:not(.author-format-preview)');
        if(authorsHint)authorsHint.textContent='来自论文元数据；请确认作者次序，通讯作者需要你核实后加 *。';
        const titleHint=document.getElementById('f-title').parentElement.querySelector('.field-meta');
        if(titleHint)titleHint.textContent='来自：'+(meta.fieldSources.title||meta.source);
        const venueHint=document.getElementById('f-venue').parentElement.querySelector('.field-meta');
        if(venueHint)venueHint.textContent=meta.venue?'来自：'+(meta.fieldSources.venue||meta.source):'未取得正式发表刊会，请核实后填写。';
        const pdfHint=document.getElementById('f-pdf').parentElement.querySelector('.field-meta');
        if(pdfHint)pdfHint.textContent=meta.pdf?'已取得外部 PDF 链接，尚未下载本地文件；请确认可访问。':'未取得 PDF 不影响保存，可之后补充。';
        const retry=draft.querySelector('.actions .btn-secondary');
        if(retry)retry.remove();
        const localNote=document.createElement('p');localNote.className='field-meta';localNote.textContent='保存只更新本地网站数据；奖项、英文别名等不由抓取结果猜测。';draft.appendChild(localNote);
      } catch(error) {
        if (error.name !== 'AbortError' && id === requestId && panel.isConnected) status.textContent='获取失败：'+error.message+'。可以换 DOI 链接重试。';
      } finally {
        if(id===requestId&&panel.isConnected){button.disabled=false;button.textContent='重新获取';}
      }
    };
    button.addEventListener('click',run);
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run();}});
    input.addEventListener('input',()=>{
      ++requestId;pending?.abort();clearTimeout(debounce);button.disabled=false;button.textContent='获取信息';
      draft.innerHTML='';draft.style.display='none';status.textContent='';
      if(/^(https?:\/\/\S+|(?:doi:\s*)?10\.\d{4,9}\/\S+)$/i.test(input.value.trim()))debounce=setTimeout(run,650);
    });
    if (initialUrl) { input.value = initialUrl; input.dispatchEvent(new Event('input', { bubbles: true })); }
    input.focus();
    return true;
  };
})();
