import {publicWebUrl,originPermission,doiInUrl,samePaperLink,rankPdfLinks,classifyPdfLink} from './pdf-policy.mjs';
export {publicWebUrl,originPermission,doiInUrl,samePaperLink,rankPdfLinks,classifyPdfLink};
// Shared URL and download identity checks. No cookies or credentials are inspected.
export function serverAddress(value) {
  const u=new URL(value);
  if(u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('管理系统地址必须是本机 http://127.0.0.1:端口');
  return u.origin;
}
export function ieeeUrl(value, articleNumber='') {
  try {
    const u=new URL(value);
    if(!['http:','https:'].includes(u.protocol)||u.hostname!=='ieeexplore.ieee.org'||u.username||u.password||u.port)return null;
    if(articleNumber&&u.searchParams.get('arnumber')&&u.searchParams.get('arnumber')!==articleNumber)return null;
    u.protocol='https:';
    const direct=/\.pdf(?:$|\/)|\/stampPDF\/getPDF\.jsp$/i.test(u.pathname);
    const viewer=/\/stamp\/stamp\.jsp$/i.test(u.pathname);
    return direct||viewer?{url:u.href,direct}:null;
  } catch {return null;}
}
export function chooseCandidate(urls, articleNumber, visited=[],context={}) {
  return rankPdfLinks(urls,{...context,articleNumber},visited,context.attempted||[])[0]||null;
}
export function ownedDownload(item, active, extensionId) {
  return item.byExtensionId===extensionId&&item.url===active.downloadUrl&&
    String(item.filename||'').replace(/\\/g,'/').split('/').pop()===active.id+'.pdf';
}

export function articleFromPage(value) {
  try { const u=new URL(value);if(u.hostname!=='ieeexplore.ieee.org')return '';const number=u.pathname.match(/\/document\/(\d+)/)?.[1]||u.searchParams.get('arnumber')||'';return /^\d+$/.test(number)?number:''; } catch {return '';}
}
