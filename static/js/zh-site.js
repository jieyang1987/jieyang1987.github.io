/* Chinese layout behavior only. All page content remains in the shared renderer. */
(function () {
  'use strict';
  if (!document.body.classList.contains('zh-refined')) return;
  const nav = document.getElementById('mainNav');
  const collapse = document.getElementById('navbarCollapse');
  const toggler = document.querySelector('.navbar-toggler');
  if (nav) {
    const measure = () => document.documentElement.style.setProperty('--zh-nav-height', Math.ceil(nav.getBoundingClientRect().height) + 'px');
    measure();
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(nav);
    else window.addEventListener('resize', measure);
  }
  if (collapse) {
    const markCurrent = () => {
      const filename = location.pathname.split('/').pop() || 'index.html';
      collapse.querySelectorAll('a[href]').forEach(link => {
        const path = new URL(link.href).pathname.split('/').pop();
        if (path === filename && link.getAttribute('href') !== '#' && !link.hasAttribute('data-bs-toggle')) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
      const currentDropdown = collapse.querySelector('.dropdown-menu [aria-current="page"]');
      if (currentDropdown) currentDropdown.closest('.dropdown').querySelector('.dropdown-toggle').classList.add('active');
    };
    markCurrent();
    new MutationObserver(markCurrent).observe(collapse, { childList: true, subtree: true });
    const closeMenu = () => {
      if (collapse.classList.contains('show') && window.bootstrap) bootstrap.Collapse.getOrCreateInstance(collapse, { toggle: false }).hide();
    };
    collapse.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (link && !link.hasAttribute('data-bs-toggle')) closeMenu();
    });
    nav.addEventListener('keydown', event => {
      if (event.key === 'Escape' && collapse.classList.contains('show')) {
        closeMenu();
        toggler?.focus();
      }
    });
    matchMedia('(min-width: 1200px)').addEventListener('change', event => { if (event.matches) closeMenu(); });
  }
  // Native modal matches the English viewer; original image links remain a fallback.
  if (['research', 'coverage'].includes(document.body.dataset.page) && 'HTMLDialogElement' in window) {
    const dialog = document.createElement('dialog');
    dialog.className = 'zh-image-dialog';
    dialog.setAttribute('aria-labelledby', 'zh-image-title');
    dialog.innerHTML = '<div class="zh-image-heading"><h2 id="zh-image-title"></h2><button type="button" class="zh-image-close" aria-label="关闭图片">×</button></div><img class="zh-image-full" alt=""><p class="zh-image-error" role="status" hidden>图片加载失败，请尝试查看原图。</p><div class="zh-image-controls"><button type="button" class="zh-image-prev" aria-label="上一张图片">← 上一张</button><span class="zh-image-count" aria-live="polite"></span><button type="button" class="zh-image-next" aria-label="下一张图片">下一张 →</button><a class="zh-image-original" target="_blank" rel="noopener">查看原图 ↗</a></div>';
    document.body.appendChild(dialog);
    const image = dialog.querySelector('img');
    const previous = dialog.querySelector('.zh-image-prev');
    const next = dialog.querySelector('.zh-image-next');
    const error = dialog.querySelector('.zh-image-error');
    let links = [], index = 0, opener = null;
    const renderImage = () => {
      const link = links[index];
      const caption = link.dataset.title || link.querySelector('img')?.alt || '研究图片';
      dialog.querySelector('#zh-image-title').textContent = caption;
      image.alt = caption;
      image.hidden = false;
      error.hidden = true;
      image.src = link.href;
      dialog.querySelector('.zh-image-original').href = link.href;
      dialog.querySelector('.zh-image-count').textContent = (index + 1) + ' / ' + links.length;
      previous.hidden = next.hidden = links.length < 2;
    };
    image.addEventListener('error', () => { image.hidden = true; error.hidden = false; });
    const step = offset => { index = (index + offset + links.length) % links.length; renderImage(); };
    previous.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    dialog.querySelector('.zh-image-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    });
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('zh-viewing-image');
      image.removeAttribute('src');
      opener?.focus();
    });
    document.addEventListener('click', event => {
      const link = event.target.closest('a[data-lightbox]');
      if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      if (!['http:', 'https:'].includes(new URL(link.href).protocol)) return;
      event.preventDefault();
      links = [...document.querySelectorAll('a[data-lightbox]')].filter(item => item.dataset.lightbox === link.dataset.lightbox);
      index = links.indexOf(link);
      opener = link;
      renderImage();
      document.body.classList.add('zh-viewing-image');
      dialog.showModal();
      dialog.querySelector('.zh-image-close').focus();
    });
  }
  const about = document.getElementById('about-content');
  if (!about) return;
  const mobile = matchMedia('(max-width: 768px)');
  const connectDetails = () => {
    const details = about.querySelector('.zh-profile-details');
    if (!details) return false;
    details.open = !mobile.matches;
    mobile.addEventListener('change', () => { details.open = !mobile.matches; });
    return true;
  };
  if (!connectDetails()) {
    const observer = new MutationObserver(() => { if (connectDetails()) observer.disconnect(); });
    observer.observe(about, { childList: true, subtree: true });
  }
})();
