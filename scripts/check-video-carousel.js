/* Offline interaction tests of the deployed video carousel controller.
 * Scroll geometry, events and ResizeObserver are mocked; this is not browser playback testing. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'static/js/en-home.js'),'utf8');
const begin=source.indexOf('  function setupVideoCarousel() {');
const end=source.indexOf('  function selectRecentActivities(',begin);
assert(begin>=0&&end>begin,'Find the deployed carousel controller');
const controller=source.slice(begin,end).trim();
let checks=0;
function check(value,message){assert(value,message);checks++;}
function eventTarget(){
 const handlers=new Map();
 return {handlers,
  addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);},
  removeEventListener(type,fn){handlers.get(type)?.delete(fn);},
  fire(type,event={}){for(const fn of [...(handlers.get(type)||[])])fn(event);},
  listeners(type){return handlers.get(type)?.size||0;}
 };
}
function harness(count=8,width=940,withObserver=true){
 const track=Object.assign(eventTarget(),{clientWidth:width,scrollLeft:0,tabIndex:-1,calls:[]});
 const state={count,cardWidth:300,gap:20,reduced:false,observers:[]};
 Object.defineProperty(track,'scrollWidth',{get:()=>state.count?state.count*state.cardWidth+(state.count-1)*state.gap:0});
 track.getBoundingClientRect=()=>({left:0,right:track.clientWidth,width:track.clientWidth});
 track.querySelectorAll=()=>Array.from({length:state.count},(_,index)=>({
  get offsetLeft(){return index*(state.cardWidth+state.gap);},
  getBoundingClientRect(){const left=index*(state.cardWidth+state.gap)-track.scrollLeft;return {left,right:left+state.cardWidth,width:state.cardWidth};}
 }));
 track.scrollTo=options=>{track.calls.push(options);track.scrollLeft=options.left;track.fire('scroll');};
 const previous=Object.assign(eventTarget(),{disabled:true});
 const next=Object.assign(eventTarget(),{disabled:true});
 const controls={hidden:true},range={textContent:''};
 const nodes=new Map([['demo-list',track],['video-carousel-controls',controls],['video-carousel-previous',previous],['video-carousel-next',next],['video-carousel-range',range]]);
 const window=Object.assign(eventTarget(),{matchMedia:()=>({matches:state.reduced})});
 class MockObserver{
  constructor(callback){this.callback=callback;this.disconnected=false;state.observers.push(this);}
  observe(target){this.target=target;}
  disconnect(){this.disconnected=true;}
 }
 const context={document:{getElementById:id=>nodes.get(id)||null},window,ResizeObserver:withObserver?MockObserver:undefined};
 const setup=vm.runInNewContext('('+controller+')',context);
 const key=(value,target=track)=>{let prevented=false;track.fire('keydown',{key:value,target,preventDefault(){prevented=true;}});return prevented;};
 const resize=()=>{if(withObserver)state.observers.at(-1).callback();else window.fire('resize');};
 return {setup,track,previous,next,controls,range,state,nodes,window,key,resize};
}
const h=harness();h.setup();
check(!h.controls.hidden&&h.track.tabIndex===0,'Loaded carousel exposes controls and keyboard focus');
check(h.range.textContent==='1–3 / 8','Desktop displays the first three video positions');
check(h.previous.disabled&&!h.next.disabled,'Start boundary disables only the previous button');
check(h.state.observers.length===1&&h.state.observers[0].target===h.track,'Track resizes are observed');
h.next.fire('click');
check(h.track.scrollLeft===320&&h.range.textContent==='2–4 / 8','Next moves one card and updates the visible range');
check(h.track.calls.at(-1).behavior==='smooth','User navigation scrolls smoothly by default');
check(!h.previous.disabled,'Previous becomes available after moving forward');
for(let i=0;i<20;i++)h.next.fire('click');
check(h.track.scrollLeft===1600&&h.range.textContent==='6–8 / 8','Navigation clamps to the last complete viewport');
check(h.next.disabled&&!h.previous.disabled,'End boundary disables only the next button');
h.previous.fire('click');
check(h.track.scrollLeft===1280&&h.range.textContent==='5–7 / 8','Previous moves back one card');
h.track.scrollLeft=640;h.track.fire('scroll');
check(h.range.textContent==='3–5 / 8','Native horizontal scrolling updates the counter');
h.track.clientWidth=620;h.resize();
check(h.range.textContent==='3–4 / 8','Resizing to a two-card viewport updates its range');
h.track.clientWidth=300;h.resize();
check(h.range.textContent==='3 / 8','A single-card viewport shows a compact counter');
check(h.key('Home')&&h.track.scrollLeft===0,'Home returns to the first card');
check(h.key('ArrowRight')&&h.track.scrollLeft===320,'Right arrow advances while the track is focused');
check(h.key('ArrowLeft')&&h.track.scrollLeft===0,'Left arrow moves back while the track is focused');
const before=h.track.calls.length;
check(!h.key('ArrowRight',{})&&h.track.calls.length===before,'Keys from child links or video controls are not intercepted');
check(!h.key('Space')&&h.track.calls.length===before,'Unrelated keys are not intercepted');
h.state.reduced=true;h.key('End');
check(h.track.scrollLeft===2240&&h.range.textContent==='8 / 8','End reaches the last card on mobile');
check(h.track.calls.at(-1).behavior==='auto','Reduced-motion preference disables smooth scrolling');
h.setup();
check(h.state.observers[0].disconnected,'Reinitialization disconnects the old observer');
check(h.track.listeners('scroll')===1&&h.track.listeners('keydown')===1&&h.next.listeners('click')===1,'Reinitialization does not accumulate event handlers');
h.track.cleanupVideoCarousel();
check(h.track.listeners('scroll')===0&&h.previous.listeners('click')===0&&h.state.observers.at(-1).disconnected,'Cleanup removes all observers and listeners');
const two=harness(2);two.setup();
check(two.range.textContent==='1–2 / 2','Existing two videos are counted without placeholders');
check(two.previous.disabled&&two.next.disabled,'No scrolling is offered when both videos fit');
two.track.clientWidth=300;two.resize();
check(!two.next.disabled&&two.range.textContent==='1 / 2','The same videos become browsable on a narrow screen');
two.next.fire('click');
check(two.range.textContent==='2 / 2'&&two.next.disabled,'Mobile can browse to the second configured video');
const empty=harness(0);empty.setup();
check(empty.controls.hidden&&empty.track.tabIndex===-1&&empty.range.textContent==='','Empty lists hide inactive carousel controls');
check(empty.track.listeners('scroll')===0,'No scroll listeners are attached to an empty list');
const single=harness(1);single.setup();
check(single.previous.disabled&&single.next.disabled&&single.range.textContent==='1 / 1','Single-video state stays usable');
const fallback=harness(5,940,false);fallback.setup();
check(fallback.window.listeners('resize')===1,'Window resize is a fallback when ResizeObserver is unavailable');
fallback.track.clientWidth=300;fallback.resize();
check(fallback.range.textContent==='1 / 5','Fallback resize updates the visible range');
fallback.track.cleanupVideoCarousel();
check(fallback.window.listeners('resize')===0,'Fallback resize listener is cleaned up');
const absent=harness();absent.nodes.clear();absent.setup();
check(absent.state.observers.length===0,'Pages without carousel markup require no setup');
check(!controller.includes('setInterval'),'Carousel never advances automatically');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
check(html.includes('aria-label="向左浏览视频"')&&html.includes('aria-label="向右浏览视频"'),'Navigation buttons have accessible labels');
check(html.includes('id="video-carousel-range" aria-live="polite"'),'Visible range changes are announced politely');
check(html.includes('aria-label="报告视频，可左右浏览" tabindex="0"'),'Carousel track is identifiable and focusable');
console.log('PASS: '+checks+' carousel checks; navigation, boundaries, resize, keyboard, reduced motion and cleanup.');
