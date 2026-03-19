/**
 * site-renderer.js
 * 统一的 JSON → HTML 渲染引擎
 * 使用方式：在页面中设置 data-page 属性，并引入此脚本
 * 
 * 以后更新网站内容只需修改 data/ 目录下的 JSON 文件
 */

(function () {
  'use strict';

  // 判断当前语言
  const lang = document.documentElement.lang === 'en' ? 'en' : 'zh';

  // 数据文件路径（自动适配 book/ 子目录）
  const isSubDir = window.location.pathname.includes('/book/');
  const dataBase = isSubDir ? '../data/' : 'data/';

  // ─────────────────────────────────────────────
  // 工具函数
  // ─────────────────────────────────────────────

  function fetchJSON(file) {
    return fetch(dataBase + file)
      .then(r => { if (!r.ok) throw new Error('Failed: ' + file); return r.json(); });
  }

  function setText(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function setAttr(id, attr, val) {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, val);
  }

  // ─────────────────────────────────────────────
  // 导航栏渲染
  // ─────────────────────────────────────────────

  function renderNav(profile) {
    const navContainer = document.getElementById('nav-links');
    if (!navContainer) return;

    const items = profile.nav[lang];
    const currentHref = window.location.pathname.split('/').pop() || 'index.html';

    // 图标映射（已更新到 Font Awesome 6 的图标名称）
    const iconMap = {
      'index.html': 'fa-house',
      'index_en.html': 'fa-house',
      'research.html': 'fa-microscope',
      'research_en.html': 'fa-microscope',
      'chip_gallery.html': 'fa-microchip',
      'chip_gallery_en.html': 'fa-microchip',
      'publications.html': 'fa-file-lines',
      'publications_en.html': 'fa-file-lines',
      'coverage.html': 'fa-calendar-days',
      'coverage_en.html': 'fa-calendar-days',
      'book-item-bci.html': 'fa-book',
      'book-item-bci_en.html': 'fa-book'
    };

    let html = '';
    items.forEach(item => {
      if (item.dropdown) {
        html += `<div class="nav-item dropdown me-lg-3">
          <a href="#" class="nav-link dropdown-toggle fw-normal text-dark" data-bs-toggle="dropdown">
            <i class="fa-solid ${iconMap[item.href] || 'fa-book'} me-1"></i>${item.label}
          </a>
          <div class="dropdown-menu rounded">
            ${item.dropdown.map(d => `<a href="${d.href}" class="dropdown-item"><i class="fa-solid ${iconMap[d.href] || 'fa-file'} me-1"></i>${d.label}</a>`).join('')}
          </div>
        </div>`;
      } else {
        const isActive = currentHref === item.href ? ' active fw-semibold' : '';
        html += `<a href="${item.href}" class="nav-item nav-link me-lg-3 text-dark${isActive}">
          <i class="fa-solid ${iconMap[item.href] || 'fa-file'} me-1"></i>${item.label}
        </a>`;
      }
    });

    navContainer.innerHTML = html;
    
    // 单独渲染语言切换按钮
    renderLangSwitch(profile, currentHref);
  }

  function renderLangSwitch(profile, currentHref) {
    const langSwitchContainer = document.getElementById('lang-switch');
    if (!langSwitchContainer) return;

    // 页面映射表：定义所有中英文页面对
    const pageMap = {
      'index.html': 'index_en.html',
      'research.html': 'research_en.html',
      'chip_gallery.html': 'chip_gallery_en.html',
      'publications.html': 'publications_en.html',
      'coverage.html': 'coverage_en.html',
      'book-item-bci.html': 'book-item-bci_en.html'
    };

    // 反向映射：英文到中文
    const reversePageMap = {};
    Object.entries(pageMap).forEach(([zh, en]) => {
      reversePageMap[en] = zh;
    });

    // 确定目标页面链接
    let zhLink, enLink;
    
    if (lang === 'zh') {
      // 当前在中文页面
      zhLink = currentHref;
      enLink = pageMap[currentHref] || 'index_en.html';
    } else {
      // 当前在英文页面
      enLink = currentHref;
      zhLink = reversePageMap[currentHref] || 'index.html';
    }
    
    const zhActive = lang === 'zh' ? ' active' : '';
    const enActive = lang === 'en' ? ' active' : '';

    langSwitchContainer.innerHTML = `
      <a href="${zhLink}" class="nav-lang-link${zhActive}" title="切换到中文">
        <span class="lang-icon">CN</span>
      </a>
      <a href="${enLink}" class="nav-lang-link${enActive}" title="Switch to English">
        <span class="lang-icon">EN</span>
      </a>
    `;
  }

  // ─────────────────────────────────────────────
  // Banner 区域渲染
  // ─────────────────────────────────────────────

  function renderBanner(profile) {
    const bannerSection = document.getElementById('site-banner');
    if (bannerSection) {
      bannerSection.style.backgroundImage = `url('${profile.banner}')`;
    }
    const nameEl = document.getElementById('banner-name');
    if (nameEl) {
      nameEl.textContent = lang === 'zh'
        ? `${profile.name.zh} ${profile.title.zh} ${profile.name.en}, ${profile.title.en}`
        : `${profile.name.en}, ${profile.title.en}`;
    }
    const subEl = document.getElementById('banner-subtitle');
    if (subEl) subEl.textContent = profile.subtitle[lang];
  }

  // ─────────────────────────────────────────────
  // 头像 / 联系方式区域渲染
  // ─────────────────────────────────────────────

  function renderAvatar(profile) {
    const avatarImg = document.getElementById('avatar-img');
    if (avatarImg) {
      avatarImg.src = profile.photo;
      avatarImg.alt = profile.name[lang];
    }
    const contact = profile.contact;
    const contactEl = document.getElementById('avatar-contact');
    if (contactEl) {
      contactEl.innerHTML = `
        <p class="mt-0 mb-0 text-end contact-line">
          <i class="fa-solid fa-phone-alt me-1"></i>
          <i class="fa-brands fa-weixin me-1"></i>
          ${contact.phone}
        </p>
        <p class="mt-0 mb-0 text-end contact-line">
          <i class="fa-solid fa-envelope me-1"></i>
          <a href="mailto:${contact.email}" style="text-decoration:none;color:inherit;">${contact.email}</a>
        </p>
        <p class="mt-0 mb-1 text-end contact-line">
          <i class="fa-solid fa-graduation-cap me-1"></i>
          <a href="${contact.googleScholar}" target="_blank" style="text-decoration:none;color:inherit;">Google Scholar</a>
        </p>
      `;
    }
  }

  // ─────────────────────────────────────────────
  // 主页内容渲染
  // ─────────────────────────────────────────────

  function renderHomePage(profile) {
    // 填充移动端快速信息卡片
    const mobilePosition = document.getElementById('mobile-position');
    if (mobilePosition) mobilePosition.textContent = lang === 'zh' ? '研究员' : 'Researcher';
    
    const mobileExpertise = document.getElementById('mobile-expertise');
    if (mobileExpertise) mobileExpertise.textContent = lang === 'zh' ? '脑机接口\n类脑芯片' : 'BCI & AI\nChips';
    
    // 个人简介
    const intro = document.getElementById('about-content');
    if (intro) intro.innerHTML = profile.about[lang];

    // 研究兴趣
    const ri = profile.researchInterests[lang];
    const interestSummary = document.getElementById('interest-summary');
    if (interestSummary) interestSummary.innerHTML = ri.summary;

    // 三栏卡片图标（按顺序对应三个研究方向）
    const cardIcons = ['fa-brain', 'fa-microchip', 'fa-heart-pulse'];

    const interestItems = document.getElementById('interest-items');
    if (interestItems && ri.items) {
      // 渲染为三栏信息卡片
      interestItems.innerHTML = `
        <div class="research-cards">
          ${ri.items.map((item, idx) => `
            <div class="research-card">
              <div class="research-card-icon">
                <i class="fa-solid ${cardIcons[idx] || 'fa-circle-dot'}"></i>
              </div>
              <p class="research-card-title">${item.title}</p>
              <p class="research-card-body">${item.content}</p>
            </div>
          `).join('')}
        </div>
      `;
    }

    // 隐藏旧的静态图片占位（如页面中仍存在）
    const overviewImg = document.getElementById('research-overview-img');
    if (overviewImg) overviewImg.style.display = 'none';

    // 教学与书籍
    const teachingContent = document.getElementById('teaching-content');
    if (teachingContent) teachingContent.innerHTML = profile.teaching[lang];

    const booksGrid = document.getElementById('books-grid');
    if (booksGrid && profile.teaching.books) {
      booksGrid.innerHTML = profile.teaching.books.map(book => `
        <div class="col-12 col-md-4 mb-4">
          <a href="${book[lang === 'zh' ? 'linkZh' : 'linkEn']}">
            <img src="${book.image}" alt="${book[lang === 'zh' ? 'titleZh' : 'titleEn']}"
              class="img-fluid rounded shadow" loading="lazy">
            <div class="mt-2 fw-semibold book-title">${book[lang === 'zh' ? 'titleZh' : 'titleEn']}</div>
          </a>
        </div>
      `).join('');
    }

    // Footer ICP
    const icp = document.getElementById('icp-link');
    if (icp) {
      icp.href = profile.icp.url;
      icp.textContent = profile.icp.number;
    }
  }

  // ─────────────────────────────────────────────
  // 论文页面渲染
  // ─────────────────────────────────────────────

  function renderPublicationsPage(pubData) {
    // 渲染筛选按钮
    const filterContainer = document.getElementById('topic-filters');
    if (filterContainer) {
      filterContainer.innerHTML = pubData.filterTopics.map((t, i) => `
        <button class="btn btn-outline-success btn-sm topic-btn${i === 0 ? ' active' : ''}"
          data-topic="${t.id}">${t[lang === 'zh' ? 'labelZh' : 'labelEn']}</button>
      `).join('');
    }

    // 渲染年份快速导航
    const journalYears = pubData.journals.map(g => g.year);
    const confYears = pubData.conferences.map(g => g.year);

    const journalNav = document.getElementById('journal-year-nav');
    if (journalNav) {
      journalNav.innerHTML = journalYears.map(y => {
        const label = pubData.journals.find(g => g.year === y)?.label || y;
        return `<a class="year-link" href="#journal-${y}">${label}</a>`;
      }).join('');
    }

    const confNav = document.getElementById('conf-year-nav');
    if (confNav) {
      confNav.innerHTML = confYears.map(y => {
        const label = pubData.conferences.find(g => g.year === y)?.label || y;
        return `<a class="year-link" href="#conference-${y}">${label}</a>`;
      }).join('');
    }

    // 渲染移动端统计卡片
    const mobilePubStats = document.getElementById('mobile-pub-stats');
    if (mobilePubStats) {
      const journalCount = pubData.journals.reduce((sum, g) => sum + (g.items ? g.items.length : 0), 0);
      const conferenceCount = pubData.conferences.reduce((sum, g) => sum + (g.items ? g.items.length : 0), 0);
      const totalCount = journalCount + conferenceCount;
      
      mobilePubStats.innerHTML = `
        <a href="#journal" class="pub-stat-item" style="text-decoration: none; color: inherit;">
          <span class="pub-stat-label">期刊论文</span>
          <span class="pub-stat-value">${journalCount}</span>
          <span class="pub-stat-sublabel">篇</span>
        </a>
        <a href="#conference" class="pub-stat-item" style="text-decoration: none; color: inherit;">
          <span class="pub-stat-label">会议论文</span>
          <span class="pub-stat-value">${conferenceCount}</span>
          <span class="pub-stat-sublabel">篇</span>
        </a>
      `;
    }

    // 渲染期刊论文
    const journalContent = document.getElementById('journal-list');
    if (journalContent) {
      let allItems = [];
      pubData.journals.forEach(group => {
        allItems.push({ type: 'heading', year: group.year, label: group.label || group.year, id: `journal-${group.year}` });
        group.items.forEach(item => allItems.push({ type: 'item', ...item }));
      });

      journalContent.innerHTML = renderPublicationList(allItems);
    }

    // 渲染会议论文
    const confContent = document.getElementById('conference-list');
    if (confContent) {
      let allItems = [];
      pubData.conferences.forEach(group => {
        allItems.push({ type: 'heading', year: group.year, label: group.label || group.year, id: `conference-${group.year}` });
        group.items.forEach(item => allItems.push({ type: 'item', ...item }));
      });

      confContent.innerHTML = renderPublicationList(allItems);
    }

    // 绑定筛选按钮事件
    bindTopicFilter();

    // 渲染论文统计徽章
    renderPublicationStats();
  }

  function renderPublicationList(items) {
    let html = '<ol class="publications-list" reversed>';
    // 计算 li 数量用于 reversed
    const liCount = items.filter(i => i.type === 'item').length;
    items.forEach(item => {
      if (item.type === 'heading') {
        html += `<h3 id="${item.id}">${item.label}</h3>`;
      } else {
        const topicsStr = Array.isArray(item.topics) ? item.topics.join(' ') : (item.topics || '');
        const venueHtml = item.venueHighlight
          ? `<strong style="color:blue;">${item.venue}</strong>`
          : `<strong>${item.venue}</strong>`;
        const awardHtml = item.award
          ? ` <strong style="color:blue;">(${item.award})</strong>`
          : '';
        const linkStart = item.url ? `<a href="${item.url}" style="color:inherit;text-decoration:none;">` : '<span>';
        const linkEnd = item.url ? '</a>' : '</span>';
        const pdfBadge = item.pdf
          ? ` <a href="${item.pdf}" class="pdf-badge" target="_blank" rel="noopener noreferrer">[PDF]</a>`
          : '';

        html += `<li class="publication-item" data-topic="${topicsStr}">
          ${linkStart}${item.authors}, "${item.title}", ${venueHtml}.${awardHtml}${linkEnd}${pdfBadge}
        </li>`;
      }
    });
    html += '</ol>';
    return html;
  }

  function bindTopicFilter() {
    document.querySelectorAll('.topic-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.topic-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const topic = this.dataset.topic;

        document.querySelectorAll('.publication-item').forEach(item => {
          if (topic === 'all') {
            item.style.display = '';
          } else {
            const itemTopics = (item.dataset.topic || '').split(' ');
            item.style.display = itemTopics.includes(topic) ? '' : 'none';
          }
        });

        // 隐藏空的年份标题
        document.querySelectorAll('.publications-list h3').forEach(h3 => {
          let sibling = h3.nextElementSibling;
          let hasVisible = false;
          while (sibling && sibling.tagName !== 'H3') {
            if (sibling.style.display !== 'none') { hasVisible = true; break; }
            sibling = sibling.nextElementSibling;
          }
          h3.style.display = hasVisible ? '' : 'none';
        });
      });
    });
  }

  // ─────────────────────────────────────────────
  // 论文统计徽章渲染
  // ─────────────────────────────────────────────

  function renderPublicationStats() {
    // ── 期刊统计 ──
    const exactJournalMapping = {
      'IEEE Journal of Solid-State Circuits': 'JSSC',
      'IEEE Journal of Biomedical and Health Informatics': 'JBHI',
      'IEEE Transactions on Biomedical Circuits and Systems': 'TBioCAS',
      'Journal of Neural Engineering': 'JNE',
      'IEEE Transactions on Biomedical Engineering': 'TBME',
      'IEEE Transactions on Neural Systems and Rehabilitation Engineering': 'TNSRE',
      'IEEE Transactions on Circuits and Systems II': 'TCAS-II',
      'IEEE Transactions on Circuits and Systems for Video Technology': 'TCSVT',
      'IEEE Transactions on Circuits and Systems for Artificial Intelligence': 'TCASAI',
      'IEEE Transactions on Circuits and Systems I: Regular Papers': 'TCAS-I',
    };

    const journalCount = {};
    document.querySelectorAll('#journal-list li.publication-item').forEach(item => {
      const text = item.textContent;
      for (const fullName in exactJournalMapping) {
        if (text.includes(fullName)) {
          const short = exactJournalMapping[fullName];
          journalCount[short] = (journalCount[short] || 0) + 1;
          break;
        }
      }
    });

    let journalBadges = '';
    for (const fullName in exactJournalMapping) {
      const short = exactJournalMapping[fullName];
      if (journalCount[short]) {
        journalBadges += `<span class="badge bg-primary m-1 p-2" style="font-size:1rem;">${short} × ${journalCount[short]}</span>`;
      }
    }

    // ── 会议统计 ──
    const conferenceMapping = {
      'ISSCC':  ['IEEE International Solid-State Circuits Conference'],
      'CICC':   ['Custom Integrated Circuits Conference', 'CICC'],
      'ICLR':   ['International Conference on Learning Representations', 'ICLR'],
      'ECCV':   ['European Conference on Computer Vision', 'ECCV'],
      'DATE':   ['Design, Automation & Test in Europe', 'DATE'],
      'ESSERC': ['European Solid State Circuits Conference', 'ESSCIRC', 'European Solid-State Electronics Research Conference', 'ESSERC'],
      'A-SSCC': ['Asian Solid-State Circuits Conference', 'A-SSCC'],
      'BioCAS': ['Biomedical Circuits and Systems Conference', 'BioCAS'],
      'ISCAS':  ['International Symposium on Circuits and Systems', 'ISCAS'],
      'AICAS':  ['Artificial Intelligence Circuits and Systems', 'AICAS']
    };

    const confCount = {};
    document.querySelectorAll('#conference-list li.publication-item').forEach(li => {
      const text = li.textContent;
      for (const short in conferenceMapping) {
        for (const keyword of conferenceMapping[short]) {
          if (text.includes(keyword)) {
            confCount[short] = (confCount[short] || 0) + 1;
            return;
          }
        }
      }
    });

    let confBadges = '';
    for (const short in conferenceMapping) {
      if (confCount[short]) {
        confBadges += `<span class="badge bg-success m-1 p-2" style="font-size:1rem;">${short} × ${confCount[short]}</span>`;
      }
    }

    // ── 注入到 topic-filters 之后 ──
    const anchor = document.getElementById('topic-filters');
    if (!anchor) return;

    // 防止重复注入
    const existingStats = document.getElementById('pub-stats-block');
    if (existingStats) existingStats.remove();

    const statsBlock = document.createElement('div');
    statsBlock.id = 'pub-stats-block';

    if (journalBadges) {
      const jRow = document.createElement('div');
      jRow.className = 'd-flex align-items-center flex-wrap gap-1 my-2';
      jRow.innerHTML = `<span class="fw-bold" style="font-size:1.2rem;">期刊发表统计：</span><div class="journal-summary">${journalBadges}</div>`;
      statsBlock.appendChild(jRow);
    }

    if (confBadges) {
      const cRow = document.createElement('div');
      cRow.className = 'd-flex align-items-center flex-wrap gap-1 my-2';
      cRow.innerHTML = `<span class="fw-bold" style="font-size:1.2rem;">会议发表统计：</span><div class="journal-summary">${confBadges}</div>`;
      statsBlock.appendChild(cRow);
    }

    anchor.after(statsBlock);
  }

  // ─────────────────────────────────────────────
  // 研究页面渲染
  // ─────────────────────────────────────────────

  function renderResearchPage(resData) {
    // 索引标题
    const indexTitle = document.getElementById('research-index-title');
    if (indexTitle) indexTitle.textContent = resData.indexTitle[lang];

    // 研究方向索引列表
    const indexList = document.getElementById('research-index-list');
    if (indexList) {
      indexList.innerHTML = resData.directions.map(d => `
        <li><a href="#${d.id}">${d.title[lang]}</a></li>
      `).join('');
    }

    // 研究详情 - 改进的卡片设计
    const details = document.getElementById('research-details');
    if (details) {
      // 生成移动端快速导航卡片
      const mobileHighlight = `
        <div class="mobile-research-highlight">
          ${resData.directions.slice(0, 4).map(d => `
            <a href="#${d.id}" class="highlight-card">
              <div class="highlight-title">${d.title[lang]}</div>
              <div class="highlight-desc">${d.summary ? d.summary[lang].substring(0, 40) + '...' : ''}</div>
            </a>
          `).join('')}
        </div>
      `;
      
      details.innerHTML = mobileHighlight + resData.directions.map(d => `
        <div class="research-direction research-card" id="${d.id}">
          <div class="research-card-container">
            <!-- 主图区域 -->
            <div class="research-card-image">
              ${d.images && d.images.length > 0 ? `
                <a href="${d.images[0].src}" data-lightbox="${d.group || d.id}" data-title="${d.images[0].caption[lang]}">
                  <img src="${d.images[0].src}" alt="${d.title[lang]}"
                    class="research-main-image" style="cursor: zoom-in;">
                </a>
              ` : ''}
            </div>
            
            <!-- 内容区域 -->
            <div class="research-card-content">
              <!-- 标题 -->
              <h3 class="research-card-title">${d.title[lang]}</h3>
              
              <!-- 摘要 -->
              ${d.summary ? `
                <div class="research-card-summary">
                  ${d.summary[lang]}
                </div>
              ` : ''}
              
              <!-- 正文 -->
              <div class="research-card-text">
                ${d.content[lang]}
              </div>
            </div>
            
            <!-- 附加图片展览 -->
            ${d.images && d.images.length > 1 ? `
              <div class="research-gallery">
                ${d.images.slice(1).map((img, idx) => `
                  <div class="gallery-item">
                    <a href="${img.src}" data-lightbox="${d.group || d.id}" data-title="${img.caption[lang]}">
                      <img src="${img.src}" alt="${img.caption[lang]}" class="gallery-thumbnail">
                    </a>
                    <p class="gallery-caption">${img.caption[lang]}</p>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `).join('') + `<div class="research-footer"><a href="#home" class="back-link">${lang === 'zh' ? '↑ 回到顶部' : '↑ Back to top'}</a></div>`;
    }
  }

  // ─────────────────────────────────────────────
  // 活动记事页面渲染
  // ─────────────────────────────────────────────

  function renderCoveragePage(coverageData) {
    // 页面标题
    const pageTitle = document.getElementById('coverage-page-title');
    if (pageTitle && coverageData.pageTitle) {
      pageTitle.textContent = coverageData.pageTitle[lang] || coverageData.pageTitle.zh;
    }

    // 渲染列表
    const list = document.getElementById('coverage-list');
    if (!list || !coverageData.items) return;

    list.innerHTML = coverageData.items.map(item => {
      const inner = item.url
        ? `<a href="${item.url}" target="_blank" rel="noopener">${item.title}</a>`
        : item.title;
      return `<li class="news-item">
        <span class="news-time">${item.date}</span>
        <p class="news-title">${inner}</p>
      </li>`;
    }).join('');
  }

  // ─────────────────────────────────────────────
  // 页脚渲染
  // ─────────────────────────────────────────────

  function renderFooter(profile) {
    const icp = document.getElementById('icp-link');
    if (icp) {
      icp.href = profile.icp.url;
      icp.textContent = profile.icp.number;
    }
  }

  // ─────────────────────────────────────────────
  // 主入口
  // ─────────────────────────────────────────────

  const pageName = document.body.dataset.page || '';

  fetchJSON('profile.json').then(profile => {
    renderNav(profile);
    renderBanner(profile);
    renderAvatar(profile);
    renderFooter(profile);

    if (pageName === 'home') {
      renderHomePage(profile);
    }
  }).catch(err => console.error('profile.json load error:', err));

  if (pageName === 'publications') {
    fetchJSON('publications.json').then(pubData => {
      renderPublicationsPage(pubData);
    }).catch(err => console.error('publications.json load error:', err));
  }

  if (pageName === 'research') {
    fetchJSON('research.json').then(resData => {
      renderResearchPage(resData);
    }).catch(err => console.error('research.json load error:', err));
  }

  if (pageName === 'coverage') {
    fetchJSON('coverage.json').then(coverageData => {
      renderCoveragePage(coverageData);
    }).catch(err => console.error('coverage.json load error:', err));
  }

  // 返回顶部按钮
  window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('backToTop');
    if (btn) {
      window.addEventListener('scroll', () => {
        btn.classList.toggle('show', window.scrollY > 200);
      });
      btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    // ─────────────────────────────────────────────
    // 菜单栏事件处理 - 简化版本
    // ─────────────────────────────────────────────
    
    const navbarCollapse = document.getElementById('navbarCollapse');
    if (!navbarCollapse) return;

    // 菜单项点击后自动关闭菜单
    navbarCollapse.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        // 只在菜单真的打开时才关闭
        if (navbarCollapse.classList.contains('show')) {
          const bsCollapse = new bootstrap.Collapse(navbarCollapse, { toggle: false });
          bsCollapse.hide();
        }
      });
    });
  });

})();
