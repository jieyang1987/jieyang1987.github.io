/* Run with: node scripts/check-en-pages.js. No network or third-party packages. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const hasFile = file => fs.existsSync(path.join(root, file));
const pages = fs.readdirSync(root).filter(f => f.endsWith('_en.html'));
let checks = 0;
function check(condition, message) { assert(condition, message); checks++; }
function localLink(link, context) {
  if (!link || /^(https?:|mailto:|data:|#)/.test(link)) return;
  const url = new URL(link, 'https://local.test/' + context);
  if (url.origin !== 'https://local.test') return;
  const file = decodeURIComponent(url.pathname.slice(1));
  check(hasFile(file), `Missing asset ${file} in ${context}`);
}
for (const page of pages) {
  const html = read(page);
  const footer=html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0]||'';
  check(footer.includes('class="footer-affiliations"'),'English footer uses the shared linked-organization structure: '+page);
  for(const [label,url] of [['Westlake University','https://www.westlake.edu.cn/'],['Neuralicorn','https://neuralicorn.com/'],['ICBCI','https://bci.westlake.edu.cn/']])check(footer.includes('<a href="'+url+'" target="_blank" rel="noopener">'+label+'</a>'),'English footer organization '+label+': '+page);
  check(!footer.includes('Advanced Neural Chip Center · Westlake University'),'Obsolete footer affiliation removed: '+page);

  check(/<html lang="en"/.test(html), `${page}: English language declaration`);
  check(html.includes('static/css/en-home.css'), `${page}: shared base theme`);
  check(html.includes('static/css/en-site.css'), `${page}: shared English site theme`);
  check(!html.includes('static/css/main.css'), `${page}: legacy theme removed`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  check(new Set(ids).size === ids.length, `${page}: unique IDs`);
  for (const match of html.matchAll(/<(?:a|link|script|img)\b[^>]*\b(?:href|src)="([^"]+)"/g)) localLink(match[1], page);
}
const homeHtml = read('index_en.html');
const homeHero = homeHtml.match(/<section class="hero"[\s\S]*?<\/section>/)?.[0] || '';
check(homeHero.includes('<div class="hero-name-row"><h1 id="hero-name">Jie Yang</h1><span class="hero-degree">Ph.D.</span></div>'), 'English hero: name and smaller degree share a row');
check(!homeHero.includes('Westlake University · Hangzhou, China') && !homeHero.includes('hero-position'), 'English hero: location eyebrow and position line removed');
check(json('data/en-home.json').displayName === 'Jie Yang', 'English runtime name preserves separate degree label');
check(homeHero.includes('id="hero-intro"')&&!homeHero.includes('id="hero-description"'),'English opening uses one approved introduction without redundant copy');
const portraitHtml = homeHero.match(/<figure class="portrait-frame">[\s\S]*?<\/figure>/)?.[0] || '';
check(portraitHtml.includes('src="' + json('data/profile.json').photo + '"'), 'English portrait: same source as Chinese profile');
check(!portraitHtml.includes('<figcaption>'), 'English portrait: no extra caption, matching Chinese image treatment');
const homeCss = read('static/css/en-home.css');
check(homeCss.includes('body[data-en-page="home"] .portrait-frame img { width: 190px; height: auto; border-radius: 5px; border: 0; outline: 0; box-shadow: none; }'), 'English portrait: Chinese desktop size and undecorated style');
check(homeCss.includes('body[data-en-page="home"] .portrait-frame img { width: 72px; }'), 'English portrait: Chinese mobile size');
const opening=json('data/en-home.json').introHtml;
check(opening.includes('<a href="research_en.html#research3">high-channel-count brain–computer interface chips</a>'),'English opening explicitly identifies BCI chips and links the complete phrase');
check(opening.startsWith('I am a Research Professor at Westlake University,'),'English introduction leads with current roles');
check(homeHero.includes('<p class="hero-description" id="hero-intro">'+opening+'</p>'),'Static opening matches the canonical linked introduction');
check(!homeHtml.includes('About me')&&!homeHtml.includes('id="about-copy"')&&!homeHtml.includes('id="about"'),'Separate About section and obsolete jump link removed');
check(homeHtml.split(opening).length===2,'Approved biography is rendered only once');
check(!homeHtml.includes('id="academic-roles"') && !read('static/js/en-home.js').includes("setText('academic-roles'"),'Standalone professional roles removed from static and runtime content');
check(opening.includes('I am also a Senior Member of IEEE and an Associate Editor of ') && opening.includes('https://www.elspub.com/journals/Neuroelectronics/editorial/'),'IEEE membership and linked editorship are included in the introduction');
check(opening.indexOf('I am also a Senior Member') > opening.indexOf('a co-founder of') && opening.indexOf('I am also a Senior Member') < opening.indexOf('My current research focuses'),'Academic membership follows roles and precedes research');
check(!homeHero.includes('Scholar, BCI Industry Alliance') && !homeHero.includes('Co-founder, Westlake Lingxi Technology'),'Obsolete standalone affiliation wording is absent');
check(homeHero.includes('href="#honors"'),'Opening link now targets the retained honors section');
check(!/<(?:strong|b)\b|localhost|127\.0\.0\.1/.test(opening),'Opening uses normal-weight text and no preview-only URLs');
for(const id of ['research3','research4','research2','research1'])check(opening.includes('research_en.html#'+id),'English opening retains research link '+id);
const gridCss = homeCss.slice(homeCss.indexOf('/* Quiet grid background'), homeCss.indexOf('/* English honors and teaching'));
check(gridCss.includes('body:is(.zh-unified, [data-en-page])::before') && gridCss.includes('background-size: 48px 48px'), 'Chinese and English pages share the approved 48px grid');
check(gridCss.includes('body:is(.zh-unified, [data-en-page]).en-inner::before { opacity: .60; }'), 'English inner pages use the same muted texture as Chinese');
check(gridCss.includes('body:is(.zh-unified, [data-en-page])::before { display: none; }') && gridCss.includes('@media print'), 'Grid remains absent on narrow screens and in print');
for(const page of pages)check(read(page).includes('en-home.css?v=18'), page + ': shared background stylesheet cache is refreshed');
const expectedHonors = json('data/zh-home.json').selectedHonors.filter(h => !h.title.includes('九三学社'));
const englishHonors = json('data/en-home.json').selectedHonors;
const approvedHonorTitles = [
  'Huanao BCI Award — Outstanding Young Scholar',
  'BCI 100 Young Scholars',
  'Young Talent, Zhejiang Provincial High-Level Talent Development Program',
  'Overseas High-Level Talent, Xihu Pearl Program, Hangzhou'
];
check(JSON.stringify(englishHonors.map(h => h.title)) === JSON.stringify(approvedHonorTitles), 'English honors: final approved translations and order');
const staticHonors = homeHtml.match(/<ul class="honors-list" id="honors-list">([\s\S]*?)<\/ul>/)?.[1] || '';
check(englishHonors.length === expectedHonors.length, 'English honors: all Chinese personal honors except Jiusan Society');
check((staticHonors.match(/<li>/g) || []).length === englishHonors.length, 'English honors: static and dynamic item counts match');
check(!/九三学社|Jiusan/i.test(JSON.stringify(englishHonors) + staticHonors), 'English honors: Jiusan Society entries omitted');
englishHonors.forEach((honor, i) => {
  check(honor.titleZh === (expectedHonors[i].titleZh || expectedHonors[i].title) && honor.year === expectedHonors[i].year, 'English honors: Chinese identity, order and year preserved ' + i);
  check(!/[\u4e00-\u9fff]/.test(honor.title) && !!honor.title, 'English honors: translated visible title ' + i);
  check(staticHonors.includes(honor.title) && staticHonors.includes('datetime="' + honor.year + '"'), 'English honors: translated static title and year ' + i);
});
const research = json('data/research.json');
check(research.directions.length === 7, 'Seven research directions');
for (const d of research.directions) {
  check(!!d.title.en && !!d.summary.en && !!d.content.en, `${d.id}: complete English content`);
  check(!/by the end of 2025|16× lossless/.test(d.content.en), `${d.id}: stale/conflicting copy removed`);
  for (const img of d.images || []) check(hasFile(img.srcEn), `${d.id}: English diagram exists`);
  for (const a of d.content.en.matchAll(/href=["']([^"']+)/g)) localLink(a[1], 'research_en.html');
}
const siteCss = read('static/css/en-site.css');
check(/.en-chip-grid \{[^}]*grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/.test(siteCss), 'Desktop chip gallery: three columns');
const tabletCss = siteCss.match(/@media \(max-width: 980px\) \{([\s\S]*?)\n\}/)?.[1] || '';
check(/.en-chip-grid \{[^}]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/.test(tabletCss), 'Tablet chip gallery: two columns');
const mobileCss = siteCss.match(/@media \(max-width: 760px\) \{([\s\S]*?)\n\}/)?.[1] || '';
check(/.en-chip-grid[^}]*grid-template-columns: 1fr/.test(mobileCss), 'Mobile chip gallery: one column');
const chipDescriptionCss = siteCss.match(/\.en-chip-card ul \{([^}]+)\}/)?.[1] || '';
check(chipDescriptionCss.includes('font-size: 14px') && chipDescriptionCss.includes('line-height: 1.6'), 'Compact chip descriptions retain readable 14px type and 1.6 line height');
check(/\.en-chip-card li \+ li \{ margin-top: 4px; \}/.test(siteCss), 'Chip feature items use compact 4px spacing');
const chips = json('data/chips.json');
for (const c of chips.chips) {
  check(!!c.title.en && Array.isArray(c.features.en), 'English chip content');
  check(hasFile(c.image.replace(/\.(jpg|jpeg|png)$/i, '.webp')), 'Chip WebP image: '+c.image);
}
const activities = json('data/coverage.json');
for (const item of activities.items) {
  check(!!item.titleEn, 'Activity English title: '+item.date);
  for (const img of item.images || []) check(hasFile(img.src), 'Event photograph: '+img.src);
}
let publications = 0, abstracts = 0;
for (const group of json('data/publications.json').yearlyFiles) {
  const data = json(group.file);
  for (const type of ['journals','conferences']) for (const year of data[type]) for (const paper of year.items) {
    publications++;
    if (paper.abstract) abstracts++;
    if (/[\u4e00-\u9fff]/.test(paper.title)) check(!!paper.titleEn, 'English title for Chinese-language paper');
    if (paper.pdf) check(hasFile(paper.pdf), 'Paper PDF: '+paper.pdf);
  }
}
function englishValues(value) {
  if (Array.isArray(value)) return value.flatMap(englishValues);
  if (value && typeof value==='object') return Object.entries(value).flatMap(([key,v])=>key==='en'?[v]:englishValues(v));
  return [];
}
check(!englishValues(json('data/join.json')).some(v=>/to be added|format adjustable/i.test(String(v))), 'No recruiting placeholders');
check((read('book-references_en.html').match(/<li id="ref-/g)||[]).length===102, '102 book references');
check(read('book-item-bci_en.html').includes('currently available in Chinese'), 'Book chapter language disclosure');
console.log(`PASS: ${checks} checks; ${pages.length} English pages, ${publications} publications, ${abstracts} abstracts, ${chips.chips.length} chips, ${activities.items.length} activities.`);
