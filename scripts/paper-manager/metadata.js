'use strict';

// URL import is read-only: only source-backed metadata is returned to a review form.
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns').promises;
const net = require('node:net');

function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  // Restrict IPv6 to global unicast; this also rejects IPv4-mapped addresses.
  return net.isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:db8:/i.test(address);
}
function inputUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('请输入有效的论文 URL 或 DOI');
  let s = value.trim().replace(/^doi:\s*/i, '');
  if (/^10\.\d{4,9}\//.test(s)) s = 'https://doi.org/' + s;
  let u; try { u = new URL(s); } catch { throw new Error('请输入完整的 http(s) 论文 URL 或 DOI'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password ||
      (u.port && !['80', '443'].includes(u.port))) throw new Error('只支持不含认证信息的公开 HTTP(S) 论文链接');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      (net.isIP(host) && !publicAddress(host))) throw new Error('不能抓取本机或内网地址');
  u.hash = '';
  return u.href;
}
async function requestText(value, options = {}) {
  const timeout = options.timeout || 12000;
  const deadline = Date.now() + timeout;
  async function visit(value, redirects) {
    const u = new URL(inputUrl(value));
    if (redirects > 4) throw new Error('重定向次数过多');
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('请求超时');
    // Pin validated DNS addresses to the actual connection, not a second DNS lookup.
    let timer;
    const records = await Promise.race([
      dns.lookup(u.hostname.replace(/^\[|\]$/g, ''), { all: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS 超时')), remaining); }),
    ]).finally(() => clearTimeout(timer));
    if (!records.length || records.some(r => !publicAddress(r.address))) throw new Error('不能抓取本机或内网地址');
    return new Promise((resolve, reject) => {
      const client = u.protocol === 'https:' ? https : http;
      const req = client.get(u, {
        headers: { 'User-Agent': 'PaperManager/2.0', Accept: 'text/html,application/json;q=0.9,*/*;q=0.5', 'Accept-Encoding': 'identity' },
        lookup: (hostname, opts, cb) => opts.all ? cb(null, records) : cb(null, records[0].address, records[0].family),
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); clearTimeout(totalTimer);
          // API keys must never follow redirects to another host.
          const next = new URL(res.headers.location, u);
          if ((u.searchParams.has('apikey') || u.searchParams.has('api_key')) && next.origin !== u.origin) {
            return reject(new Error('拒绝带凭据的跨站重定向'));
          }
          return resolve(visit(next.href, redirects + 1));
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
        let size = 0; const chunks = [];
        res.on('data', chunk => {
          size += chunk.length;
          if (size > 3 * 1024 * 1024) req.destroy(new Error('元数据响应超过 3 MB 限制'));
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('aborted', () => reject(new Error('响应中断')));
        res.on('end', () => { clearTimeout(totalTimer); resolve(Buffer.concat(chunks).toString('utf8')); });
      });
      const totalTimer = setTimeout(() => req.destroy(new Error('请求超时')), Math.max(1, deadline - Date.now()));
      req.on('error', reject);
      req.on('close', () => clearTimeout(totalTimer));
    });
  }
  return visit(value, 0);
}
function decode(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (m, x) => {
    if (x[0] !== '#') return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[x.toLowerCase()] || m;
    const n = x[1].toLowerCase() === 'x' ? parseInt(x.slice(2),16) : parseInt(x.slice(1),10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}
function text(s) { return decode(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function escaped(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function authors(names) {
  return names.map(name => {
    if (typeof name === 'string') name = { name };
    if (name.name) return escaped(text(name.name)); // Do not guess family/given order for unstructured names.
    const given = text(name.given).split(/\s+/).filter(Boolean).map(p => p.split('-').map(x => x[0]?.toUpperCase() || '').join('-') + '.').join(' ');
    const full = [given, text(name.family)].filter(Boolean).join(' ');
    return /^J\.\s*Yang$/i.test(full) ? '<strong>J. Yang</strong>' : escaped(full);
  }).filter(Boolean).join(', ');
}
function doiFrom(value) {
  let s = String(value || ''); try { s = decodeURIComponent(s); } catch {}
  s = s.replace(/\/(?:full|abstract|pdf|epdf)\/?(?:[?#].*)?$/i, '');
  const match = s.match(/10\.\d{4,9}\/[^\s<>"?#]+/i);
  return match ? match[0].replace(/[.,;]+$/, '').toLowerCase() : '';
}
function ieeeNumber(value) {
  try { const u = new URL(value); if (u.hostname !== 'ieeexplore.ieee.org') return '';
    return (u.pathname.match(/\/(?:document|stamp\/stamp\.jsp)\/?(\d+)?/)?.[1] || u.searchParams.get('arnumber') || '').replace(/[^0-9]/g, '');
  } catch { return ''; }
}
function identityUrl(value) {
  try { const u = new URL(inputUrl(value)); const ieee = ieeeNumber(u.href); if (ieee) return 'ieee:' + ieee;
    const doi = doiFrom(u.href); if (doi) return 'doi:' + doi;
    u.protocol='https:'; u.hash=''; for(const k of [...u.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(k)) u.searchParams.delete(k);
    u.searchParams.sort(); return u.href.replace(/\/$/, '');
  } catch { return ''; }
}
function year(value) { const n=Number(String(value || '').match(/\b(?:19|20|21)\d{2}\b/)?.[0]); return n || null; }
function section(type) {
  if (/proceedings-article|conference/i.test(type || '')) return 'conferences';
  if (/journal-article|journals?|periodical/i.test(type || '')) return 'journals';
  return '';
}
function crossref(msg) {
  return {title:text(msg.title?.[0]),authors:authors(msg.author || []),venue:text(msg['container-title']?.[0]),
    year:year((msg['published-print'] || msg['published-online'] || msg.published || msg.issued)?.['date-parts']?.[0]?.[0]),
    abstract:text(msg.abstract),doi:doiFrom(msg.DOI),section:section(msg.type)};
}
function ieeeRecord(msg) {
  return {title:text(msg.title),authors:authors([...(msg.authors?.authors || [])].sort((a,b)=>(a.author_order || 0)-(b.author_order || 0)).map(a=>({name:a.full_name}))),
    venue:text(msg.publication_title),year:year(msg.publication_year),abstract:text(msg.abstract),doi:doiFrom(msg.doi),
    section:section(msg.content_type),pdf:msg.access_type === 'Open Access' || msg.accessType === 'Open Access' ? msg.pdf_url || '' : ''};
}
function parseHtml(html, url) {
  const meta = new Map();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs={}; for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);
    const key=(attrs.name||attrs.property||'').toLowerCase(); if(key && attrs.content) meta.set(key,[...(meta.get(key)||[]),attrs.content]);
  }
  const val=(...keys)=>keys.map(k=>meta.get(k)?.[0]).find(Boolean)||'';
  // Generic OpenGraph page descriptions alone must not turn a login/home page into a paper.
  const scholarly=val('citation_title','dc.title','dc.identifier','citation_doi');
  const result = scholarly ? {title:text(val('citation_title','dc.title')),authors:authors((meta.get('citation_author')||[]).map(name=>({name}))),
    venue:text(val('citation_journal_title','citation_conference_title','prism.publicationname')),
    year:year(val('citation_publication_date','citation_date','prism.publicationdate','dc.date')),
    abstract:text(val('citation_abstract','dc.description','description','og:description')),
    doi:doiFrom(val('citation_doi','prism.doi','dc.identifier')),
    pdf:val('citation_pdf_url'),section:val('citation_conference_title')?'conferences':val('citation_journal_title')?'journals':''} : {};
  function walk(item) {
    if (!item || typeof item !== 'object') return;
    if(Array.isArray(item)){item.forEach(walk);return;}
    const types=Array.isArray(item['@type'])?item['@type']:[item['@type']];
    if(types.some(t=>['ScholarlyArticle','Article','ResearchArticle'].includes(t))) {
      const values={title:text(item.headline||item.name),abstract:text(item.abstract||item.description),year:year(item.datePublished),
        venue:text(item.isPartOf?.name),authors:authors([item.author||[]].flat().map(a=>typeof a==='string'?{name:a}:a.givenName&&a.familyName?{given:a.givenName,family:a.familyName}:{name:a.name})),
        doi:doiFrom(typeof item.identifier==='string'?item.identifier:JSON.stringify(item.identifier||'')),section:section(item.isPartOf?.['@type'])};
      for(const[k,v]of Object.entries(values))if(!result[k]&&v)result[k]=v;
    }
    if(item['@graph'])walk(item['@graph']);
  }
  for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {try{walk(JSON.parse(m[1]));}catch{}}
  // IEEE sometimes exposes full structured metadata even without citation meta tags.
  const assignment=html.match(/(?:global\.)?document\.metadata\s*=\s*(\{[^]*?\})\s*;/);
  if(assignment){try{const raw=JSON.parse(assignment[1]);const values=ieeeRecord({...raw,title:raw.title||raw.displayDocTitle,publication_title:raw.publicationTitle||raw.publication_title,publication_year:raw.publicationYear||raw.publication_year,authors:{authors:(raw.authors||[]).map(a=>({full_name:a.name||a.full_name}))}});for(const[k,v]of Object.entries(values))if(!result[k]&&v)result[k]=v;}catch{}}
  if(new URL(url).hostname==='arxiv.org' && result.title) {
    const abstract=html.match(/<blockquote\b[^>]*class=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]*?)<\/blockquote>/i);
    if(abstract)result.abstract=text(abstract[1]).replace(/^Abstract:\s*/i,'');
    // A preprint does not establish its eventual conference/journal venue.
    result.section=''; result.venue='';
  }
  if(result.pdf){try{result.pdf=inputUrl(new URL(result.pdf,url).href);}catch{result.pdf='';}}
  return result;
}
function openalex(work) {
  const words=[];
  for(const[w,positions]of Object.entries(work.abstract_inverted_index||{}))for(const i of positions)if(Number.isInteger(i)&&i>=0&&i<20000)words[i]=w;
  const loc=(work.locations||[]).find(l=>l.is_oa&&l.pdf_url);
  const journal=work.primary_location?.source;
  return {title:text(work.title),authors:authors((work.authorships||[]).map(a=>({name:a.author?.display_name}))),
    abstract:words.filter(Boolean).join(' '),venue:journal?.type==='journal'?text(journal.display_name):'',year:year(work.publication_year),
    doi:doiFrom(work.doi),section:work.type==='proceedings-article'?'conferences':journal?.type==='journal'?'journals':'',pdf:loc?.pdf_url||''};
}
function suggestions(meta) {
  const s=(meta.title+' '+(meta.abstract||'')).toLowerCase();const topics=[];
  for(const[id,re]of [['bci',/brain.computer|neural implant|neural interface|visual prosthe/],['decoding',/decoding|seizure|electroencephalo|\beeg\b|\bemg\b/],['neuromodulation',/neuromodulation|\brtms\b|neurostimul|nerve stimul/],['neuromorphic',/neuromorphic|spiking|\bsnn\b/]])if(re.test(s))topics.push(id);
  return topics;
}
async function resolveMetadata(value, options={}) {
  const url=inputUrl(value), request=options.request||requestText;
  const meta={title:'',authors:'',venue:'',year:null,abstract:'',doi:doiFrom(url),section:'',pdf:'',url,fieldSources:{},warnings:[],attempts:[]};
  const merge=(data,source)=>{for(const key of ['title','authors','venue','year','abstract','doi','section','pdf'])if(!meta[key]&&data[key]){meta[key]=data[key];meta.fieldSources[key]=source;}};
  const attempt=async(name,fn)=>{try{const data=await fn();meta.attempts.push({source:name,status:data?'ok':'not-found'});if(data)merge(data,name);return data;}catch(e){meta.attempts.push({source:name,status:'failed'});meta.warnings.push(name+' 未取得数据'+(/HTTP \d+/.test(e.message)?'（'+e.message.match(/HTTP \d+/)[0]+'）':''));return null;}};
  const json=async u=>JSON.parse(await request(u));
  const article=ieeeNumber(url); const ieeeKey=options.ieeeKey??process.env.IEEE_API_KEY;
  if(article && ieeeKey)await attempt('IEEE 官方元数据',async()=>{const u=new URL('https://ieeexploreapi.ieee.org/api/v1/search/articles');u.search=new URLSearchParams({article_number:article,apikey:ieeeKey,format:'json'});const data=await json(u.href);const found=data.articles?.find(a=>String(a.article_number)===article);return found?ieeeRecord(found):null;});
  // Even a successful Crossref lookup can lack an abstract; continue to fill missing fields.
  const triedDoi=new Set();
  const fromCrossref=async()=>{if(!meta.doi||triedDoi.has(meta.doi))return;const doi=meta.doi;triedDoi.add(doi);await attempt('Crossref',async()=>{const data=await json('https://api.crossref.org/works/'+encodeURIComponent(doi));if(doiFrom(data.message?.DOI)!==doi)throw Error('DOI mismatch');return crossref(data.message);});};
  await fromCrossref();
  if(!meta.title||!meta.authors||!meta.venue||!meta.year||!meta.abstract||!meta.pdf)await attempt('论文页面',async()=>{const data=parseHtml(await request(url),url);if(!data.title)return null;if(meta.doi&&data.doi&&meta.doi!==data.doi)throw Error('DOI mismatch');return data;});
  await fromCrossref();
  if(!meta.title||!meta.authors||!meta.venue||!meta.year||!meta.abstract)await attempt('OpenAlex',async()=>{
    let work;
    if(meta.doi){const u=new URL('https://api.openalex.org/works/https://doi.org/'+meta.doi);if(options.openalexKey||process.env.OPENALEX_API_KEY)u.searchParams.set('api_key',options.openalexKey||process.env.OPENALEX_API_KEY);work=await json(u.href);if(doiFrom(work.doi)!==meta.doi)throw Error('DOI mismatch');}
    else {const canonical=article?'https://ieeexplore.ieee.org/document/'+article:url;const u=new URL('https://api.openalex.org/works');u.searchParams.set('filter','locations.landing_page_url:'+canonical);u.searchParams.set('per-page','5');if(options.openalexKey||process.env.OPENALEX_API_KEY)u.searchParams.set('api_key',options.openalexKey||process.env.OPENALEX_API_KEY);const data=await json(u.href);const matches=(data.results||[]).filter(w=>(w.locations||[]).some(l=>identityUrl(l.landing_page_url)===identityUrl(url)));if(matches.length!==1)return null;work=matches[0];}
    return work?openalex(work):null;
  });
  await fromCrossref();
  if(article&&!ieeeKey&&(!meta.title||!meta.abstract))meta.warnings.push('IEEE 页面可能受反爬限制。未配置 IEEE_API_KEY；可配置官方元数据接口，或改贴 DOI 链接重试。');
  if(meta.pdf){try{meta.pdf=inputUrl(meta.pdf);}catch{meta.pdf='';delete meta.fieldSources.pdf;}}
  meta.topics=suggestions(meta);
  meta.venueHighlight=/\b(ISSCC|JSSC)\b|Journal of Solid-State Circuits|International Solid-State Circuits Conference/.test(meta.venue);
  meta.missing=['title','authors','venue','year','section','abstract','pdf'].filter(k=>!meta[k]);
  meta.source=[...new Set(Object.values(meta.fieldSources))].join(' + ');
  meta.identified=!!meta.title && !!(meta.authors||meta.doi);
  meta.warnings.push('主题和重点刊会标记是建议；通讯作者、共同一作、奖项无法仅凭普通元数据可靠判断，请复核。');
  if(!meta.identified)meta.warnings.push('未能可靠识别论文，未生成或保存论文记录。请换 DOI 链接重试。');
  return meta;
}
module.exports={resolveMetadata,requestText,inputUrl,identityUrl,doiFrom,ieeeNumber,parseHtml,crossref,openalex,publicAddress};
