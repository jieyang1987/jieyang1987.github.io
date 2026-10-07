/* Shared bilingual homepage. Layout and rendering are identical; copy is localized. */
(function () {
  'use strict';
  const lang = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
  const t = (en, zh) => lang === 'zh' ? zh : en;

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el && value) el.textContent = value;
  }

  function plainText(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    return template.content.textContent || '';
  }

  function escapeHTML(value) {
    return String(value || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function safeHref(value) {
    if (!value) return '';
    try {
      const url = new URL(value, window.location.href);
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }

  function link(id, value) {
    const el = document.getElementById(id);
    const href = safeHref(value);
    if (el && href) el.href = href;
  }

  async function fetchJSON(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { cache: 'no-cache', signal: controller.signal });
      if (!response.ok) throw new Error('Unable to load ' + url);
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  function safeRich(value) {
    const template = document.createElement('template'); template.innerHTML=String(value||'');
    const allowed=new Set(['P','A','STRONG','B','EM','I','SUP','SUB','BR','UL','OL','LI','H3','SECTION','DIV','SPAN','DETAILS','SUMMARY']);
    for(const el of [...template.content.querySelectorAll('*')]) {
      if(['SCRIPT','STYLE','IFRAME','OBJECT'].includes(el.tagName)){el.remove();continue;}
      if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue;}
      const url=el.tagName==='A'?safeHref(el.getAttribute('href')):'';
      for(const attr of [...el.attributes])el.removeAttribute(attr.name);
      if(el.tagName==='DETAILS')el.open=true;
      if(url){el.href=url; if(new URL(url).origin!==location.origin&&!url.startsWith('mailto:')){el.target='_blank';el.rel='noopener';}}
    }
    return template.innerHTML;
  }
  function initCvPreview() {
    const trigger = document.getElementById('link-cv');
    if (!trigger) return;
    const pdfUrl = new URL(trigger.getAttribute('href'), window.location.href);
    const approvedUrl = new URL('static/assets/cv/jie-yang-cv.pdf', window.location.href);
    if (pdfUrl.origin !== location.origin || pdfUrl.pathname !== approvedUrl.pathname) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'home-cv-dialog';
    dialog.className = 'en-dialog home-cv-dialog';
    dialog.setAttribute('aria-labelledby', 'home-cv-title');
    dialog.innerHTML = '<div class="dialog-heading"><h2 id="home-cv-title">' + t('CV preview', '简历预览') + '</h2>' +
      '<div class="home-cv-actions"><a class="home-cv-download" download="Jie-Yang-CV.pdf">' + t('Download PDF', '下载 PDF') + ' ↓</a>' +
      '<button type="button" class="dialog-close home-cv-close" aria-label="' + t('Close CV preview', '关闭简历预览') + '"><span aria-hidden="true">×</span></button></div></div>' +
      '<div class="home-cv-tools"><div class="home-cv-paging"><button type="button" data-cv-page="previous" aria-label="' + t('Previous page', '上一页') + '" disabled>‹</button>' +
      '<select class="home-cv-page-select" aria-label="' + t('Page', '页码') + '" disabled><option value="1">1</option></select><span class="home-cv-count"></span>' +
      '<button type="button" data-cv-page="next" aria-label="' + t('Next page', '下一页') + '" disabled>›</button></div><div class="home-cv-zoom-tools"><button type="button" data-cv-zoom="out" aria-label="' + t('Zoom out', '缩小') + '" disabled>−</button>' +
      '<output class="home-cv-zoom" aria-live="polite">100%</output><button type="button" data-cv-zoom="in" aria-label="' + t('Zoom in', '放大') + '" disabled>+</button>' +
      '<button type="button" data-cv-zoom="fit" disabled>' + t('Fit width', '适合宽度') + '</button></div></div>' +
      '<div class="home-cv-viewer" tabindex="0" aria-label="' + t('Scrollable CV preview', '简历阅读区，可滚动') + '"><div class="home-cv-pages"></div><p class="home-cv-status" role="status"></p></div>';
    document.body.appendChild(dialog);
    const pages = dialog.querySelector('.home-cv-pages');
    const viewer = dialog.querySelector('.home-cv-viewer');
    const status = dialog.querySelector('.home-cv-status');
    const count = dialog.querySelector('.home-cv-count');
    const zoomLabel = dialog.querySelector('.home-cv-zoom');
    const pageSelect = dialog.querySelector('.home-cv-page-select');
    const pageButtons = [...dialog.querySelectorAll('[data-cv-page]')];
    const controls = [...dialog.querySelectorAll('[data-cv-zoom]')];
    const closeButton = dialog.querySelector('.home-cv-close');
    dialog.querySelector('.home-cv-download').href = pdfUrl.href;
    let libraryPromise = null;
    let controller = null;
    let pdfTask = null;
    let pdfDocument = null;
    let renderTask = null;
    let session = 0;
    let renderId = 0;
    let zoom = 1;
    let currentPage = 1;
    let resizeTimer = null;
    let lastWidth = 0;
    let alreadyLocked = false;
    function library() {
      if (!libraryPromise) libraryPromise = import('../vendor/pdfjs/pdf.min.js').then(pdfjs => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('static/vendor/pdfjs/pdf.worker.min.js', window.location.href).href;
        return pdfjs;
      }).catch(error => { libraryPromise = null; throw error; });
      return libraryPromise;
    }
    function clearPages() {
      for (const canvas of pages.querySelectorAll('canvas')) { canvas.width = 0; canvas.height = 0; }
      pages.replaceChildren();
    }
    function errorMessage() {
      status.hidden = false;
      status.textContent = t('The preview could not be loaded. Please close and retry, or use Download PDF.', '预览加载失败，请关闭后重试，或使用上方“下载 PDF”。');
    }
    function updateControls() {
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
      pageSelect.disabled = !pdfDocument;
      pageSelect.value = String(currentPage);
      pageButtons.forEach(button => { button.disabled = !pdfDocument || (button.dataset.cvPage === 'previous' && currentPage <= 1) || (button.dataset.cvPage === 'next' && currentPage >= pdfDocument.numPages); });
      controls.forEach(button => { button.disabled = !pdfDocument || (button.dataset.cvZoom === 'out' && zoom <= .75) || (button.dataset.cvZoom === 'in' && zoom >= 4); });
    }
    async function renderCvPage() {
      if (!dialog.open || !pdfDocument) return;
      const currentSession = session;
      const currentRender = ++renderId;
      const documentToRender = pdfDocument;
      const fraction = viewer.scrollTop / Math.max(1, viewer.scrollHeight - viewer.clientHeight);
      const active = () => dialog.open && currentSession === session && currentRender === renderId;
      renderTask?.cancel();
      renderTask = null;
      clearPages();
      status.hidden = false;
      status.textContent = t('Rendering CV…', '正在显示简历…');
      updateControls();
      try {
        // Render only the selected page, so even long CVs stay light on mobile memory.
        {
          const number = currentPage;
          const page = await documentToRender.getPage(number);
          if (!active()) return;
          const original = page.getViewport({ scale: 1 });
          const scale = Math.max(120, viewer.clientWidth - 34) / original.width * zoom;
          const viewport = page.getViewport({ scale });
          const outputScale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8000000 / (viewport.width * viewport.height)));
          const sheet = document.createElement('section');
          const label = t('Page ' + number + ' of ' + documentToRender.numPages, '第 ' + number + ' 页，共 ' + documentToRender.numPages + ' 页');
          sheet.className = 'home-cv-page';
          sheet.dataset.page = String(number);
          sheet.setAttribute('aria-label', label);
          sheet.style.width = viewport.width + 'px';
          const canvas = document.createElement('canvas');
          canvas.setAttribute('aria-hidden', 'true');
          canvas.width = Math.ceil(viewport.width * outputScale);
          canvas.height = Math.ceil(viewport.height * outputScale);
          canvas.style.width = viewport.width + 'px';
          canvas.style.height = viewport.height + 'px';
          sheet.appendChild(canvas);
          pages.appendChild(sheet);
          renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0] });
          await renderTask.promise;
          if (!active()) return;
          renderTask = null;
          canvas.dataset.rendered = 'true';
          // Keep the actual PDF text available to assistive technologies, without a third-party viewer.
          const text = await page.getTextContent();
          if (!active()) return;
          const accessibleText = document.createElement('div');
          accessibleText.className = 'home-cv-page-text';
          accessibleText.textContent = text.items.map(item => item.str || '').join(' ');
          sheet.appendChild(accessibleText);
        }
        if (active()) {
          status.hidden = true;
          viewer.scrollTop = fraction * Math.max(0, viewer.scrollHeight - viewer.clientHeight);
        }
      } catch (error) {
        if (active() && error.name !== 'RenderingCancelledException') errorMessage();
      }
    }
    controls.forEach(button => button.addEventListener('click', () => {
      zoom = button.dataset.cvZoom === 'fit' ? 1 : Math.max(.75, Math.min(4, zoom + (button.dataset.cvZoom === 'in' ? .25 : -.25)));
      renderCvPage();
    }));
    function goToPage(number) {
      if (!pdfDocument || !Number.isInteger(number) || number < 1 || number > pdfDocument.numPages) return;
      currentPage = number;
      viewer.scrollTop = 0;
      renderCvPage();
    }
    pageButtons.forEach(button => button.addEventListener('click', () => goToPage(currentPage + (button.dataset.cvPage === 'next' ? 1 : -1))));
    pageSelect.addEventListener('change', () => goToPage(Number(pageSelect.value)));
    new ResizeObserver(() => {
      const width = viewer.clientWidth;
      if (width > 0 && width !== lastWidth) {
        lastWidth = width;
        clearTimeout(resizeTimer);
        if (pdfDocument && dialog.open) resizeTimer = setTimeout(renderCvPage, 120);
      }
    }).observe(viewer);
    trigger.addEventListener('click', async event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
      event.preventDefault();
      if (dialog.open) return;
      const currentSession = ++session;
      zoom = 1;
      currentPage = 1;
      pageSelect.innerHTML = '<option value="1">1</option>';
      alreadyLocked = document.documentElement.classList.contains('home-cv-open');
      document.documentElement.classList.add('home-cv-open');
      status.hidden = false;
      status.textContent = t('Opening CV…', '正在打开简历…');
      count.textContent = '';
      updateControls();
      dialog.showModal();
      closeButton.focus({ preventScroll: true });
      const currentController = new AbortController();
      controller = currentController;
      const timer = setTimeout(() => currentController.abort(), 15000);
      try {
        const [pdfjs, response] = await Promise.all([library(), fetch(pdfUrl.href, { signal: currentController.signal, cache: 'no-cache' })]);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > 20 * 1024 * 1024 || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new Error('Invalid CV PDF');
        if (!dialog.open || currentSession !== session) return;
        pdfTask = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true });
        const loaded = await pdfTask.promise;
        if (!dialog.open || currentSession !== session) return;
        pdfDocument = loaded;
        count.textContent = '/ ' + loaded.numPages;
        pageSelect.replaceChildren();
        for (let number = 1; number <= loaded.numPages; number++) {
          const option = document.createElement('option'); option.value = String(number); option.textContent = String(number); pageSelect.appendChild(option);
        }
        await renderCvPage();
      } catch (error) {
        if (dialog.open && currentSession === session) errorMessage();
      } finally {
        clearTimeout(timer);
        if (currentSession === session) controller = null;
      }
    });
    closeButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      const box = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => {
      session++;
      renderId++;
      controller?.abort();
      controller = null;
      renderTask?.cancel();
      renderTask = null;
      clearTimeout(resizeTimer);
      const task = pdfTask;
      pdfTask = null;
      pdfDocument = null;
      if (task) task.destroy().catch(() => {});
      clearPages();
      status.textContent = '';
      if (!alreadyLocked) document.documentElement.classList.remove('home-cv-open');
      trigger.focus({ preventScroll: true });
    });
  }

  function initCoverPreview() {
    const container = document.getElementById('paper-awards-list');
    if (!container) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'home-cover-dialog';
    dialog.className = 'en-dialog home-cover-dialog';
    dialog.setAttribute('aria-labelledby', 'home-cover-title');
    dialog.innerHTML = '<div class="dialog-heading"><h2 id="home-cover-title"></h2>' +
      '<button type="button" class="dialog-close home-cover-close" aria-label="' + t('Close cover preview', '关闭封面预览') + '"><span aria-hidden="true">×</span></button></div>' +
      '<img class="home-cover-image" alt="">';
    document.body.appendChild(dialog);
    const title = dialog.querySelector('#home-cover-title');
    const image = dialog.querySelector('.home-cover-image');
    const closeButton = dialog.querySelector('.home-cover-close');
    let opener = null;
    let alreadyLocked = false;
    container.addEventListener('click', event => {
      const trigger = event.target.closest('button.paper-award-cover[data-cover-src]');
      if (!trigger || !container.contains(trigger)) return;
      const src = trigger.dataset.coverSrc || '';
      // Only our local cover assets can be opened; never navigate or fetch arbitrary URLs.
      if (!/^images\/[\w/-]+\.webp$/.test(src)) return;
      opener = trigger;
      title.textContent = trigger.dataset.coverAlt || t('Journal cover', '期刊封面');
      image.alt = title.textContent;
      image.src = src;
      alreadyLocked = document.documentElement.classList.contains('home-cover-open');
      document.documentElement.classList.add('home-cover-open');
      dialog.showModal();
      closeButton.focus({ preventScroll: true });
    });
    closeButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    // Native dialog handles Escape and focus trapping; all close paths clean up here.
    dialog.addEventListener('close', () => {
      image.removeAttribute('src');
      image.alt = '';
      title.textContent = '';
      if (!alreadyLocked) document.documentElement.classList.remove('home-cover-open');
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    });
  }

  function renderPaperAwards(home) {
    const target = document.getElementById('paper-awards-list');
    if (!target) return;
    const items = (Array.isArray(home.paperAwards) ? home.paperAwards : [])
      .map((item, index) => ({ ...item, index }))
      .filter(item => item.venue && item.distinction && /^\d{4}$/.test(String(item.year)))
      .sort((a, b) => Number(b.year) - Number(a.year) || a.index - b.index);
    const list = awards => '<ul class="paper-award-list">' + awards.map(item => {
      const fullTitle = item.venue + ' · ' + item.distinction + (item.paperTitle ? ' — ' + item.paperTitle : '');
      const label = (item.venueShort || item.venue) + ' · ' + item.distinction;
      const href = safeHref(item.url);
      const title = /^https?:/i.test(href)
        ? '<a class="paper-award-title" href="' + escapeHTML(href) + '" title="' + escapeHTML(fullTitle) + '"' + (new URL(href).origin !== location.origin ? ' target="_blank" rel="noopener"' : '') + '>' + escapeHTML(label) + '</a>'
        : '<span class="paper-award-title" title="' + escapeHTML(fullTitle) + '">' + escapeHTML(label) + '</span>';
      const cover = /^images\/[\w/-]+\.webp$/.test(item.cover || '')
        ? '<button type="button" class="paper-award-cover" data-cover-src="' + escapeHTML(item.cover) + '" data-cover-alt="' + escapeHTML(item.coverAlt || label) + '" aria-haspopup="dialog" aria-controls="home-cover-dialog" aria-label="' + (english ? 'Enlarge cover: ' : '放大封面：') + escapeHTML(item.coverAlt || label) + '"><img src="' + escapeHTML(item.cover) + '" alt="' + escapeHTML(item.coverAlt || label) + '" width="42" height="58" loading="lazy"></button>' : '';
      return '<li class="paper-award-item">' + cover + '<div class="paper-award-main">' + title + '<time datetime="' + item.year + '">' + item.year + '</time></div>' +
        (item.authorRole ? '<p class="paper-award-role">' + escapeHTML(item.authorRole) + '</p>' : '') +
        (item.awardee ? '<p class="paper-award-role">' + escapeHTML(item.awardee) + '</p>' : '') +
        (item.project ? '<p class="paper-award-project">' + escapeHTML(item.project) + '</p>' : '') + '</li>';
    }).join('') + '</ul>';
    if (!items.length) { target.innerHTML = ''; return; }
    const english = document.documentElement?.lang === 'en';
    const visibleCount = english ? 3 : 4;
    const older = items.slice(visibleCount);
    const showMore = 'View more';
    const showLess = 'View less';
    target.innerHTML = list(items.slice(0, visibleCount)) + (older.length
      ? '<details class="paper-awards-more"><summary><span class="paper-awards-show-more">' + showMore + '</span><span class="paper-awards-show-less">' + showLess + '</span></summary>' + list(older) + '</details>' : '');
  }

  function renderTeachingCourses(profile) {
    const english = document.documentElement?.lang === 'en';
    const list = document.getElementById('teaching-course-list');
    if (list) {
      const courses = Array.isArray(profile.teaching?.courses) ? profile.teaching.courses : [];
      list.innerHTML = courses.filter(course => course && course.title).map(course => {
        const details = [course.years, english ? course.institutionEn : course.institutionZh, english ? course.levelEn : course.levelZh, english ? course.roleEn : course.roleZh].filter(Boolean).map(escapeHTML).join(' · ');
        return '<li class="teaching-course-item"><span class="teaching-course-title">' + escapeHTML(course.title) + '</span><span class="teaching-course-meta">' + details + '</span></li>';
      }).join('');
      list.hidden = !list.innerHTML;
    }
    const collaborators = document.getElementById('teaching-collaborators');
    if (collaborators) {
      collaborators.innerHTML = safeRich((english ? profile.teaching?.collaborationEn : profile.teaching?.collaborationZh) || '');
      collaborators.hidden = !collaborators.innerHTML;
    }
  }

  function renderTeachingCards(profile) {
    const english = document.documentElement?.lang === 'en';
    const list = document.getElementById('teaching-resource-links');
    if (!list) return;
    const books = Array.isArray(profile.teaching?.books) ? profile.teaching.books : [];
    list.innerHTML = books.filter(book => book && safeHref(english ? book.linkEn : book.linkZh)).map(book => {
      const url = safeHref(english ? book.linkEn : book.linkZh);
      const external = new URL(url).origin !== location.origin;
      const title = plainText(english ? (book.titleEn || book.cardTitleEn || 'Teaching resource') : (book.titleZh || book.cardTitleZh || '教学资源'));
      const shortTitle = plainText(english ? (book.cardTitleEn || book.titleEn || 'Teaching resource') : (book.cardTitleZh || book.titleZh || '教学资源'));
      const type = english ? (book.resourceTypeEn || 'Teaching resource') : (book.resourceTypeZh || '教学资源');
      const image = safeHref(book.image);
      const cover = /^https?:/i.test(image) ? '<img src="' + escapeHTML(image) + '" alt="" loading="lazy">' : '';
      return '<li><a class="teaching-resource-card" href="' + escapeHTML(url) + '" title="' + escapeHTML(title) + '" aria-label="' + escapeHTML(type + (english ? ': ' : '：') + title) + '"' + (external ? ' target="_blank" rel="noopener"' : '') + '>' +
        '<span class="teaching-resource-cover">' + cover + '</span><span class="teaching-resource-copy"><span class="teaching-resource-type">' + escapeHTML(type) + '</span><span class="teaching-resource-title">' + escapeHTML(shortTitle) + '</span></span></a></li>';
    }).join('');
    list.hidden = !list.innerHTML;
  }

  function renderVideoCards(profile) {
    const target = document.getElementById('demo-list');
    if (!target) return;
    const seen = new Set();
    const videos = (Array.isArray(profile.demos) ? profile.demos : []).filter(video => {
      if (!video || video.enabled === false || !/^BV[0-9A-Za-z]+$/.test(video.bvid) || seen.has(video.bvid)) return false;
      seen.add(video.bvid);
      return true;
    });
    target.innerHTML = videos.length ? videos.map(video => {
      const title = plainText(video.titleZh) || '报告视频';
      const player = 'https://player.bilibili.com/player.html?bvid=' + encodeURIComponent(video.bvid) + '&page=1&autoplay=0&danmaku=0';
      const related = /^research\d+$/.test(video.researchId || '')
        ? '<a href="' + escapeHTML(safeHref('research.html#' + video.researchId)) + '">相关研究 ↗</a>' : '';
      return '<article class="home-video-card"><div class="home-video-player"><iframe src="' + escapeHTML(player) + '" title="' + escapeHTML(title) + '" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>' +
        '<div class="home-video-copy"><h4>' + escapeHTML(title) + '</h4><div class="home-video-links"><a href="https://www.bilibili.com/video/' + escapeHTML(video.bvid) + '/" target="_blank" rel="noopener">在 B 站观看 ↗</a>' + related + '</div></div></article>';
    }).join('') : '<p class="home-media-status">暂无报告视频，后续将陆续更新。</p>';
  }

  function setupVideoCarousel() {
    const track = document.getElementById('demo-list');
    const controls = document.getElementById('video-carousel-controls');
    const previous = document.getElementById('video-carousel-previous');
    const next = document.getElementById('video-carousel-next');
    const range = document.getElementById('video-carousel-range');
    if (!track || !controls || !previous || !next || !range) return;
    if (track.cleanupVideoCarousel) track.cleanupVideoCarousel();
    const cards = [...track.querySelectorAll('.home-video-card')];
    controls.hidden = !cards.length;
    track.tabIndex = cards.length ? 0 : -1;
    if (!cards.length) {
      previous.disabled = true;
      next.disabled = true;
      range.textContent = '';
      return;
    }
    const maximum = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const update = () => {
      const max = maximum();
      previous.disabled = max <= 1 || track.scrollLeft <= 1;
      next.disabled = max <= 1 || track.scrollLeft >= max - 1;
      const viewport = track.getBoundingClientRect();
      const visible = cards.map((card, index) => ({index, box: card.getBoundingClientRect()}))
        .filter(card => card.box.right > viewport.left + 1 && card.box.left < viewport.right - 1);
      const label = visible.length ? (visible.length === 1 ? String(visible[0].index + 1) : (visible[0].index + 1) + '–' + (visible[visible.length - 1].index + 1)) + ' / ' + cards.length : '共 ' + cards.length + ' 个视频';
      if (range.textContent !== label) range.textContent = label;
    };
    const moveTo = left => {
      const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      track.scrollTo({left: Math.max(0, Math.min(maximum(), left)), behavior: reduceMotion ? 'auto' : 'smooth'});
    };
    const move = direction => {
      const step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : cards[0].getBoundingClientRect().width;
      moveTo(track.scrollLeft + direction * step);
    };
    const goPrevious = () => move(-1);
    const goNext = () => move(1);
    const onKey = event => {
      // Do not intercept keys used by links or embedded video controls.
      if (event.target !== track || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') moveTo(0);
      else if (event.key === 'End') moveTo(maximum());
      else move(event.key === 'ArrowRight' ? 1 : -1);
    };
    previous.addEventListener('click', goPrevious);
    next.addEventListener('click', goNext);
    track.addEventListener('scroll', update, {passive:true});
    track.addEventListener('keydown', onKey);
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(track);
    } else window.addEventListener('resize', update);
    track.cleanupVideoCarousel = () => {
      previous.removeEventListener('click', goPrevious);
      next.removeEventListener('click', goNext);
      track.removeEventListener('scroll', update);
      track.removeEventListener('keydown', onKey);
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', update);
      track.cleanupVideoCarousel = null;
    };
    update();
  }

  function selectRecentActivities(items, limit = 4) {
    return (Array.isArray(items) ? items : []).map((item, index) => {
      if (!item || typeof item.title !== 'string' || !item.title.trim()) return null;
      const match = /^(\d{4})[.\/-](\d{1,2})(?:[.\/-](\d{1,2}))?$/.exec(String(item.date || '').trim());
      if (!match) return null;
      const hasDay = match[3] !== undefined;
      const year = Number(match[1]), month = Number(match[2]), day = hasDay ? Number(match[3]) : 1;
      const timestamp = Date.UTC(year, month - 1, day);
      const date = new Date(timestamp);
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
      const iso = String(year) + '-' + String(month).padStart(2, '0') + (hasDay ? '-' + String(day).padStart(2, '0') : '');
      return { ...item, index, timestamp, iso, dateLabel: iso.replace(/-/g, '.') };
    }).filter(Boolean).sort((a, b) => b.timestamp - a.timestamp || a.index - b.index).slice(0, limit);
  }

  async function renderRecentActivities() {
    const list = document.getElementById('recent-activity-list');
    const status = document.getElementById('recent-activity-status');
    if (!list || !status) return;
    list.setAttribute('aria-busy', 'true');
    try {
      const coverage = await fetchJSON('data/coverage.json');
      if (!Array.isArray(coverage.items)) throw new Error('Invalid activity data');
      const items = selectRecentActivities(coverage.items, 4);
      list.innerHTML = items.map(item => {
        const candidate = safeHref(item.url);
        const url = /^https?:/i.test(candidate) ? candidate : safeHref('coverage.html');
        const external = new URL(url).origin !== location.origin;
        return '<li class="home-activity-item"><a class="home-activity-link" href="' + escapeHTML(url) + '"' + (external ? ' target="_blank" rel="noopener"' : '') + '>' +
          '<time datetime="' + item.iso + '">' + item.dateLabel + '</time><span class="home-activity-title">' + escapeHTML(plainText(item.title)) + '</span></a></li>';
      }).join('');
      status.hidden = items.length > 0;
      status.textContent = items.length ? '' : '暂无活动记事。';
    } catch (error) {
      console.warn('Recent activities could not be loaded.', error);
      list.innerHTML = '';
      status.hidden = false;
      status.innerHTML = '近期活动暂时无法加载，请稍后刷新，或<a href="coverage.html">查看活动记事 ↗</a>。';
    } finally {
      list.setAttribute('aria-busy', 'false');
    }
  }

  function renderChineseExtras(profile) {
    for(const [id,copy] of [['profile-details-copy',profile.about.zh],['join-details-copy',profile.join.zh]]) {
      const target=document.getElementById(id); if(target)target.innerHTML=safeRich(copy);
    }
    renderTeachingCourses(profile);
    renderTeachingCards(profile);
    renderVideoCards(profile);
    setupVideoCarousel();
  }

  async function renderProfile() {
    const profile = await fetchJSON('data/profile.json');
    if (lang === 'zh') {
      renderChineseExtras(profile);
    } else {
      renderTeachingCourses(profile);
      renderTeachingCards(profile);
    }
    const contact = profile.contact || {};
    if (contact.email) {
      link('link-email', 'mailto:' + contact.email);
      link('footer-email', 'mailto:' + contact.email);
      setText('footer-email', contact.email);
    }
    link('link-scholar', contact.googleScholar);
    if (profile.photo) document.getElementById('portrait').src = safeHref(profile.photo);
    if (profile.icp) {
      link('icp-link', profile.icp.url);
      setText('icp-link', profile.icp.number);
    }
  }

  function renderCopy(home) {
    setText('hero-name', home.displayName);
    setText('hero-position', home.position);
    const heroIntro=document.getElementById('hero-intro');
    if(lang==='en'&&heroIntro&&home.introHtml) heroIntro.innerHTML=safeRich(home.introHtml);
    else setText('hero-intro', home.intro);
    setText('hero-description', home.description);
    setText('about-copy', home.background);
    if (lang === 'en') setText('teaching-copy', home.teaching);
    setText('teaching-materials-copy', home.teachingMaterials);
    if (lang === 'zh') setText('research-intro-copy', home.researchIntro);
    // An unknown year is omitted rather than shown as a placeholder or inferred.
    if (Array.isArray(home.selectedHonors)) {
      document.getElementById('selected-honors').hidden = home.selectedHonors.length === 0;
      document.getElementById('honors-list').innerHTML = home.selectedHonors.map(honor => {
        const year = /^\d{4}$/.test(String(honor.year || '')) ? String(honor.year) : '';
        return '<li><span title="' + escapeHTML(honor.titleZh || honor.title) + '">' +
          escapeHTML(honor.title) + '</span>' +
          (year ? '<time datetime="' + year + '">' + year + '</time>' : '') + '</li>';
      }).join('');
    }
    if (Array.isArray(home.research) && home.research.length) {
      document.getElementById('research-grid').innerHTML = home.research.map(item => {
        const description = lang === 'zh' && item.descriptionHtml
          ? safeRich(item.descriptionHtml) : escapeHTML(item.description);
        const moreLink = item.link && item.label
          ? '<a href="' + escapeHTML(safeHref(item.link)) + '">' + escapeHTML(item.label) + ' <span aria-hidden="true">↗</span></a>' : '';
        return '<article class="research-item"><span class="research-number">' + escapeHTML(item.number) +
          '</span><h3>' + escapeHTML(item.title) + '</h3><p>' + description + '</p>' + moreLink + '</article>';
      }).join('');
    }
  }

  async function renderPublications(home) {
    const index = await fetchJSON('data/publications.json');
    const selected = home.selectedPublications || [];
    const years = new Set(selected.map(item => item.year));
    const files = (index.yearlyFiles || []).filter(item => years.has(item.year));
    // Fetch both journals and conferences: selected conference work must not disappear.
    const results = await Promise.allSettled(files.map(item => fetchJSON(item.file)));
    const papers = results.flatMap(result => result.status === 'fulfilled'
      ? ['journals', 'conferences'].flatMap(type => (result.value[type] || []).flatMap(group =>
        (group.items || []).map(paper => ({ ...paper, year: group.year }))))
      : []);
    let found = 0;
    document.getElementById('pub-list').innerHTML = selected.map(selection => {
      const paper = papers.find(item => item.year === selection.year && String(item.url || '').includes(selection.urlContains));
      if (!paper) return '';
      found++;
      const href = escapeHTML(safeHref(paper.url));
      const title = escapeHTML(plainText(paper.title));
      const authors = escapeHTML(plainText(paper.authors)).replace(/J\. Yang\*?/g, '<strong>$&</strong>');
      return '<li><a class="pub-image" href="' + href + '" target="_blank" rel="noopener" aria-label="' + t('View paper: ', '查看论文：') + title + '">' +
        '<img src="' + escapeHTML(safeHref(selection.image)) + '" alt="' + escapeHTML(selection.imageAlt) + '" width="176" height="132" loading="lazy"></a>' +
        '<div><p class="pub-venue">' + escapeHTML(selection.venueLabel) + '</p><h3><a class="pub-title" href="' + href + '" target="_blank" rel="noopener">' + title + '</a></h3>' +
        '<p class="pub-authors">' + authors + '</p><p class="pub-note">' + escapeHTML(selection.note) + '</p>' +
        '<div class="pub-links"><a href="' + href + '" target="_blank" rel="noopener">' + t('Paper', '论文') + ' <span aria-hidden="true">↗</span></a></div></div></li>';
    }).join('');
    const status = document.getElementById('publication-status');
    status.hidden = found === selected.length && found > 0;
    if (!status.hidden) status.innerHTML = t('Some selected publications could not be loaded. <a href="publications_en.html">View all publications</a> or reload this page.', '部分精选论文暂时无法加载，请<a href="publications.html">查看全部论文</a>或刷新重试。');
  }

  initCvPreview();
  initCoverPreview();

  renderProfile().catch(error => {
    console.warn('Using the static profile fallback.', error);
    if (lang === 'zh') {
      const videos = document.getElementById('demo-list');
      if (videos) videos.innerHTML = '<p class="home-media-status" role="status">视频列表暂时无法加载，请稍后刷新重试。</p>';
      setupVideoCarousel();
    }
  });
  // Activities are loaded independently: a video/profile failure must not hide the feed.
  if (lang === 'zh') renderRecentActivities();
  fetchJSON('data/' + lang + '-home.json').then(home => {
    renderCopy(home);
    renderPaperAwards(home);
    return renderPublications(home);
  }).catch(error => {
    console.error('English homepage content could not be loaded.', error);
    const status = document.getElementById('publication-status');
    status.hidden = false;
    status.innerHTML = t('Selected publications could not be loaded. <a href="publications_en.html">View all publications</a> or reload this page.', '精选论文加载失败，请<a href="publications.html">查看全部论文</a>或刷新重试。');
  });

  // Native details provides keyboard support; close it after navigation or Escape.
  const menu = document.querySelector('.mobile-nav');
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) menu.open = false;
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
})();
