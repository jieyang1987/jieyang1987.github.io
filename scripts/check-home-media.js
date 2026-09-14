/* Offline tests of the deployed homepage media functions.
 * DOM nodes and existing presentation helpers are stubbed; browser playback is not tested. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const profile = JSON.parse(read('data/profile.json'));
const coverage = JSON.parse(read('data/coverage.json'));
const source = read('static/js/en-home.js');
const start = source.indexOf('  function renderVideoCards(profile) {');
const end = source.indexOf('  function renderChineseExtras(profile) {', start);
assert(start >= 0 && end > start, 'Locate deployed media functions');
const sourceBefore = JSON.stringify({profile, coverage});
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = value => String(value || '').replace(/<[^>]*>/g, '');
let checks = 0;
function check(condition, label) { assert(condition, label); checks++; }
function harness() {
  const nodes = new Map();
  for (const id of ['demo-list','recent-activity-list','recent-activity-status']) nodes.set(id, {
    innerHTML: '', textContent: '', hidden: false, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  });
  const state = {coverage, fail: false, requests: [], warnings: 0};
  const context = {
    document: {getElementById: id => nodes.get(id) || null},
    location: {origin: 'https://local.test'}, URL,
    escapeHTML: escape, plainText: plain,
    safeHref: value => {
      if (!value) return '';
      try { const url = new URL(value, 'https://local.test/index.html'); return ['http:','https:','mailto:','tel:'].includes(url.protocol) ? url.href : ''; }
      catch (_) { return ''; }
    },
    fetchJSON: async file => {
      state.requests.push(file);
      if (state.fail) throw new Error('Simulated unavailable activity source');
      return state.coverage;
    },
    console: {warn() { state.warnings++; }}
  };
  const api = vm.runInNewContext(source.slice(start, end)+'\n({renderVideoCards,selectRecentActivities,renderRecentActivities})', context);
  return {api, state, nodes};
}
async function main() {
  const h = harness(), {api, nodes, state} = h;
  const videos = nodes.get('demo-list'), feed = nodes.get('recent-activity-list'), status = nodes.get('recent-activity-status');
  api.renderVideoCards(profile);
  const eligible = profile.demos.filter(video => video.enabled !== false && /^BV[0-9A-Za-z]+$/.test(video.bvid));
  const frames = [...videos.innerHTML.matchAll(/<iframe\b[^>]*>/g)].map(match => match[0]);
  check(frames.length === new Set(eligible.map(video=>video.bvid)).size, 'All configured videos render as cards');
  for (const frame of frames) {
    check(frame.includes('loading="lazy"'), 'Video player loads lazily');
    check(frame.includes('autoplay=0') && !frame.includes('autoplay=1'), 'No automatic video playback');
    check(frame.includes('title="') && frame.includes('allowfullscreen'), 'Player has a title and fullscreen support');
    const url = new URL(frame.match(/src="([^"]+)"/)[1].replace(/&amp;/g,'&'));
    check(url.origin === 'https://player.bilibili.com', 'Use the existing Bilibili embed host');
    check(eligible.some(video=>video.bvid===url.searchParams.get('bvid')), 'Embed uses a configured BVID');
  }
  for (const video of eligible) {
    check(videos.innerHTML.includes(escape(plain(video.titleZh))), 'Video title retained');
    check(videos.innerHTML.includes('https://www.bilibili.com/video/'+video.bvid+'/'), 'Always provide a direct Bilibili fallback');
  }
  const four = [1,2,3,4].map(i=>({bvid:'BVTEST00000'+i,titleZh:'测试报告 '+i,researchId:'research4'}));
  api.renderVideoCards({demos:four});
  check((videos.innerHTML.match(/<article class="home-video-card">/g)||[]).length===4, 'Adding four videos needs no template changes');
  api.renderVideoCards({demos:[...four,four[0],{bvid:'invalid',titleZh:'Invalid'},{bvid:'BVDisabled00',titleZh:'Disabled',enabled:false}]});
  check((videos.innerHTML.match(/<iframe\b/g)||[]).length===4, 'Skip duplicate, invalid and disabled video records');
  api.renderVideoCards({demos:[{bvid:'BVSAFETEST00',titleZh:'<img src=x onerror=alert(1)>" onclick="bad',researchId:'../../bad'}]});
  check(!videos.innerHTML.includes('<img src=x')&&!videos.innerHTML.includes('onclick="bad'), 'Video titles cannot inject markup');
  check(!videos.innerHTML.includes('相关研究'), 'Invalid research anchors are omitted');
  api.renderVideoCards({demos:[]});
  check(!videos.innerHTML.includes('<iframe')&&videos.innerHTML.includes('暂无报告视频'), 'Empty video state is explicit');

  const fixtures = [
    {date:'2026.9.2',title:'September'}, {date:'2025.12.31',title:'Previous year'},
    {date:'2026.10.1',title:'October A'}, {date:'2026.10.01',title:'October B'},
    {date:'2026/8/25',title:'August'}, {date:'2024-02-29',title:'Leap day'},
    {date:'2026.02.30',title:'Invalid day'}, {date:'2026.13.1',title:'Invalid month'},
    {date:'not a date',title:'Invalid date'}, {date:'2026.12.1',title:''}, null
  ];
  const fixtureBefore = JSON.stringify(fixtures);
  const sorted = api.selectRecentActivities(fixtures);
  check(sorted.length===4, 'Only the latest four valid activities are selected');
  check(sorted.map(item=>item.title).join('|')==='October A|October B|September|August', 'Sort actual dates, not unpadded date strings; ties stay stable');
  check(sorted.map(item=>item.iso).join('|')==='2026-10-01|2026-10-01|2026-09-02|2026-08-25', 'Use normalized date/time values');
  check(api.selectRecentActivities(fixtures,99).some(item=>item.title==='Leap day'), 'Valid leap days are accepted');
  check(api.selectRecentActivities(fixtures,99).length===6, 'Invalid dates and empty titles are ignored');
  check(JSON.stringify(fixtures)===fixtureBefore, 'Sorting does not mutate source records');
  check(api.selectRecentActivities(null).length===0, 'Missing activity arrays are handled');

  await api.renderRecentActivities();
  check(state.requests.join('|')==='data/coverage.json', 'Read the same source as the activity page');
  const selected = api.selectRecentActivities(coverage.items);
  check((feed.innerHTML.match(/<li class="home-activity-item">/g)||[]).length===Math.min(4,selected.length), 'Live data renders at most four rows');
  for (const activity of selected) {
    check(feed.innerHTML.includes(escape(plain(activity.title))), 'Recent activity title retained');
    check(feed.innerHTML.includes('datetime="'+activity.iso+'"'), 'Activity dates are machine-readable');
    check(feed.innerHTML.includes(activity.dateLabel), 'Activity dates are visible');
  }
  check(!feed.innerHTML.includes('<img')&&!feed.innerHTML.includes('has-thumbnail'), 'Homepage activity feed is text-only even when source photographs exist');
  check(status.hidden&&feed.attributes['aria-busy']==='false', 'Loading state clears after success');
  check(videos.innerHTML.includes('暂无报告视频'), 'Recent activities still display when no videos exist');

  const next = new Date(selected[0].timestamp + 86400000);
  state.coverage = {items:[...coverage.items,{date:next.toISOString().slice(0,10),title:'新增活动（测试数据）',url:''}]};
  await api.renderRecentActivities();
  check(state.requests.length===2, 'A refresh reads updated activity data');
  check(feed.innerHTML.indexOf('新增活动（测试数据）')<feed.innerHTML.indexOf(escape(plain(selected[0].title))), 'A newly added event automatically becomes the first homepage item');
  check((feed.innerHTML.match(/<li class="home-activity-item">/g)||[]).length===4, 'A new event replaces the oldest visible item');
  check(feed.innerHTML.includes('href="https://local.test/coverage.html"'), 'Events without an external URL link to the activity page');

  state.coverage={items:[{date:'2026.9.1',title:'Safe <script>alert(1)</script> event',url:'javascript:alert(1)',images:[{src:'javascript:alert(2)'}]}]};
  await api.renderRecentActivities();
  check(!feed.innerHTML.includes('javascript:')&&!feed.innerHTML.includes('<script>'), 'Untrusted activity text and links cannot inject executable markup');
  check(!feed.innerHTML.includes('<img'), 'Homepage does not render image metadata');
  state.coverage={items:[]};
  await api.renderRecentActivities();
  check(!feed.innerHTML&&!status.hidden&&status.textContent==='暂无活动记事。', 'Empty activity state is explicit');
  state.fail=true;
  await api.renderRecentActivities();
  check(!feed.innerHTML&&!status.hidden&&status.innerHTML.includes('href="coverage.html"'), 'Failure retains a usable link to the complete activity page');
  check(feed.attributes['aria-busy']==='false', 'Loading state clears after failure');
  state.fail=false;state.coverage={wrongShape:[]};
  await api.renderRecentActivities();
  check(!status.hidden&&state.warnings===2, 'Invalid payloads display a failure instead of hanging');
  check(JSON.stringify({profile,coverage})===sourceBefore, 'Tests and renderers do not alter saved source data');
  const emptyHost=harness();emptyHost.nodes.clear();
  emptyHost.api.renderVideoCards(profile);
  await emptyHost.api.renderRecentActivities();
  check(emptyHost.state.requests.length===0, 'Pages without the media containers make no activity request');
  const css=read('static/css/zh-locale.css');
  check(css.includes('.home-talk-grid { display: flex;')&&css.includes('overflow-x: auto;')&&css.includes('scroll-snap-type: x mandatory;'), 'Video cards stay in a horizontally scrollable row');
  check(css.includes('.home-video-card { flex: 0 0 calc((100% - 40px) / 3);'), 'Desktop video cards occupy one third of the viewport');
  check(css.includes('.home-video-card { flex-basis: calc((100% - 20px) / 2); }'), 'Medium screens show two compact video cards');
  check(css.includes('.home-video-card { flex-basis: 100%; }'), 'Small screens show one video card');
  console.log('PASS: '+checks+' homepage media checks; video cards, date sorting, updates, fallback and error states.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
