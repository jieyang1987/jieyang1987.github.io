/* Shared bilingual page renderer. The approved English components serve both languages. */
(function () {
  'use strict';
  const lang = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
  const t = (en, zh) => lang === 'zh' ? zh : en;
  const kind = document.body.dataset.page || document.body.dataset.enPage;
  const content = document.getElementById('page-content');
  const routeMap = {
    'index.html': 'index_en.html', 'research.html': 'research_en.html',
    'publications.html': 'publications_en.html', 'chip_gallery.html': 'chip_gallery_en.html',
    'coverage.html': 'coverage_en.html', 'join.html': 'join_en.html',
    'book-item-bci.html': 'book-item-bci_en.html'
  };
  const localizedRoutes = lang === 'en' ? routeMap : Object.fromEntries(Object.entries(routeMap).map(([zh, en]) => [en, zh]));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function href(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.href);
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return '';
      if (url.origin === location.origin) {
        const filename = url.pathname.split('/').pop();
        if (localizedRoutes[filename]) url.pathname = url.pathname.replace(filename, localizedRoutes[filename]);
      }
      return url.href;
    } catch (_) { return ''; }
  }
  function text(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value ?? '');
    return template.content.textContent || '';
  }
  function rich(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value ?? '');
    const allowed = new Set(['P','STRONG','B','EM','I','SUP','SUB','BR','UL','OL','LI','A','SPAN']);
    for (const element of [...template.content.querySelectorAll('*')]) {
      if (['SCRIPT','STYLE','IFRAME','OBJECT','EMBED'].includes(element.tagName)) { element.remove(); continue; }
      if (!allowed.has(element.tagName)) { element.replaceWith(...element.childNodes); continue; }
      const link = element.tagName === 'A' ? href(element.getAttribute('href')) : '';
      for (const attr of [...element.attributes]) element.removeAttribute(attr.name);
      if (link) {
        element.setAttribute('href', link);
        if (new URL(link).origin !== location.origin && !link.startsWith('mailto:')) {
          element.setAttribute('target', '_blank'); element.setAttribute('rel', 'noopener');
        }
      }
    }
    return template.innerHTML;
  }
  async function json(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(path, {cache: 'no-cache', signal: controller.signal});
      if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function external(url, label, cls = '') {
    const address = href(url);
    return address ? `<a class="${cls}" href="${esc(address)}" target="_blank" rel="noopener">${label}</a>` : label;
  }
  function imageButton(source, title, extra = '') {
    return `<button type="button" class="en-image-button ${extra}" data-image="${esc(href(source))}" data-title="${esc(text(title))}" aria-label="${t('Enlarge image: ', '放大图片：')}${esc(text(title))}"><img src="${esc(href(source))}" alt="${esc(text(title))}" loading="lazy"></button>`;
  }
  const noun = (count, singular) => count === 1 ? singular : singular + 's';
  function chipImage(path) { return String(path).replace(/\.(jpg|jpeg|png)$/i, '.webp'); }
  function errorMessage(message) {
    content.innerHTML = `<div class="en-error" role="alert"><p>${esc(message)}</p><button type="button" class="en-button" data-reload>${t('Reload page', '重新加载')}</button></div>`;
  }
  function initialAnchor() {
    if (!location.hash) return;
    try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({block:'start'}); } catch (_) { /* malformed external fragment */ }
  }

  const topLink = document.querySelector('.en-top-link');
  if (topLink) {
    const showTopLink = () => { topLink.hidden = window.scrollY < 600; };
    window.addEventListener('scroll', showTopLink, {passive:true});
    showTopLink();
  }

  const menu = document.querySelector('.mobile-nav');
  menu?.addEventListener('click', event => { if (event.target.closest('a')) menu.open = false; });
  menu?.addEventListener('keydown', event => {
    if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); }
  });
  const dialog = document.getElementById('content-dialog');
  let returnFocus = null;
  const abstracts = new Map();
  function openDialog(title, body, opener) {
    document.getElementById('dialog-title').textContent = text(title);
    document.getElementById('dialog-body').innerHTML = body;
    returnFocus = opener;
    dialog.showModal();
    dialog.querySelector('.dialog-close').focus();
  }
  dialog?.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog?.addEventListener('close', () => {
    document.getElementById('dialog-body').replaceChildren();
    if (returnFocus?.isConnected) returnFocus.focus();
  });
  dialog?.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
  });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-reload]')) { location.reload(); return; }
    const img = event.target.closest('[data-image]');
    if (img) { openDialog(img.dataset.title, `<img src="${esc(img.dataset.image)}" alt="${esc(img.dataset.title)}">`, img); return; }
    const button = event.target.closest('[data-abstract]');
    if (button) {
      const paper = abstracts.get(button.dataset.abstract);
      if (paper) openDialog(paper.title, rich(paper.abstract), button);
    }
  });

  async function research() {
    const data = await json('data/research.json');
    function progressMarkup(direction) {
      const textKey = lang === 'en' ? 'textEn' : 'textZh';
      const candidates = Array.isArray(direction.progressHighlights) ? direction.progressHighlights : [];
      const items = candidates.filter(item => item && typeof item[textKey] === 'string' && item[textKey].trim() && /^\d{4}$/.test(String(item.year)))
        .map(item => ({...item, address: href(item.href)}))
        .filter(item => /^https?:/i.test(item.address)).slice(0, 2);
      if (!items.length) return '';
      const headingId = direction.id + '-progress-heading';
      return '<section class="en-research-progress" aria-labelledby="' + esc(headingId) + '"><h3 class="en-research-progress-heading" id="' + esc(headingId) + '">' + t('Progress at a glance', '进展速览') + '</h3><ul class="en-research-progress-list">' + items.map(item => {
        const label = item.paperLabel || t('Paper', '论文');
        const external = new URL(item.address).origin !== location.origin;
        return '<li class="en-research-progress-item"><time datetime="' + item.year + '">' + item.year + '</time><div class="en-research-progress-body"><span class="en-research-progress-text">' + esc(item[textKey]) + '</span> <a class="en-research-progress-link" href="' + esc(item.address) + '" title="' + esc(text(item.paperTitle || label)) + '"' + (external ? ' target="_blank" rel="noopener"' : '') + '>' + esc(label) + ' <span aria-hidden="true">↗</span></a></div></li>';
      }).join('') + '</ul></section>';
    }

    function researchNavigation() {
      const groups = [
        {id: 'current', title: t('Current research', '当前研究')},
        {id: 'earlier', title: t('Earlier research', '早期研究'), note: t('Doctoral and postdoctoral work', '博士及博士后阶段')}
      ];
      return '<nav class="zh-research-nav" aria-label="' + t('Research areas', '研究方向索引') + '"><button type="button" class="research-nav-toggle" id="research-nav-toggle" aria-expanded="false" aria-controls="research-nav-content"><span>' + t('Browse research areas', '研究方向导航') + '</span><span class="research-nav-closed">' + t('Expand', '展开') + ' ⌄</span><span class="research-nav-open">' + t('Collapse', '收起') + ' ⌃</span></button><div id="research-nav-content" class="research-nav-content" data-expanded="false">' + groups.map(group => {
        const directions = data.directions.filter(d => (d.navigation?.group || 'current') === group.id);
        if (!directions.length) return '';
        return '<div class="zh-research-nav-group"><div class="zh-research-nav-heading" id="research-nav-' + group.id + '">' + group.title +
          (lang === 'en' && group.note ? '<span class="zh-research-nav-note">' + esc(group.note) + '</span>' : '') +
          '</div><div class="zh-research-nav-body"><ul class="zh-research-nav-links" aria-labelledby="research-nav-' + group.id + '">' +
          directions.map((d,i) => '<li>' + (i ? '<span class="zh-research-nav-separator" aria-hidden="true">·</span>' : '') + '<a href="#' + esc(d.id) + '">' + esc((lang === 'en' ? d.navigation?.labelEn : d.navigation?.labelZh) || d.title[lang]) + '</a></li>').join('') + '</ul>' +
          (lang === 'zh' && group.note ? '<span class="zh-research-nav-note">' + t('(', '（') + group.note + t(')', '）') + '</span>' : '') + '</div></div>';
      }).join('') + '</div></nav>';
    }

    content.innerHTML = researchNavigation() + data.directions.map(d => {
      const paragraphs = d.content[lang].match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [d.content[lang]];
      const im = (d.images || [])[0];
      const source = image => lang === 'en' ? image.srcEn || image.src : image.src;
      const lead = rich(paragraphs[0]);
      const detailsLabel = '<span class="research-narrative-open">' + t('View research details &amp; publications', '展开完整研究脉络与相关论文') + '</span><span class="research-narrative-close">' + t('Hide research details', '收起研究脉络') + '</span>';
      const details = paragraphs.length > 1 ? '<details class="en-details"><summary>' + detailsLabel + '</summary><div>' + rich(paragraphs.slice(1).join('')) + '</div></details>' : '';
      const progress = progressMarkup(d);
      const mobileSummary = lang === 'en' ? (d.mobileSummaryEn || d.summary?.en) : d.mobileSummaryZh;
      const headingCopy = progress + '<div class="en-research-copy en-research-lead">' + lead + '</div>' +
        (details ? '<div class="en-research-copy en-research-continuation">' + details + '</div>' : '');
      return '<article class="en-research-card en-surface" id="' + esc(d.id) + '"><div class="en-research-top' + (!im ? ' en-research-top--text-only' : '') + '">' +
        (im ? '<div class="en-research-figure">' + imageButton(source(im), im.caption?.[lang] || d.title[lang]) + '<span class="en-image-hint">' + t('Click the diagram to enlarge','点击示意图查看大图') + '</span></div>' : '') +
        '<div class="en-research-heading' + (!im ? ' en-research-heading--text-only' : '') + '"><h2>' + esc(d.title[lang]) + '</h2>' + (mobileSummary ? '<div class="research-mobile-intro' + (progress ? ' research-mobile-intro--with-progress' : '') + '">' + (im ? imageButton(source(im), im.caption?.[lang] || d.title[lang], 'research-mobile-diagram') : '') + '<p>' + esc(mobileSummary) + '</p></div>' : '') + headingCopy + '</div></div>' +
        (d.images?.length > 1 ? '<div class="en-event-images">' + d.images.slice(1).map(image=>imageButton(source(image),image.caption?.[lang]||d.title[lang])).join('') + '</div>' : '') + '</article>';
    }).join('');
    {
      // Move the existing lead paragraph, rather than duplicating the full narrative.
      const narrow=window.matchMedia('(max-width: 760px)');
      function syncResearchLayout() {
        for(const heading of content.querySelectorAll('.en-research-heading')) {
          if(!heading.querySelector('.research-mobile-intro')) continue;
          const lead=heading.querySelector('.en-research-lead');
          const continuation=heading.querySelector('.en-research-continuation');
          const body=continuation?.querySelector('.en-details > div');
          if(!lead||!body) continue;
          const progress=heading.querySelector('.en-research-progress');
          if(narrow.matches) {
            body.prepend(lead);
            if(progress) heading.insertBefore(progress,continuation);
          } else {
            heading.insertBefore(lead,continuation);
            if(progress) heading.insertBefore(progress,lead);
          }
        }
      }
      syncResearchLayout();
      narrow.addEventListener('change',syncResearchLayout);
      const toggle=document.getElementById('research-nav-toggle');
      const panel=document.getElementById('research-nav-content');
      function setNavigation(open) {
        toggle.setAttribute('aria-expanded',String(open));
        panel.setAttribute('data-expanded',String(open));
      }
      content.addEventListener('click',event=>{
        if(event.target.closest('#research-nav-toggle')) setNavigation(toggle.getAttribute('aria-expanded')!=='true');
        else if(event.target.closest('.zh-research-nav-links a')&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey) setNavigation(false);
      });
      content.addEventListener('keydown',event=>{
        if(event.key==='Escape'&&event.target.closest('.zh-research-nav')&&toggle.getAttribute('aria-expanded')==='true') {
          setNavigation(false);
          toggle.focus();
        }
      });
    }
    initialAnchor();
  }

  async function chips() {
    const data = await json('data/chips.json');
    content.innerHTML = `<div class="en-filter-group" role="group" aria-label="${t('Filter chips by category','按芯片类别筛选')}">${data.filters.map(f=>`<button type="button" class="en-filter-button" data-category="${esc(f.id)}" aria-pressed="${f.id==='all'}">${esc(f[lang])}</button>`).join('')}</div><p class="en-results-status" id="chip-count" role="status"></p><div class="en-chip-grid" id="chip-grid"></div>`;
    function draw(category) {
      const items = data.chips.filter(c => category === 'all' || (Array.isArray(c.category)?c.category.includes(category):c.category===category));
      document.getElementById('chip-count').textContent = t(`${items.length} of ${data.chips.length} chip designs`,`显示 ${items.length} / ${data.chips.length} 项芯片设计`);
      document.getElementById('chip-grid').innerHTML = items.map(c=>{
        const features = c.features?.[lang] || [];
        const featureList = features.length ? `<ul>${features.map(f=>`<li>${rich(f)}</li>`).join('')}</ul>` : '';
        // Keep the Chinese gallery compact without discarding technical details.
        const specifications = lang === 'zh' && featureList
          ? `<details class="en-chip-details"><summary aria-label="${esc(c.title[lang])}：芯片特点">芯片特点</summary>${featureList}</details>`
          : featureList;
        return `<article class="en-chip-card en-surface">${imageButton(chipImage(c.image), c.title[lang])}<h2>${esc(c.title[lang])}</h2>${specifications}<div class="en-chip-papers">${(c.papers||[]).map(p=>external(p.url,esc(p[lang])+' ↗')).join('')}</div></article>`;
      }).join('');
    }
    content.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{
      content.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      draw(button.dataset.category);
    }));
    draw('all');
  }

  async function publications() {
    const index = await json('data/publications.json');
    const results = await Promise.allSettled(index.yearlyFiles.map(y=>json(y.file)));
    const papers = [];
    results.forEach(result=>{
      if (result.status !== 'fulfilled') return;
      ['journals','conferences'].forEach(type=>(result.value[type]||[]).forEach(group=>(group.items||[]).forEach(p=>papers.push({...p,year:group.year,type}))));
    });
    if (!papers.length) throw new Error(t('No publication records available.','暂无可加载的论文记录。'));
    papers.sort((a,b)=>Number(b.year)-Number(a.year));
    papers.forEach((p,i)=>{ if(lang==='en'){p.title=p.titleEn||p.title;p.venue=p.venueEn||p.venue;} p.key=String(i); if(p.abstract) abstracts.set(p.key,p); });
    const years=[...new Set(papers.map(p=>p.year))];
    const yearLabel=y=>Number(y)<=2020?t('2020 and earlier','2020 及以前'):String(y);
    const requestedPaper = new URLSearchParams(location.search || '').get('paper');
    const linkedPaper = requestedPaper ? papers.find(p => {
      if (p.url === requestedPaper) return true;
      try {
        const url = new URL(p.url);
        return url.hostname === 'ieeexplore.ieee.org' && url.pathname.match(/\/document\/(\d+)\/?$/)?.[1] === requestedPaper;
      } catch (_) { return false; }
    }) : null;
    const partial=results.some(r=>r.status==='rejected');
    const allJournals=papers.filter(p=>p.type==='journals').length;
    const allConferences=papers.filter(p=>p.type==='conferences').length;
    const journalShare=(100*allJournals/papers.length).toFixed(2);
    const conferenceShare=(100*allConferences/papers.length).toFixed(2);
    const overview='<aside class="pub-overview" id="pub-overview" aria-label="'+t('Publication overview','论文发表统计')+'"><div class="pub-overview-summary"><div class="pub-overview-total"><span class="pub-overview-number">'+papers.length+'</span><span class="pub-overview-unit">'+t('publications','篇论文')+'</span></div><div class="pub-type-bar" role="img" aria-label="'+t(allJournals+' journal papers, '+allConferences+' conference papers','期刊 '+allJournals+' 篇，会议 '+allConferences+' 篇')+'"><span class="pub-type-journals" style="width:'+journalShare+'%"></span><span class="pub-type-conferences" style="width:'+conferenceShare+'%"></span></div><div class="pub-overview-legend"><span><i class="pub-type-journals" aria-hidden="true"></i>'+t('Journals','期刊')+' <span class="pub-overview-value">'+allJournals+'</span></span><span><i class="pub-type-conferences" aria-hidden="true"></i>'+t('Conferences','会议')+' <span class="pub-overview-value">'+allConferences+'</span></span></div></div><div class="pub-venue-panel" id="pub-venue-panel" data-expanded="false" hidden><h2 class="pub-venue-panel-title">'+t('Selected venue distribution','部分期刊与会议分布')+'</h2><div id="venue-stats" hidden></div><button type="button" class="pub-stats-toggle" id="venue-stats-toggle" aria-expanded="false" aria-controls="venue-stats" hidden><span class="pub-disclosure-action"><span class="pub-disclosure-closed">'+t('View more','展开全部')+'</span><span class="pub-disclosure-open">'+t('View less','收起图表')+'</span><span class="pub-stats-chevron" aria-hidden="true"></span></span></button></div></aside>';

    content.innerHTML = `${requestedPaper&&!linkedPaper?`<p class="en-notice" role="status">${t('The linked publication could not be found. Browse the available records below or reload this page.','暂未找到所链接的论文，请浏览下方记录；如有数据加载提示，请刷新重试。')}</p>`:''}${partial?`<p class="en-notice" role="alert">${t('Some yearly files could not be loaded. The available records are shown below. Reload to try again.','部分年份数据加载失败，下面显示已加载的记录。请刷新重试。')}</p>`:''}${linkedPaper?`<p class="en-results-status pub-selection-note">${t('Showing the selected publication.','当前显示所选论文。')} <a class="pub-show-all" href="${lang==='zh'?'publications.html':'publications_en.html'}#publication-results">${t('View all publications','查看全部论文')}</a></p>`:''}${overview}<div class="pub-results-summary"><nav class="pub-section-nav" id="publication-section-nav" aria-label="${t('Jump to publication category','论文分类跳转')}" hidden></nav></div><p class="en-muted pub-controls-note">${t('An asterisk (*) marks a corresponding author.','* 表示通信作者。')}</p><div id="publication-results"></div>`;
    {
      const heading=document.querySelector('.en-page-heading');
      const overviewNode=document.getElementById('pub-overview');
      if(heading&&overviewNode) {
        heading.classList.add('pub-heading-with-overview');
        heading.append(overviewNode);
      }
      const stats=document.getElementById('venue-stats'), toggle=document.getElementById('venue-stats-toggle');
      const venuePanel=document.getElementById('pub-venue-panel');
      stats.hidden=true;
      toggle.hidden=true;
      venuePanel.hidden=true;
      if(typeof window.renderVenueStats==='function') {
        const available=window.renderVenueStats(papers,stats,lang);
        if(available!==false && stats.innerHTML) {
          venuePanel.hidden=false;
          toggle.hidden=false;
          toggle.setAttribute('aria-expanded','false');
          const narrow=window.matchMedia('(max-width: 760px)');
          function syncVenuePreview() {
            const expanded=toggle.getAttribute('aria-expanded')==='true';
            venuePanel.setAttribute('data-expanded',String(expanded));
            stats.hidden=narrow.matches&&!expanded;
          }
          syncVenuePreview();
          narrow.addEventListener('change',syncVenuePreview);
          toggle.addEventListener('click',()=>{
            toggle.setAttribute('aria-expanded',String(toggle.getAttribute('aria-expanded')!=='true'));
            syncVenuePreview();
          });
        }
      }
    }
    function paperHTML(p) {
      return `<li class="en-publication"><h4>${external(p.url,esc(text(p.title)))}</h4><p class="en-pub-authors">${rich(p.authors)}</p><p class="en-pub-venue">${rich(p.venue)}</p><div class="en-pub-links">${p.url?external(p.url,t('Publisher ↗','出版链接 ↗')):''}${p.pdf?external(p.pdf,'PDF ↗'):''}${p.abstract?`<button type="button" class="en-text-button" data-abstract="${p.key}" aria-label="${t('Read abstract: ','阅读摘要：')}${esc(text(p.title))}">${t('Abstract','摘要')}</button>`:''}${p.award?`<span class="en-award">${esc(text(p.award[lang]||p.award))}</span>`:''}</div></li>`;
    }
    function draw() {
      const selected=linkedPaper?[linkedPaper]:papers;
      const journals=selected.filter(p=>p.type==='journals').length, conferences=selected.filter(p=>p.type==='conferences').length;
      {
        const nav=document.getElementById('publication-section-nav');
        nav.innerHTML=[journals?'<a href="#journal"><span class="pub-desktop-only">'+t('Journal papers','期刊论文')+'<span aria-hidden="true"> ↓</span></span><span class="pub-mobile-only">'+t('Journals','期刊')+' '+journals+'</span></a>':'',conferences?'<a href="#conference"><span class="pub-desktop-only">'+t('Conference papers','会议论文')+'<span aria-hidden="true"> ↓</span></span><span class="pub-mobile-only">'+t('Conferences','会议')+' '+conferences+'</span></a>':''].join('');

        nav.hidden=!selected.length;
      }
      document.getElementById('publication-results').innerHTML=selected.length?['journals','conferences'].map(type=>{
        const rows=selected.filter(p=>p.type===type); if(!rows.length)return '';
        const prefix=type==='journals'?'journal':'conference';
        const groups=years.filter(y=>rows.some(p=>p.year===y));
        return `<section class="en-publication-section" id="${prefix}"><h2>${type==='journals'?t('Journal papers','期刊论文'):t('Conference papers','会议论文')}</h2><nav class="en-year-jump" aria-label="${type==='journals'?t('Journal years','期刊年份导航'):t('Conference years','会议年份导航')}">${groups.map(y=>`<a href="#${prefix}-${y}">${yearLabel(y)}</a>`).join('')}</nav>${groups.map(y=>`<section class="en-pub-year en-surface" id="${prefix}-${y}"><h3>${yearLabel(y)}</h3><ol class="en-publication-list">${rows.filter(p=>p.year===y).map(paperHTML).join('')}</ol></section>`).join('')}</section>`;
      }).join(''):`<p class="en-notice">${t('No publication records are available.','暂无论文记录。')}</p>`;
    }
    draw(); initialAnchor();
  }

  async function activities() {
    const data=await json('data/coverage.json');
    const items=data.items.map((item,i)=>{
      const [y,m,d]=item.date.split('.').map(Number);
      return {...item,key:i,year:y,iso:`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,dateText:lang==='zh'?item.date:new Date(Date.UTC(y,m-1,d)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})};
    }).sort((a,b)=>b.iso.localeCompare(a.iso));
    const years=[...new Set(items.map(i=>i.year))];
    content.innerHTML='<div id="activity-results"></div>';
    document.getElementById('activity-results').innerHTML=items.length?years.map(y=>`<section><h2 class="en-activity-year">${y}</h2><ul class="en-activity-list en-surface">${items.filter(i=>i.year===y).map(i=>`<li class="en-activity" data-image-count="${i.images?.length||0}"><time datetime="${i.iso}">${i.dateText}</time><div class="en-activity-copy"><h3>${i.url?external(i.url,esc(lang==='en'?i.titleEn:i.title)):esc(lang==='en'?i.titleEn:i.title)}</h3>${i.images?.length?`<div class="en-event-images">${i.images.map(im=>imageButton(im.src,lang==='en'?i.titleEn:im.caption||i.title)).join('')}</div>`:''}</div></li>`).join('')}</ul></section>`).join(''):`<p class="en-notice">${t('No activity records are available yet.','暂无活动记录。')}</p>`;
    // Move a single existing image beside the date/title only on narrow screens.
    const narrow=window.matchMedia('(max-width: 760px)');
    function syncActivityImages() {
      const archive=document.getElementById('activity-results');
      for(const row of archive.querySelectorAll('.en-activity[data-image-count="1"]')) {
        const images=row.querySelector('.en-event-images');
        const copy=row.querySelector('.en-activity-copy');
        if(!images||!copy) continue;
        if(narrow.matches) row.prepend(images);
        else copy.append(images);
      }
    }
    syncActivityImages();
    narrow.addEventListener('change',syncActivityImages);
  }

  async function join() {
    const data=await json('data/join.json');
    const directions=data.directions.filter(d=>d.enabled!==false);
    const categories=data.categories.filter(c=>directions.some(d=>d.category===c.id));
    const block=(title,body)=>`<div class="en-join-block"><h4>${esc(title)}</h4>${body}</div>`;
    const list=values=>`<ul>${values.map(v=>`<li>${rich(v[lang])}</li>`).join('')}</ul>`;
    const card=d=>{
      const projects=(d.projects||[]).filter(p=>p[lang]);
      return `<article class="en-join-card en-surface" id="${esc(d.id)}" aria-labelledby="${esc(d.id)}-title"><h3 class="en-join-card-title" id="${esc(d.id)}-title">${esc(d.title[lang])}</h3>${d.summary?.[lang]?`<p class="en-join-summary">${rich(d.summary[lang])}</p>`:''}${projects.length?block(d.projectLabel?.[lang]||data.labels.projects[lang],list(projects)):''}${block(data.labels.work[lang],list(d.work))}${block(data.labels.positions[lang],`<div class="en-tags">${d.positions.map(p=>`<span>${esc(p[lang])}</span>`).join('')}</div>`)}${block(data.labels.background[lang],`<p>${rich(d.background[lang])}</p>`)}${d.researchLink?.[lang]?`<a class="en-join-link" href="${esc(href(d.researchLink[lang]))}">${t('Explore this research area ↗','了解这一研究方向 ↗')}</a>`:''}</article>`;
    };
    const academicOverview=items=>'<nav class="en-join-overview" aria-label="' + t('Academic openings at a glance','学术招聘方向速览') + '">' + items.map(d=>{
      const preview=d.recruitmentOverview;
      return '<a class="en-join-overview-link" href="#' + esc(d.id) + '" data-join-target="' + esc(d.id) + '" aria-controls="' + esc(d.id) + '-details"><strong>' + esc(preview?.title?.[lang] || d.title[lang]) + '</strong><span class="en-join-overview-copy">' + esc(preview?.summary?.[lang] || '') + '</span><span class="en-join-overview-action">' + t('View role requirements','查看岗位要求') + ' <span aria-hidden="true">↓</span></span></a>';
    }).join('') + '</nav>';
    // English cards lead with a short eligibility checklist; full responsibilities stay in native details.
    const englishCard=(d,shared=[])=>{
      const academic=d.category==='academic';
      const projects=(d.projects||[]).filter(p=>p.en);
      const positions=d.positions.filter(p=>!shared.some(common=>common.en===p.en));
      const highlights=d.backgroundHighlights?.en;
      const background=highlights?.length?'<ul class="en-join-qualifications">'+highlights.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul>':'<p>'+rich(d.background.en)+'</p>';
      const positionList='<p class="en-join-position-list">'+positions.map(p=>esc(p.en)).join(' · ')+'</p>';
      return '<article class="en-join-card en-surface en-join-compact-card" id="'+esc(d.id)+'" aria-labelledby="'+esc(d.id)+'-title"><h3 class="en-join-card-title" id="'+esc(d.id)+'-title">'+esc(d.title.en)+'</h3>'+
        (!academic&&d.summary?.en?'<p class="en-join-role-intro">'+rich(d.summary.en)+'</p>':'')+
        (!academic?block(data.labels.positions.en,positionList):'')+
        '<div class="en-join-background"><h4>'+esc(data.labels.background.en)+'</h4>'+background+'</div>'+
        '<details class="en-join-role-details" id="'+esc(d.id)+'-details"><summary><span class="en-join-details-closed">View role details</span><span class="en-join-details-open">Hide role details</span></summary>'+
        block(data.labels.work.en,list(d.work))+
        (d.backgroundNote?.en?block('Additional background', '<p>'+rich(d.backgroundNote.en)+'</p>'):'')+
        (academic&&positions.length?block('Role-specific openings',list(positions)):'')+
        (projects.length?block(d.projectLabel?.en||data.labels.projects.en,list(projects)):'')+
        (d.researchLink?.en?'<a class="en-join-link" href="'+esc(href(d.researchLink.en))+'">Explore this research area ↗</a>':'')+'</details></article>';
    };
    const academicCard=(d,shared)=>{
      const projects=(d.projects||[]).filter(p=>p[lang]);
      const specificPositions=d.positions.filter(p=>!shared.some(common=>common[lang]===p[lang]));
      return '<article class="en-join-card en-surface en-join-academic-card" id="' + esc(d.id) + '" aria-labelledby="' + esc(d.id) + '-title"><h3 class="en-join-card-title" id="' + esc(d.id) + '-title">' + esc(d.title[lang]) + '</h3>' +
        '<p class="en-join-role-intro">' + esc(d.recruitmentOverview?.summary?.[lang] || '') + '</p>' +
        '<div class="en-join-background"><h4>' + esc(data.labels.background[lang]) + '</h4><p>' + rich(d.background[lang]) + '</p></div>' +
        '<details class="en-join-role-details" id="' + esc(d.id) + '-details"><summary><span class="en-join-details-closed">' + t('View role details','查看岗位详情') + '</span><span class="en-join-details-open">' + t('Hide role details','收起岗位详情') + '</span></summary>' +
        block(data.labels.work[lang],list(d.work)) +
        (specificPositions.length?block(t('Role-specific openings','方向岗位'),list(specificPositions)):'') +
        (projects.length?block(d.projectLabel?.[lang]||data.labels.projects[lang],list(projects)):'') +
        (d.researchLink?.[lang]?'<a class="en-join-link" href="' + esc(href(d.researchLink[lang])) + '">' + t('Explore this research area ↗','了解这一研究方向 ↗') + '</a>':'') + '</details></article>';
    };
    const groups=categories.map((category,i)=>{
      const items=directions.filter(d=>d.category===category.id);
      const academic=category.id==='academic';
      const shared=category.sharedPositions||[];
      const overview=academic?academicOverview(items)+(shared.length?'<p class="en-join-shared-positions"><span>' + t('Open positions','在招岗位') + '</span>' + shared.map(p=>esc(p[lang])).join(' · ') + '</p>':''):'';
      return '<section class="en-join-group" id="' + esc(category.anchor) + '" aria-labelledby="' + esc(category.anchor) + '-title"><header class="en-join-group-heading"><p class="eyebrow">' + String(i+1).padStart(2,'0') + ' / ' + (academic?'ACADEMIC':'INDUSTRY') + '</p><h2 id="' + esc(category.anchor) + '-title">' + esc(category.title[lang]) + '</h2><p>' + esc(category.description[lang]) + '</p></header>' + overview + '<div class="en-join-grid' + (academic?' en-join-grid--academic':items.length===1?' en-join-grid--single':'') + '">' + items.map(d=>lang==='en'?englishCard(d,shared):academic?academicCard(d,shared):card(d)).join('') + '</div></section>';
    }).join('');
    content.innerHTML=`<div class="en-join-intro">${rich(data.intro[lang])}</div>${document.querySelector('.en-join-actions')?'':`<nav aria-label="${esc(data.indexTitle[lang])}"><ul class="en-page-index">${categories.map((c,i)=>`<li><a href="#${esc(c.anchor)}"><span>${String(i+1).padStart(2,'0')}</span>${esc(c.title[lang])}</a></li>`).join('')}</ul></nav>`}${groups}<div class="en-join-tail"><section class="en-surface"><h2>${esc(data.general.title[lang])}</h2><ul class="en-support-list">${data.general.items.map(i=>`<li>${rich(i[lang])}</li>`).join('')}</ul></section><section class="en-surface" id="join-apply" aria-labelledby="join-apply-title" tabindex="-1"><h2 id="join-apply-title">${esc(data.contact.title[lang])}</h2><p>${rich(data.contact.text[lang])}</p></section></div>`;
    function openAcademicRole(id,focus) {
      if(!directions.some(d=>d.id===id&&(d.category==='academic'||lang==='en'))) return;
      const details=document.getElementById(id+'-details');
      if(!details) return;
      details.open=true;
      if(focus) details.querySelector('summary')?.focus({preventScroll:true});
    }
    function openLinkedRole() {
      try { openAcademicRole(decodeURIComponent(location.hash.slice(1)),false); } catch (_) { /* Ignore malformed URL fragments. */ }
    }
    content.addEventListener('click',event=>{
      if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey) return;
      const link=event.target.closest('a[data-join-target]');
      if(link) openAcademicRole(link.dataset.joinTarget,true);
    });
    window.addEventListener('hashchange',openLinkedRole);
    openLinkedRole();
    initialAnchor();
  }

  const renderers={research,publications,chips,activities,join};
  if(renderers[kind]) renderers[kind]().catch(error=>{
    console.error('Page content load failed:',error);
    errorMessage(t('This page could not load its content. Please reload or contact yangjie@westlake.edu.cn.','页面内容加载失败，请刷新重试，或联系 yangjie@westlake.edu.cn。'));
  });
})();
