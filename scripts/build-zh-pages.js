/* Generate Chinese pages from the approved English page shells.
 * Layout classes, header/footer structure and rendering scripts are shared.
 * Copy lives in data/zh-home.json, data/zh-pages.json and existing bilingual records. */
'use strict';
const fs=require('fs'),path=require('path');
const {faviconLinks}=require('./favicon-links');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const json=file=>JSON.parse(read(file));
const write=(file,content)=>{ if(process.argv.includes('--check')) { if(read(file)!==content) throw new Error(file+' is out of date; run npm run build:zh'); } else fs.writeFileSync(path.join(root,file),content); };
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pages=json('data/zh-pages.json'),home=json('data/zh-home.json'),profile=json('data/profile.json');
const currentVersions={homeCss:20,siteCss:7,zhCss:25,homeJs:24,siteJs:17};
const route=file=>file.replace('.html','_en.html');
function translateShell(source,file) {
  source=source.replaceAll('href="index.html" lang="zh"','href="'+route(file)+'" lang="en"');
  // Route ordinary page links to Chinese; language switching is handled separately.
  source=source.replace(/href="([a-z_-]+)_en\.html"/g,(_,base)=>`href="${base}.html"`);
  source=source.replace(/(<a\b[^>]*\blang="(?:zh|en)"[^>]*>)[\s\S]*?<\/a>/g,(all,start)=>start.includes('beian')?all:`<a${start.includes('class="lang-switch"')?' class="lang-switch"':''} href="${route(file)}" lang="en">English</a>`);
  const words={'Skip to content':'跳至正文','Jie Yang homepage':'杨杰主页','Open navigation menu':'打开导航菜单','aria-label="Primary"':'aria-label="主导航"','aria-label="Mobile"':'aria-label="移动导航"','Menu <span':'菜单 <span','>Research<':'>研究方向<','>Publications<':'>论文发表<','>Chips<':'>芯片展示<','>Book<':'>书籍<','>Activities<':'>活动记事<','>Join us<':'>加入我们<','>Jie Yang<span':'>杨杰<span','Advanced Neural Chip Center · Westlake University':'西湖大学 · 先进神经芯片中心','Hangzhou, China':'中国 · 杭州'};
  for(const [a,b] of Object.entries(words))source=source.replaceAll(a,b);
  // The punctuation-like brand dot belongs to the English wordmark only.
  source=source.replace(/<span class="brand-dot" aria-hidden="true">\.<\/span>/g,'');
  // All generated Chinese pages share the same linked organization footer.
  source=source.replace(/<p class="footer-affiliations">[\s\S]*?<\/p>/g,'<p class="footer-affiliations"><a href="https://www.westlake.edu.cn/" target="_blank" rel="noopener">西湖大学</a> · <a href="https://neuralicorn.com/" target="_blank" rel="noopener">西湖灵犀科技</a> · <a href="https://bci.westlake.edu.cn/" target="_blank" rel="noopener">脑机接口智能芯片系统浙江省工程研究中心</a></p>');
  source=source.replace('<p>西湖大学 · 先进神经芯片中心</p>','<p class="footer-affiliations"><a href="https://www.westlake.edu.cn/" target="_blank" rel="noopener">西湖大学</a> · <a href="https://neuralicorn.com/" target="_blank" rel="noopener">西湖灵犀科技</a> · <a href="https://bci.westlake.edu.cn/" target="_blank" rel="noopener">脑机接口智能芯片系统浙江省工程研究中心</a></p>');
  return source;
}
function shellParts(file,kind) {
  const source=read(route(file));
  return {header:translateShell(source.match(/<header class="site-header">[\s\S]*?<\/header>/)[0],file),footer:translateShell(source.match(/<footer class="site-footer shell">[\s\S]*?<\/footer>/)[0],file)};
}
// Search summaries are maintained separately from visible page introductions.
function head(title,description,file,pageTitle = `${title} — 杨杰 | 西湖大学`) {
  if (typeof description !== 'string' || !description.trim()) throw new Error(file+': missing metaDescription');
  const schema = file === 'index.html' ? {'@context':'https://schema.org','@type':'Person',name:profile.name.zh,alternateName:'Jie Yang',url:'https://yangjie.ac.cn',image:'https://yangjie.ac.cn/'+profile.photo,jobTitle:profile.position.zh,worksFor:{'@type':'Organization',name:'西湖大学'},sameAs:[profile.contact.googleScholar]} : {'@context':'https://schema.org','@type':'CollectionPage',name:title,url:'https://yangjie.ac.cn/'+file,description};
  return `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="author" content="杨杰, Jie Yang, 西湖大学"><title>${esc(pageTitle)}</title><meta name="description" content="${esc(description)}">${faviconLinks(file)}<link rel="preload" href="static/assets/fonts/inter/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="static/css/en-home.css?v=${currentVersions.homeCss}"><link rel="stylesheet" href="static/css/en-site.css?v=${file==='join.html'?9:file==='coverage.html'?11:currentVersions.siteCss}"><link rel="stylesheet" href="static/css/zh-locale.css?v=${file==='index.html'?42:file==='research.html'?31:file==='publications.html'?39:currentVersions.zhCss}"><link rel="alternate" hreflang="en" href="${route(file)}"><link rel="alternate" hreflang="zh-CN" href="${file}"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>\n</head>`;
}
function dialog(){return `<a class="en-top-link" href="#page-top" aria-label="返回顶部" hidden>↑</a><dialog id="content-dialog" class="en-dialog" aria-labelledby="dialog-title"><div class="dialog-heading"><h2 id="dialog-title">详情</h2><button type="button" class="dialog-close" aria-label="关闭">关闭 <span aria-hidden="true">×</span></button></div><div id="dialog-body"></div></dialog>`;}
function paperAwardItems(items) {
  return '<ul class="paper-award-list">' + items.map(item => {
    const fullTitle = item.venue + ' · ' + item.distinction + (item.paperTitle ? ' — ' + item.paperTitle : '');
    const label = (item.venueShort || item.venue) + ' · ' + item.distinction;
    let href = '', external = false;
    if(item.url) try {
      const url = new URL(item.url, 'https://yangjie.ac.cn/');
      if(['http:','https:'].includes(url.protocol)) { href = item.url; external = url.origin !== 'https://yangjie.ac.cn'; }
    } catch (_) { /* Keep malformed destinations as plain text. */ }
    const title = href
      ? '<a class="paper-award-title" href="' + esc(href) + '" title="' + esc(fullTitle) + '"' + (external ? ' target="_blank" rel="noopener"' : '') + '>' + esc(label) + '</a>'
      : '<span class="paper-award-title" title="' + esc(fullTitle) + '">' + esc(label) + '</span>';
    return '<li class="paper-award-item"><div class="paper-award-main">' + title + '<time datetime="' + item.year + '">' + item.year + '</time></div>' +
      (item.authorRole ? '<p class="paper-award-role">' + esc(item.authorRole) + '</p>' : '') + '</li>';
  }).join('') + '</ul>';
}
function paperAwardsContent() {
  const items = (Array.isArray(home.paperAwards) ? home.paperAwards : [])
    .map((item,index)=>({...item,index}))
    .filter(item=>item.venue&&item.distinction&&/^\d{4}$/.test(String(item.year)))
    .sort((a,b)=>Number(b.year)-Number(a.year)||a.index-b.index);
  if(!items.length) return '';
  const older = items.slice(4);
  return paperAwardItems(items.slice(0,4)) + (older.length
    ? '<details class="paper-awards-more"><summary><span class="paper-awards-show-more">View more</span><span class="paper-awards-show-less">View less</span></summary>' + paperAwardItems(older) + '</details>' : '');
}
function teachingCourseItems() {
  return (profile.teaching.courses || []).map(course => {
    const details = [course.years, course.institutionZh, course.levelZh, course.roleZh].filter(Boolean).map(esc).join(' · ');
    return '<li class="teaching-course-item"><span class="teaching-course-title">' + esc(course.title) + '</span><span class="teaching-course-meta">' + details + '</span></li>';
  }).join('');
}
function teachingResourceCards() {
  return (profile.teaching.books || []).map(book => {
    const type = book.resourceTypeZh || '教学资源';
    const title = book.titleZh || book.cardTitleZh || '教学资源';
    const shortTitle = book.cardTitleZh || title;
    return '<li><a class="teaching-resource-card" href="' + esc(book.linkZh) + '" title="' + esc(title) + '" aria-label="' + esc(type + '：' + title) + '"' + (/^https?:/i.test(book.linkZh) ? ' target="_blank" rel="noopener"' : '') + '>' +
      '<span class="teaching-resource-cover"><img src="' + esc(book.image) + '" alt="" loading="lazy"></span><span class="teaching-resource-copy"><span class="teaching-resource-type">' + esc(type) + '</span><span class="teaching-resource-title">' + esc(shortTitle) + '</span></span></a></li>';
  }).join('');
}
function bookContent(page){
  const chapters=['侵入式脑机接口芯片概述','神经信号读出电路','神经信号处理电路','无线能量传输与通讯电路','刺激电路'];
  return `<section class="en-book-intro en-surface"><img src="images/invasive_bci_chip_design_cover.webp" alt="侵入式脑机接口芯片设计封面" width="240" height="320"><div><h2>从神经电极到集成系统</h2><p>侵入式脑机接口在神经组织与电子系统之间建立直接通信通道。集成电路将神经信号读出、处理、无线通信与刺激等功能整合到紧凑的低功耗系统中。</p><p>本资源介绍脑机接口芯片中的主要电路模块与设计方法，供相关领域的学生与研究者学习参考。</p><details class="en-details"><summary>完整前言</summary><div><p>${page.introduction}</p><img src="images/chip_demo.jpg" alt="侵入式脑机接口芯片系统示意图" class="book-system-diagram" loading="lazy"></div></details><p class="en-language-note">以下五个技术章节为中文全文。<a href="book-references_en.html">英文参考文献</a>亦可在线浏览。</p></div></section><section class="en-section"><div class="en-section-heading"><h2>技术章节</h2><span class="en-muted">中文全文</span></div><ol class="en-chapter-list en-surface">${chapters.map((name,i)=>`<li><a href="book/chapter_${i+1}.html"><span class="en-chapter-number">0${i+1}</span><span>${name}</span><span class="en-language-tag">阅读 ↗</span></a></li>`).join('')}<li><a href="book/bib.html"><span class="en-chapter-number">06</span><span>参考文献</span><span class="en-language-tag">阅读 ↗</span></a></li></ol></section><section class="en-section en-reading"><h2>引用本网页</h2><pre class="en-citation"><code>@book{yangjie_bci_2024,
  title = {侵入式脑机接口芯片},
  author = {杨杰 and Mohamad Sawan},
  year = {2024},
  note = {https://yangjie.ac.cn/book-item-bci.html}
}</code></pre><p>如有问题或建议，欢迎联系 <a href="mailto:yangjie@westlake.edu.cn">yangjie@westlake.edu.cn</a>。内容将持续更新。</p></section>`;
}
for(const [kind,page] of Object.entries(pages)){
 const {header,footer}=shellParts(page.file,kind);
 const joinActions=kind==='join'?'<nav class="en-join-actions" aria-label="招聘与申请快捷入口"><a href="#join-academic">查看学术岗位</a><a href="#join-industry">查看产业岗位</a><a class="en-join-apply" href="#join-apply">如何申请 <span aria-hidden="true">↓</span></a></nav>':'';
 const content=kind==='book'?bookContent(page):'<p class="en-load-message" role="status">正在加载内容…</p>';
 write(page.file,head(page.title,page.metaDescription,page.file,page.pageTitle)+`\n<body id="page-top" class="en-inner zh-unified" data-page="${kind}"><a class="skip-link" href="#main">跳至正文</a>${header}<main id="main" class="shell en-main"><header class="en-page-heading">${kind==='publications'?'<div class="pub-heading-copy">':''}<p class="eyebrow">${page.eyebrow}</p><h1>${page.title}</h1>${kind==='publications'?'</div>':''}${['activities','publications'].includes(kind)?'':`<p class="en-page-intro">${page.intro}</p>`}${joinActions}</header><div id="page-content">${content}</div><noscript><p>本页通过 JavaScript 加载数据。你也可以<a href="${esc(profile.contact.googleScholar)}">前往 Google Scholar 查看论文</a>，或<a href="mailto:${esc(profile.contact.email)}">联系作者</a>。</p></noscript></main>${footer}${dialog()}${kind==='publications'?'<script src="static/js/publication-stats.js?v=5" defer></script>':''}<script src="static/js/en-site.js?v=${kind==='join'?18:kind==='research'?21:kind==='publications'?31:kind==='activities'?25:currentVersions.siteJs}" defer></script></body>\n</html>\n`);
}
const {header,footer}=shellParts('index.html','home');
const link=(url,text,cls='')=>`<a${cls?` class="${cls}"`:''} href="${esc(url)}">${text} <span aria-hidden="true">↗</span></a>`;
write('index.html',head('脑机接口与类脑计算',home.metaDescription,'index.html',home.pageTitle)+`
<body id="page-top" class="zh-unified" data-page="home"><a class="skip-link" href="#main">跳至正文</a>${header}
<main id="main" class="shell">
<section class="hero" id="home" aria-labelledby="hero-name"><figure class="portrait-frame"><img id="portrait" src="${profile.photo}" alt="杨杰" width="224" height="280"></figure><div><div class="hero-name-row"><h1 id="hero-name">${esc(home.displayName)}</h1><span class="hero-degree">${esc(profile.title.zh)}</span></div><div class="hero-biography" id="profile-details-copy">${profile.about.zh}</div><div class="hero-links"><a id="link-email" href="mailto:${profile.contact.email}">邮件联系 ↗</a><a id="link-scholar" href="${esc(profile.contact.googleScholar)}" target="_blank" rel="noopener">Google Scholar ↗</a><a href="#about">荣誉与奖励 ↗</a></div></div></section>
<span id="interests" class="anchor-alias" aria-hidden="true"></span><section class="content-section" id="research" aria-labelledby="research-heading"><div class="section-heading"><div><p class="eyebrow">RESEARCH</p><h2 id="research-heading">记录、解码大脑与模拟大脑</h2></div>${link('research.html','全部研究方向','section-link')}</div><p class="research-lead" id="research-intro-copy">${esc(home.researchIntro)}</p><div class="research-grid" id="research-grid">${home.research.map(r=>`<article class="research-item"><span class="research-number">${esc(r.number)}</span><h3>${esc(r.title)}</h3><p>${r.descriptionHtml || esc(r.description || "")}</p>${r.link && r.label ? link(r.link,r.label) : ""}</article>`).join('')}</div></section>
<span id="selected-work" class="anchor-alias" aria-hidden="true"></span><section class="content-section" id="publications" aria-labelledby="publications-heading"><div class="section-heading"><div><p class="eyebrow">SELECTED WORK</p><h2 id="publications-heading">代表性论文</h2></div>${link('publications.html','全部论文','section-link')}</div><p id="publication-status" role="status">正在加载精选论文…</p><ol class="pub-list" id="pub-list"></ol><noscript><p>${link('publications.html','查看论文列表')}</p></noscript></section>
<section class="content-section home-honors" id="about" aria-labelledby="about-heading"><div class="section-heading"><div><p class="eyebrow">HONORS & AWARDS</p><h2 id="about-heading">荣誉与奖励</h2></div></div><div class="home-honors-grid"><section class="home-honors-column" aria-labelledby="personal-honors-heading"><h3 class="home-column-heading" id="personal-honors-heading">个人荣誉</h3><div class="selected-honors" id="selected-honors"><ul class="honors-list" id="honors-list">${home.selectedHonors.map(h=>`<li><span>${h.title}</span>${h.year?`<time datetime="${h.year}">${h.year}</time>`:''}</li>`).join('')}</ul></div></section><section class="home-honors-column home-paper-awards" aria-labelledby="paper-awards-heading"><h3 class="home-column-heading" id="paper-awards-heading">论文与会议荣誉</h3><div id="paper-awards-list">${paperAwardsContent()}</div></section></div></section>
<section class="content-section home-teaching" id="awards" aria-labelledby="teaching-heading"><div class="section-heading"><div><p class="eyebrow">TEACHING & TEXTBOOKS</p><h2 id="teaching-heading">教学与教材</h2></div></div><div class="home-teaching-grid"><div class="teaching-intro home-teaching-courses"><ul class="teaching-course-list" id="teaching-course-list" aria-label="授课经历">${teachingCourseItems()}</ul><p class="teaching-collaborators" id="teaching-collaborators">${profile.teaching.collaborationZh}</p></div><div class="teaching-intro home-teaching-materials"><p id="teaching-materials-copy">${esc(home.teachingMaterials)}</p><ul class="teaching-resource-grid" id="teaching-resource-links" aria-label="教材与教学项目">${teachingResourceCards()}</ul></div></div></section>
<section class="content-section" id="demos" aria-labelledby="demos-heading"><div class="section-heading"><div><p class="eyebrow">TALKS & DEMOS</p><h2 id="demos-heading">报告与演示</h2></div></div>
<section class="home-talks" aria-labelledby="talks-heading"><div class="home-subsection-heading"><h3 id="talks-heading">报告视频</h3><div class="home-carousel-controls" id="video-carousel-controls" hidden><button class="home-carousel-button" id="video-carousel-previous" type="button" aria-label="向左浏览视频" aria-controls="demo-list" disabled><span aria-hidden="true">←</span></button><span class="home-carousel-range" id="video-carousel-range" aria-live="polite" aria-atomic="true"></span><button class="home-carousel-button" id="video-carousel-next" type="button" aria-label="向右浏览视频" aria-controls="demo-list" disabled><span aria-hidden="true">→</span></button></div></div><div class="home-talk-grid" id="demo-list" role="region" aria-label="报告视频，可左右浏览" tabindex="0"><p class="home-media-status" role="status">正在加载报告视频…</p></div><noscript><p>启用 JavaScript 可在本页观看视频，也可直接前往 B 站：</p><ul>${(profile.demos||[]).filter(video=>video.enabled!==false&&/^BV[0-9A-Za-z]+$/.test(video.bvid)).map(video=>`<li><a href="https://www.bilibili.com/video/${esc(video.bvid)}/" target="_blank" rel="noopener">${esc(video.titleZh)}</a></li>`).join('')}</ul></noscript></section>
<section class="home-recent-activities" id="recent-activities" aria-labelledby="recent-activities-heading"><div class="home-subsection-heading"><h3 id="recent-activities-heading">近期活动</h3>${link('coverage.html','全部活动','section-link')}</div><p class="home-media-status" id="recent-activity-status" role="status">正在加载近期活动…</p><ul class="home-activity-list" id="recent-activity-list" aria-busy="true"></ul><noscript><p>请<a href="coverage.html">前往活动记事</a>查看活动。</p></noscript></section>
</section>
<section class="join-section" id="join" aria-labelledby="join-heading"><div><p class="eyebrow">JOIN THE TEAM</p><h2 id="join-heading">一起探索下一代脑机接口</h2><p>欢迎对脑机接口、神经解码和类脑计算充满热情的学生、博士后与科研人员加入。</p><details class="en-details"><summary>团队招募介绍</summary><div id="join-details-copy"></div></details></div>${link('join.html','了解在招方向','join-link')}</section>
</main>${footer}<script src="static/js/en-home.js?v=${currentVersions.homeJs}" defer></script></body></html>\n`);
console.log('Generated 7 Chinese pages from the shared English shell and localized records.');
