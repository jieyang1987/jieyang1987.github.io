// Shared by the local Node service and the Chrome extension. No network or cookies here.
export function publicWebUrl(value) {
 let u;try{u=new URL(value);}catch{throw Error('请输入有效的论文或 PDF 链接');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)throw Error('只支持不含认证信息和非标准端口的公开网页地址');
 const host=u.hostname.toLowerCase().replace(/\.$/,'');
 if(!host.includes('.')||/[^a-z0-9.-]/.test(host)||/^\d+(?:\.\d+){3}$/.test(host)||/(?:^|\.)(?:localhost|local|localdomain|internal|lan|home|onion|invalid|test|example)$/.test(host)||host.split('.').some(x=>!x))throw Error('不能读取本机、私网或保留域名');
 if(/^scholar\.google\./.test(host))throw Error('请使用出版社、预印本或 PDF 链接，而不是 Scholar 页面');
 u.hostname=host;u.protocol='https:';u.hash='';return u.href;
}
export function originPermission(value){return new URL(publicWebUrl(value)).origin+'/*';}
export function doiInUrl(value){
 try{const u=new URL(value);let s=decodeURIComponent(u.searchParams.get('doi')||u.pathname);s=s.replace(/\/(?:full|abstract|pdf|epdf)\/?$/i,'').replace(/\.pdf$/i,'');return (s.match(/10\.\d{4,9}\/[^\s?#]+/i)?.[0]||'').replace(/[.,;]$/,'').toLowerCase();}catch{return '';}
}
function arxivId(u){if(!/(?:^|\.)arxiv\.org$/.test(u.hostname))return '';return u.pathname.match(/\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?$/)?.[1]||'';}
function natureId(u){return /(?:^|\.)nature\.com$/.test(u.hostname)?(u.pathname.match(/\/articles\/([^/]+)/)?.[1]||'').replace(/\.pdf$/i,''):'';}
function pii(u){return u.pathname.match(/\/pii\/([A-Z0-9]+)/i)?.[1]?.toUpperCase()||'';}
function mdpiId(u){return /(?:^|\.)mdpi\.com$/.test(u.hostname)?u.pathname.match(/\/\d{4}-\d{3}[\dX]\/\d+\/\d+\/\d+/i)?.[0]||'':'';}
export function samePaperLink(value,{pageUrl='',articleNumber='',expectedDoi=''}={}){
 const u=new URL(publicWebUrl(value));let page;try{page=new URL(pageUrl);}catch{}
 if(articleNumber&&u.hostname==='ieeexplore.ieee.org'&&u.searchParams.has('arnumber')&&u.searchParams.get('arnumber')!==articleNumber)return false;
 const doi=doiInUrl(u.href),expected=String(expectedDoi||doiInUrl(pageUrl)).toLowerCase();if(doi&&expected&&doi!==expected)return false;
 if(page){
  const a=arxivId(page),b=arxivId(u);if(a&&b&&a!==b)return false;
  const n1=natureId(page),n2=natureId(u);if(n1&&n2&&n1!==n2)return false;
  const p1=pii(page),p2=pii(u);if(p1&&p2&&p1!==p2)return false;
  const m1=mdpiId(page),m2=mdpiId(u);if(m1&&m2&&m1!==m2)return false;
  if(page.hostname==='openreview.net'&&u.hostname==='openreview.net'&&page.searchParams.get('id')&&u.searchParams.get('id')&&page.searchParams.get('id')!==u.searchParams.get('id'))return false;
 }
 return true;
}
export function classifyPdfLink(input,context={}){
 const item=typeof input==='string'?{url:input,kind:'url'}:input;if(!item?.url)return null;
 let url;try{url=publicWebUrl(item.url);if(!samePaperLink(url,context))return null;}catch{return null;}
 const u=new URL(url),kind=item.kind||'url';
 const strong=['citation-meta','pdf-alternate','jsonld-pdf','saved-pdf','embedded-pdf','direct-url'].includes(kind);
 if(!strong&&/supplement|supporting[-_ ]?(?:information|material)|appendix|附录|补充/i.test((item.label||'')+' '+u.pathname))return null;
 const viewer=/\/stamp\/stamp\.jsp$/i.test(u.pathname)||/\/epdf(?:\/|$)|\/pdfviewer(?:\/|$)|\/viewer\.html$/i.test(u.pathname);
 const knownPdf=/\.pdf(?:$|\/)|\/stampPDF\/getPDF\.jsp$|\/(?:pdf|pdfdirect|pdfft)(?:\/|$)/i.test(u.pathname);
 const labelled=kind==='pdf-link';
 if(!viewer&&!knownPdf&&!strong&&!labelled)return null;
 return {url,direct:!viewer,kind,score:strong?100:knownPdf?80:labelled?60:40};
}
export function rankPdfLinks(inputs,context={},visited=[],attempted=[]){
 const seen=new Set(),result=[];
 for(const input of inputs||[]){const item=classifyPdfLink(input,context);if(!item||seen.has(item.url)||attempted.includes(item.url)||(!item.direct&&visited.includes(item.url)))continue;seen.add(item.url);result.push(item);}
 return result.sort((a,b)=>b.score-a.score);
}
