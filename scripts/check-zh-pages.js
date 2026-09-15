/* Chinese pages now use the English shell, CSS and renderers. */
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const json=f=>JSON.parse(read(f));
const pages=['index.html','research.html','publications.html','chip_gallery.html','coverage.html','join.html','book-item-bci.html'];
let checks=0;
const check=(condition,message)=>{assert(condition,message);checks++;};
function localLink(url,file) {
 if(!url||/^(?:https?:|mailto:|tel:|data:|#|javascript:)/.test(url))return;
 const pathname=decodeURIComponent(new URL(url,'https://local.test/'+file).pathname.slice(1));
 check(fs.existsSync(path.join(root,pathname)),`${file}: missing resource ${pathname}`);
}
for(const file of pages){
 const html=read(file).replace(/<!--[\s\S]*?-->/g,'');
 check(html.includes('<html lang="zh-CN">'),`${file}: Chinese document language`);
 check(!html.includes('class="brand-dot"'),`${file}: Chinese wordmark has no decorative dot`);
 for(const css of ['en-home.css','en-site.css','zh-locale.css'])check(html.includes('static/css/'+css),`${file}: shared ${css}`);
 for(const legacy of ['main.css','zh-site.css','bootstrap','site-renderer.js','zh-site.js'])check(!html.includes(legacy),`${file}: no legacy dependency ${legacy}`);
 check(html.includes('class="site-header"')&&html.includes('class="header-inner"'),`${file}: English header structure`);
 check(html.includes('class="site-footer shell"'),`${file}: English footer structure`);
 const footer=html.match(/<footer class="site-footer shell">[\s\S]*?<\/footer>/)?.[0] || '';
 check(footer.includes('<a class="brand" href="index.html">杨杰</a>'),`${file}: footer brand links to the local homepage`);
 for(const [label,url] of [['西湖大学','https://www.westlake.edu.cn/'],['西湖灵犀科技','https://neuralicorn.com/'],['脑机接口智能芯片系统浙江省工程研究中心','https://bci.westlake.edu.cn/']])check(footer.includes('<a href="'+url+'" target="_blank" rel="noopener">'+label+'</a>'),`${file}: linked footer organization ${label}`);
 check(!footer.includes('西湖大学 · 先进神经芯片中心')&&!/127\.0\.0\.1|localhost/.test(footer),`${file}: footer has no obsolete affiliation or preview-only address`);

 check((html.match(/<h1\b/g)||[]).length===1,`${file}: one h1`);
 check((html.match(/<main\b/g)||[]).length===1,`${file}: one main`);
 check(html.includes('class="skip-link" href="#main"'),`${file}: skip navigation`);
 check(html.includes('aria-label="主导航"')&&html.includes('aria-label="移动导航"'),`${file}: localized navigation`);
 check(html.includes(`href="${file.replace('.html','_en.html')}" lang="en">English`),`${file}: corresponding English switch`);
 check(html.includes(file==='index.html'?'static/js/en-home.js':'static/js/en-site.js'),`${file}: shared renderer`);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);check(ids.length===new Set(ids).size,`${file}: unique IDs`);
 for(const m of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g))localLink(m[1],file);
 for(const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))check(!!JSON.parse(m[1])['@type'],`${file}: valid schema`);
}
const home=json('data/zh-home.json'),profile=json('data/profile.json');
const homeHtml=read('index.html');
const homeFooter=homeHtml.match(/<footer class="site-footer shell">[\s\S]*?<\/footer>/)?.[0] || '';
for(const [label,url] of [['西湖大学','https://www.westlake.edu.cn/'],['西湖灵犀科技','https://neuralicorn.com/'],['脑机接口智能芯片系统浙江省工程研究中心','https://bci.westlake.edu.cn/']])check(homeFooter.includes('<a href="'+url+'" target="_blank" rel="noopener">'+label+'</a>'),'Homepage footer organization link: '+label);
check(!homeFooter.includes('西湖大学 · 先进神经芯片中心'),'Old homepage footer affiliation line removed');

check(homeHtml.includes('class="hero-degree">'+profile.title.zh+'</span>'),'Academic degree visible beside the name');
const portraitFigure=homeHtml.match(/<figure class="portrait-frame">[\s\S]*?<\/figure>/)?.[0] || '';
check(portraitFigure.includes('id="portrait"')&&!portraitFigure.includes('<figcaption>'),'Portrait retained without the redundant caption');
const portraitStyles=[...read('static/css/en-home.css').matchAll(/[^{}]*\.portrait-frame img\s*\{([^}]*)\}/g),...read('static/css/zh-locale.css').matchAll(/[^{}]*\.portrait-frame img\s*\{([^}]*)\}/g)].map(match=>match[1]);
check(portraitStyles.some(style=>style.includes('border: 0; outline: 0; box-shadow: none;')),'Portrait is explicitly frameless');
check(portraitStyles.every(style=>!/(?:outline-width|outline-color)\s*:/.test(style)&&[...style.matchAll(/box-shadow:\s*([^;]+)/g)].every(match=>match[1].trim()==='none')),'No desktop or mobile portrait style reintroduces a white outline or shadow');

check(read('static/css/zh-locale.css').includes('.zh-unified .portrait-frame img { width: 190px; height: auto; }'),'Chinese desktop portrait reduced to 190px without changing aspect ratio');

const homeResponsiveCss=read('static/css/zh-locale.css').split('/* Compact Chinese homepage identity row: narrow screens only; desktop rules stay intact. */')[1]||'';
const mobileHeroCss=homeResponsiveCss.split('@media screen and (max-width: 760px) {')[1]||'';
check((homeResponsiveCss.match(/@media/g)||[]).length===1&&mobileHeroCss.trim().endsWith('}'),'Visible mobile changes are limited to screens at or below 760px');
check(homeResponsiveCss.includes('.hero > .portrait-frame { order: 1; }'),'Single portrait retains its original desktop grid position');
const mobileHeroRules=[...mobileHeroCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
check(mobileHeroRules.length===9&&mobileHeroRules.every(rule=>rule[1].trim().startsWith('.zh-unified[data-page="home"]')),'All mobile rules remain scoped to the Chinese homepage');
check(mobileHeroCss.includes('.hero { display: flow-root; padding: 20px 0 28px; }'),'Mobile hero contains its float without reserving a separate portrait row');
check(mobileHeroCss.includes('float: right; width: 72px; margin: 3px 0 8px 14px;'),'Small portrait floats to the right with a readable text gutter');
check(mobileHeroCss.includes('.hero > div { display: block; }')&&!mobileHeroCss.includes('display: contents'),'Biography wrapper permits text to flow around the preceding float');
check(mobileHeroCss.includes('position: absolute; width: 1px; height: 1px;')&&mobileHeroCss.includes('clip-path: inset(50%)'),'Duplicate visual name/degree is hidden while the main heading remains accessible');
check(!mobileHeroCss.includes('.hero-name-row { display: none'),'Accessible main heading is not removed from the document');
check(mobileHeroCss.includes('width: 72px; max-width: 100%; height: auto;'),'Portrait aspect ratio is preserved');
check(!/\.hero-biography\s*\{[^}]*font-size/.test(mobileHeroCss),'Mobile body text retains its existing readable size');
check(mobileHeroCss.includes('.hero-links { clear: both;'),'Contact links follow the text and never wrap beside the portrait');
check(homeHtml.split('id="portrait"').length===2,'Homepage renders one portrait with no duplicate mobile image');
check(homeHtml.indexOf('<figure class="portrait-frame">')<homeHtml.indexOf('class="hero-biography"'),'Portrait precedes biography in source order so normal text can wrap');

const heroHtml=homeHtml.match(/<section class="hero"[\s\S]*?<\/section>/)?.[0] || '';
const heroText=heroHtml.replace(/<[^>]*>/g,'').replace(/[\s·]/g,'');
check(heroText.includes(home.position.replace(/[\s·]/g,'')),'Primary appointment visible in the opening biography');
for(const affiliation of profile.affiliations)check(heroText.includes(affiliation.zh.replace(/\s/g,'')),'Institutional appointment visible in the opening biography');
for(const role of profile.roles.slice(0,2))check(heroText.includes(role.zh.replace(/<[^>]*>/g,'').replace(/\s/g,'')),'Selected academic credential visible in the opening biography');
check(heroHtml.includes(profile.about.zh),'Full approved biography is statically rendered in the hero');
for(const [label,url] of [['西湖灵犀科技','https://neuralicorn.com/'],['脑机接口智能芯片系统浙江省工程研究中心','https://bci.westlake.edu.cn/'],['西湖大学工学院先进神经芯片中心','https://cenbrain.westlake.edu.cn/']])check(heroHtml.includes('<a href="'+url+'" target="_blank" rel="noopener">'+label+'</a>'),'Biography institution link: '+label);
check(!homeHtml.includes('id="academic-roles"'),'Duplicate appointment row removed from Chinese homepage');
check(!read('static/js/en-home.js').includes('safeRich(role.zh)'),'Removed Chinese appointment row has no unused rendering');
check(!/<(?:strong|b)\b/i.test(profile.about.zh),'Biography uses regular-weight prose without blanket or keyword bolding');
check((profile.about.zh.match(/<p>/g)||[]).length===3,'Three biography paragraphs: identity, research and technology transfer');
check(!heroText.includes('本科毕业于天津大学')&&!heroText.includes('UniversityofCalgary'),'Education paragraph omitted from the homepage biography');
check(profile.about.zh.includes('主持国家科技创新2030')&&!profile.about.zh.includes('支持国家科技创新2030'),'Project leadership uses the correct verb');
check(profile.about.zh.includes('杨杰博士积极推动脑机接口技术转化'),'User-approved BCI technology transfer wording');
check(profile.about.zh.includes('累计研发经费超过5000 万元'),'Updated Chinese funding total');
check(profile.about.en.includes('total funding exceeding 50 million RMB'),'Matching English funding total');
check(heroHtml.includes('<div class="hero-biography" id="profile-details-copy">'+profile.about.zh+'</div>'),'Complete biography remains the visible static fallback');
check(!heroHtml.includes('profile-summary-copy') && !heroHtml.includes('profile-biography-toggle'),'Mobile biography displays full text with no summary or disclosure');
check((homeHtml.match(/id="profile-details-copy"/g)||[]).length===1,'One biography container without a duplicate lower-page biography');
check(!homeHtml.includes('id="profile-contact"')&&!homeHtml.includes('tel:'),'Phone contact removed from Chinese homepage');
check(!read('static/js/en-home.js').includes('profile.contact.phone')&&!read('static/js/en-home.js').includes('profile-contact'),'Phone is not reinserted into the biography by a fallback renderer');
for(const title of ['中国脑机接口华瑙奖“杰出青年奖”','浙江省高层次人才','杭州市海外高层次人才','杭州市西湖明珠工程青年人才','西湖灵犀科技联合创始人'])check(heroText.includes(title),'User-supplied distinction retained: '+title);
check(profile.about.zh.includes('href="research.html#research4">脑—语言解码</a>'),'Neural-language decoding links to research4 rather than neuromorphic research2');
for(const match of profile.about.zh.matchAll(/href="research.html#([^"]+)"/g))check(json('data/research.json').directions.some(d=>d.id===match[1]),'Biography research anchor exists: '+match[1]);
check(profile.about.zh.indexOf('杰出青年奖')<profile.about.zh.indexOf('长期从事'),'Identity and distinctions precede research');
check(!homeHtml.includes('以芯片与算法，连接大脑与数字世界。'),'Chinese homepage leads with biography instead of slogan');
for(const [title,year] of [['脑机接口青百荟青年专家',2025],['浙江省高层次人才培养计划青年人才',2025],['杭州市西湖明珠工程海外高层次人才',2022],['九三学社浙江省委员会参政议政先进个人',2023],['九三学社杭州市西湖区优秀社员',2023]]){
 check(home.selectedHonors.filter(honor=>honor.title===title&&honor.year===year).length===1,'Requested honor and year retained exactly once: '+title);
 check(homeHtml.includes('<span>'+title+'</span><time datetime="'+year+'">'+year+'</time>'),'Requested honor is visible with its year: '+title);
}
check(home.selectedPublications.length===3,'Three selected publications');
for(const language of ['zh','en']){
 const selections=json('data/'+language+'-home.json').selectedPublications;
 const journal=selections.find(item=>item.urlContains==='10777513');
 check(!!journal,language+': selected SNN work is the requested JSSC article');
 check(journal.image==='images/RAINE_V2.webp',language+': JSSC selection retains the original chip image');
 check(journal.venueLabel==='JSSC · 2025',language+': selected journal label uses its final issue year');
 check(!selections.some(item=>item.urlContains==='10529019'),language+': CICC is no longer a selected homepage work');
 const yearly=json('data/publications/'+journal.year+'.json');
 check(yearly.journals.flatMap(group=>group.items).some(paper=>paper.url.includes(journal.urlContains)&&paper.title==='An Energy-Efficient Unstructured Sparsity-Aware Deep SNN Accelerator With 3-D Computation Array'),language+': selection resolves to the exact existing JSSC record');
}

check(home.research.length===3,'Three homepage research pillars');
check(!homeHtml.includes('研究理念与方向介绍')&&!homeHtml.includes('research-overview-copy'),'Redundant research overview disclosure is removed');
check(!read('static/js/en-home.js').includes('research-overview-copy'),'Removed research disclosure has no unused runtime rendering');
check(home.research.map(item=>item.title).join(',')==='记录大脑,解码大脑,模拟大脑','User-requested research card titles and order');
check(homeHtml.includes('<p class="research-lead" id="research-intro-copy">'+home.researchIntro+'</p>'),'Research overview uses a regular-weight paragraph before the cards');
check(home.research.every(item=>!/<(?:strong|b)\b/i.test(item.descriptionHtml)),'Research card descriptions contain no bold emphasis');
check(homeHtml.indexOf('id="research-intro-copy"')<homeHtml.indexOf('id="research-grid"'),'Research overview precedes the three-card grid');
check(!JSON.stringify(home.research).includes('127.0.0.1'),'Research cards contain no preview-only URLs');
for(const item of home.research){
 check(homeHtml.includes('<h3>'+item.title+'</h3><p>'+item.descriptionHtml+'</p>'),'Complete rich research description: '+item.title);
 for(const match of item.descriptionHtml.matchAll(/href="([^"]+)"/g)){
  localLink(match[1],'index.html');
  const target=new URL(match[1],'https://local.test/');
  check(target.pathname==='/research.html'&&json('data/research.json').directions.some(direction=>'#'+direction.id===target.hash),'Research card links to an existing direction');
 }
}
check(read('static/js/en-home.js').includes('safeRich(item.descriptionHtml)'),'Research rich copy uses the shared sanitizer during runtime rendering');
for(const p of home.selectedPublications){localLink(p.image,'index.html');check(!!p.note&&!!p.imageAlt,'Localized selected work');const entries=json(`data/publications/${p.year}.json`);check(['journals','conferences'].flatMap(type=>entries[type].flatMap(g=>g.items)).some(item=>item.url.includes(p.urlContains)),'Selected paper exists');}
for(const item of home.research)localLink(item.link,'index.html');
check(homeHtml.includes('profile-details-copy')&&homeHtml.includes('teaching-materials-copy'),'Profile and approved teaching/materials copy retained');
check(homeHtml.includes('<h2 id="teaching-heading">教学与教材</h2>'),'Teaching section uses the requested heading');
const honorsStart=homeHtml.indexOf('<section class="content-section home-honors" id="about"');
const teachingStart=homeHtml.indexOf('<section class="content-section home-teaching" id="awards"');
check(honorsStart>=0&&teachingStart>honorsStart,'Honors and teaching are separate full-width sections');
const honorsSection=homeHtml.slice(honorsStart,teachingStart);
check(honorsSection.includes('<h2 id="about-heading">荣誉与奖励</h2>'),'Honors section uses the new category title');
check(honorsSection.includes('id="personal-honors-heading">个人荣誉</h3>')&&honorsSection.includes('id="paper-awards-heading">论文与会议荣誉</h3>'),'Personal and paper/conference awards have separate columns');
const paperAwardsMarkup=honorsSection.slice(honorsSection.indexOf('<div id="paper-awards-list">'));
const paperAwardsMain=paperAwardsMarkup.split('<details class="paper-awards-more">')[0];
check(home.paperAwards.length===8&&(paperAwardsMarkup.match(/class="paper-award-item"/g)||[]).length===8,'All eight user-provided paper honors are retained');
check((paperAwardsMain.match(/class="paper-award-item"/g)||[]).length===4,'Only four recent paper honors appear before the disclosure');
check(paperAwardsMarkup.includes('<details class="paper-awards-more">')&&!/<details[^>]*\bopen(?:\s|=|>)/.test(paperAwardsMarkup),'Earlier paper honors are collapsed by default');
check(paperAwardsMarkup.includes('View more')&&paperAwardsMarkup.includes('View less')&&!/查看全部|收起其余/.test(paperAwardsMarkup),'Disclosure has accurate expand and collapse labels');
check(!/<(?:strong|b)\b/.test(paperAwardsMarkup),'Paper honors keep regular font weight');
check(honorsSection.includes('id="honors-list"')&&!honorsSection.includes('id="teaching-course-list"'),'Personal honors no longer share a row with teaching content');
check(homeHtml.indexOf('id="teaching-course-list"')>teachingStart&&homeHtml.indexOf('id="teaching-resource-links"')>teachingStart,'Courses and textbook cards belong to the independent teaching section');
check(homeHtml.includes('class="teaching-intro home-teaching-courses"')&&homeHtml.includes('class="teaching-intro home-teaching-materials"'),'Teaching is divided into courses and materials columns');
check(!homeHtml.includes('class="content-section about-grid"'),'Old uneven combined grid is removed from the Chinese homepage');
const careerCss=read('static/css/zh-locale.css');
check(careerCss.includes('.home-honors-grid, .zh-unified .home-teaching-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));'),'Honors and teaching each use two balanced desktop columns');
check(careerCss.includes('.home-honors-grid, .zh-unified .home-teaching-grid { grid-template-columns: 1fr;'),'Honors and teaching stack on narrow screens');
check(homeHtml.includes('<p id="teaching-materials-copy">'+home.teachingMaterials+'</p>'),'Approved materials paragraph remains visible');
check(!homeHtml.includes('id="teaching-copy"'),'The old Chinese teaching paragraph is removed');
const teachingCourses=homeHtml.match(/<ul class="teaching-course-list"[\s\S]*?<\/ul>/)?.[0] || '';
check((teachingCourses.match(/class="teaching-course-item"/g)||[]).length===5,'Five courses are shown as individual entries');
for(const course of profile.teaching.courses){
 const metadata=[course.years,course.institutionZh,course.levelZh,course.roleZh].filter(Boolean).join(' · ');
 check(teachingCourses.includes('<span class="teaching-course-title">'+course.title+'</span><span class="teaching-course-meta">'+metadata+'</span>'),'Course title, dates, institution and level are shown together');
}
check(homeHtml.includes(profile.teaching.collaborationZh),'Co-teaching acknowledgements and teacher links are retained');
check(!homeHtml.includes('课程、书籍与教学项目')&&!homeHtml.includes('teaching-details-copy'),'Old duplicate teaching disclosure is removed');
const teachingCards=homeHtml.match(/<ul class="teaching-resource-grid"[\s\S]*?<\/ul>/)?.[0] || '';
check((teachingCards.match(/class="teaching-resource-card"/g)||[]).length===3,'Three clickable teaching resource cards are visible');
for(const book of profile.teaching.books){
 check(teachingCards.includes('href="'+book.linkZh+'"')&&teachingCards.includes('src="'+book.image+'"'),'Teaching card retains its source image and destination');
 check(teachingCards.includes(book.resourceTypeZh)&&teachingCards.includes(book.cardTitleZh),'Teaching card distinguishes its resource type and short title');
}
check(!/<(?:strong|b)\b/i.test(teachingCards),'Teaching resource labels have no bold emphasis');
check(profile.teaching.books[1].linkZh==='https://ieeexplore.ieee.org/document/9648040','Chinese monograph card points to the scholarly publication page');
check(read('index.html').includes('demo-list'),'Talks retained');
check(homeHtml.includes('id="talks-heading"')&&homeHtml.includes('id="recent-activities-heading"'),'Reports split into video and recent-activity sections');
check(homeHtml.indexOf('id="demo-list"')<homeHtml.indexOf('id="recent-activity-list"'),'Video cards precede recent activities');
check(homeHtml.includes('href="coverage.html"')&&homeHtml.includes('id="recent-activity-status"'),'Recent activities retain source-page access and a status message');
check(!read('static/js/en-home.js').includes("document.getElementById('demos').hidden"),'Missing videos cannot hide recent activities');
for(const video of profile.demos||[]){
 check(/^BV[0-9A-Za-z]+$/.test(video.bvid),'Configured Bilibili video ID');
 if(video.researchId)check(json('data/research.json').directions.some(direction=>direction.id===video.researchId),'Video related-research anchor exists');
}
for(const book of profile.teaching.books||[]){localLink(book.linkZh,'index.html');localLink(book.image,'index.html');}
for(let i=1;i<=5;i++){const file=`book/chapter_${i}.html`,html=read(file);check(html.includes('lang="zh-CN"'),`${file}: Chinese language`);check(!html.includes("{'一二三四五'[i]}"),`${file}: real title`);check(html.includes('zh-book.css'),`${file}: reading theme`);check(html.includes('aria-current="page"'),`${file}: current chapter`);}
check(!read('static/css/zh-locale.css').includes('max-width: 900px'),'No fixed Chinese body width');
check(read('static/css/zh-locale.css').includes('.zh-unified .hero { padding-top: 36px; }'),'Compact Chinese homepage top spacing');
check(/@media \(max-width: 760px\) \{\s*\.zh-unified \.hero \{ padding-top: 28px; \}/.test(read('static/css/zh-locale.css')),'Compact mobile homepage top spacing');
check(read('publications.html').includes('publication-stats.js'),'Neutral publication statistics retained');
check(read('static/js/en-site.js').includes("document.documentElement.lang.startsWith('zh')"),'Language-aware shared page renderer');
check(read('static/js/en-home.js').includes("document.documentElement.lang.startsWith('zh')"),'Language-aware shared home renderer');
const recruitment=json('data/join.json');
check((recruitment.intro.zh.match(/<p>/g)||[]).length===3,'Approved recruitment introduction has three paragraphs');
check(recruitment.intro.zh.includes('承担多项国家及省部级项目')&&recruitment.intro.zh.includes('科研经费充足'),'Recruitment introduction describes project and research support without the old funding total');
check(recruitment.intro.zh.includes('脑机接口芯片设计、系统与应用、汉语神经解码'),'Recruitment introduction gives all three specialties equal visibility');
check(recruitment.intro.zh.includes('围绕自己的兴趣与专长')&&recruitment.intro.zh.includes('鼓励跨学科合作与独立探索'),'Recruitment introduction supports individual interests and independent exploration');
check(recruitment.intro.zh.includes('访问学生及联合培养硕士、博士研究生')&&recruitment.intro.zh.includes('根据岗位和参与形式提供具有竞争力的待遇'),'Recruitment introduction welcomes visiting and joint-training students with role-specific support');
check(!recruitment.intro.zh.includes('与许多实验室不同')&&!recruitment.intro.zh.includes('5000'),'Superseded comparative and funding-total copy is removed only from the recruitment introduction');
check(recruitment.categories.length===2,'Two recruitment categories');
check(recruitment.categories.map(c=>c.id).join(',')==='academic,industry','Academic and industry category order');
check(new Set(recruitment.categories.map(c=>c.anchor)).size===2,'Unique recruitment category anchors');
for(const category of recruitment.categories) for(const language of ['zh','en']) check(!!category.title[language] && !!category.description[language],category.id+': localized category');
for(const direction of recruitment.directions) check(recruitment.categories.some(c=>c.id===direction.category),direction.id+': valid category');
const chipRole=recruitment.directions.find(d=>d.id==='join-bci-chip');
const decodingRole=recruitment.directions.find(d=>d.id==='join-bci-decoding');
const systemRole=recruitment.directions.find(d=>d.id==='join-bci-system');
const industryRole=recruitment.directions.find(d=>d.id==='join-company');
check(chipRole.category==='academic' && decodingRole.category==='academic','Both research directions are academic');
check(chipRole.projects.length===2,'Chip recruitment retains the two chip research priorities');
check(systemRole?.category==='academic','System and application recruitment is a separate academic role');
check(recruitment.directions.filter(d=>d.category==='academic').map(d=>d.id).join(',')==='join-bci-chip,join-bci-system,join-bci-decoding','Chip, systems and decoding recruitment remain distinct and ordered');
check(chipRole.title.zh==='侵入式脑机接口芯片设计'&&systemRole.title.zh==='侵入式脑机接口系统设计与临床应用','Recruitment titles distinguish IC design from systems and applications');
check(systemRole.background.zh.includes('不要求具备芯片设计或流片经历'),'System applicants are not required to have IC design experience');
check(systemRole.work.some(p=>p.zh.includes('临床团队'))&&systemRole.work.some(p=>p.zh.includes('嵌入式')),'System role includes engineering and clinical research collaboration');
check(systemRole.projects.length===2&&systemRole.projects[0].zh.includes('微电极阵列')&&systemRole.projects[1].zh.includes('揭榜挂帅'),'System recruitment uses existing microsystem and real-time BCI system projects');
for(const language of ['zh','en']) check(systemRole.title[language]&&systemRole.background[language]&&systemRole.work.every(p=>p[language])&&systemRole.positions.every(p=>p[language])&&systemRole.projects.every(p=>p[language]),'System recruitment is complete in '+language);
const expectedChipPriorities=[
 '记录、解码与刺激一体化芯片：探索神经信号采集、片上解码与刺激反馈融合的闭环脑机接口芯片架构。',
 '高通量、低功耗神经接口芯片：研究神经信号采集与片上数据压缩的协同设计，面向植入式脑机接口的通量与功耗需求。'
];
check(chipRole.projects.every((p,i)=>p.zh===expectedChipPriorities[i]),'Unapproved chip projects are described as research priorities');
check(chipRole.projectLabel.zh==='重点研究方向'&&chipRole.projectLabel.en==='Research priorities','Both languages distinguish priorities from approved funded projects');
check(chipRole.projects.every(p=>!/(国家科技重大专项|尖兵|National Science and Technology Major Project|Jianbing)/.test(p.zh+' '+p.en)),'Unapproved chip priorities do not claim funding-program support');
check(decodingRole.projects.length===1 && decodingRole.projects[0].zh==='基于实时汉语语言解码的植入式脑机接口系统 · 工信部“揭榜挂帅”项目','Mandarin decoding: approved title followed by MIIT program');
check(chipRole.projects.every(p=>p.en) && decodingRole.projects.every(p=>p.en),'Project corrections localized into English');
check(industryRole.category==='industry','Company roles categorized as industry');
check(industryRole.projectLabel.zh==='产业化方向','Industry areas are not labeled as research funding');
check(industryRole.positions.some(p=>p.zh==='芯片设计工程师'),'Industry retains chip design role');
check(industryRole.positions.some(p=>p.zh.includes('汉语语音／语言解码') && p.en.includes('decoding')),'Industry explicitly recruits Mandarin speech/language decoding engineers');
check(industryRole.projects.some(p=>p.zh.includes('侵入式脑机接口汉语解码')),'Mandarin neural decoding included as an industry direction');
cp.execFileSync(process.execPath,[path.join(__dirname,'build-zh-pages.js'),'--check'],{cwd:root,stdio:'pipe'});
check(true,'Generated pages match shared templates and data');
console.log(`PASS: ${checks} checks; 7 unified Chinese pages, shared renderers and 5 reading chapters.`);
