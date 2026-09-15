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
      return '<li class="paper-award-item"><div class="paper-award-main">' + title + '<time datetime="' + item.year + '">' + item.year + '</time></div>' +
        (item.authorRole ? '<p class="paper-award-role">' + escapeHTML(item.authorRole) + '</p>' : '') + '</li>';
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
      const match = /^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/.exec(String(item.date || '').trim());
      if (!match) return null;
      const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
      const timestamp = Date.UTC(year, month - 1, day);
      const date = new Date(timestamp);
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
      const iso = String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
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
