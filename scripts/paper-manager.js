#!/usr/bin/env node
/**
 * paper-manager.js — 论文可视化管理面板的本地服务器
 *
 * 用法:
 *   node scripts/paper-manager.js            默认端口 8002
 *   node scripts/paper-manager.js --port 9000  指定端口
 *
 * 启动后浏览器访问 http://localhost:8002 即可:
 *   - 浏览所有论文 (按年份/类型/主题筛选)
 *   - 编辑任意字段, 点保存直接写回 JSON 文件
 *   - 新增论文 (含 PDF 重命名)
 *   - 标记缺失字段 (缺 URL/PDF/摘要的论文高亮提示)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAPERS_DIR = path.join(ROOT, 'papers');
const PUB_CONFIG = path.join(ROOT, 'data', 'publications.json');
const PUB_DIR = path.join(ROOT, 'data', 'publications');
const HTML_FILE = path.join(__dirname, 'paper-manager.html');

// 解析端口
const args = process.argv.slice(2);
let PORT = 8002;
const portIdx = args.indexOf('--port');
if (portIdx >= 0 && args[portIdx + 1]) PORT = parseInt(args[portIdx + 1], 10) || 8002;


// ═══════════════════════════════════════════════
//  数据读写
// ═══════════════════════════════════════════════

/** 读取 publications.json 配置 */
function readConfig() {
  return JSON.parse(fs.readFileSync(PUB_CONFIG, 'utf8'));
}

/** 读取所有年份的论文, 合并成统一结构
 *  返回: [{ id, year, type, section, groupYear, index, ...fields }]
 *  id 格式: "2026/journal/0" 用于唯一定位一篇论文
 */
function readAllPapers() {
  const config = readConfig();
  const papers = [];
  for (const f of config.yearlyFiles) {
    const fp = path.join(ROOT, f.file);
    if (!fs.existsSync(fp)) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { continue; }

    for (const section of ['journals', 'conferences']) {
      if (!data[section]) continue;
      for (const group of data[section]) {
        if (!group.items) continue;
        group.items.forEach((item, idx) => {
          papers.push({
            id: `${f.year}/${section}/${idx}`,
            year: f.year,
            fileYear: f.year,   // 所属文件年份
            section,            // journals | conferences
            groupYear: group.year,
            index: idx,
            file: f.file,
            ...item,
          });
        });
      }
    }
  }
  return papers;
}

/** 根据 id 更新一篇论文
 *  payload: { id, authors, title, venue, venueHighlight, url, pdf, topics, abstract }
 */
function updatePaper(payload) {
  const [fileYear, section, idxStr] = payload.id.split('/');
  const idx = parseInt(idxStr, 10);
  const yearFile = path.join(ROOT, findFileByYear(fileYear));
  if (!fs.existsSync(yearFile)) return { ok: false, error: '年份文件不存在: ' + yearFile };

  const data = JSON.parse(fs.readFileSync(yearFile, 'utf8'));
  if (!data[section]) return { ok: false, error: '无效的 section: ' + section };

  const group = data[section].find(g => g.year === payload.groupYear);
  if (!group) return { ok: false, error: '找不到年份分组: ' + payload.groupYear };
  if (!group.items || idx >= group.items.length) return { ok: false, error: '索引越界' };

  // 更新字段 (保留原有字段, 只覆盖提交的)
  const old = group.items[idx];
  group.items[idx] = {
    authors: payload.authors ?? old.authors,
    title: payload.title ?? old.title,
    venue: payload.venue ?? old.venue,
    venueHighlight: payload.venueHighlight ?? old.venueHighlight ?? false,
    url: payload.url ?? old.url ?? '',
    pdf: payload.pdf ?? old.pdf ?? '',
    topics: payload.topics ?? old.topics ?? [],
  };
  // abstract 可选
  if (payload.abstract !== undefined) {
    if (payload.abstract && payload.abstract.trim()) {
      group.items[idx].abstract = payload.abstract.trim();
    } else {
      delete group.items[idx].abstract;
    }
  }

  fs.writeFileSync(yearFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return { ok: true, paper: group.items[idx] };
}

/** 根据 id 删除一篇论文 */
function deletePaper(id) {
  const [fileYear, section, idxStr] = id.split('/');
  const idx = parseInt(idxStr, 10);
  const yearFile = path.join(ROOT, findFileByYear(fileYear));
  if (!fs.existsSync(yearFile)) return { ok: false, error: '年份文件不存在' };

  const data = JSON.parse(fs.readFileSync(yearFile, 'utf8'));
  if (!data[section]) return { ok: false, error: '无效的 section' };

  for (const group of data[section]) {
    if (group.items && idx < group.items.length) {
      const removed = group.items.splice(idx, 1)[0];
      fs.writeFileSync(yearFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
      return { ok: true, removed };
    }
  }
  return { ok: false, error: '未找到对应论文' };
}

/** 创建一篇新论文
 *  payload: { year, section, authors, title, venue, venueHighlight, url, pdf, topics, abstract }
 *  year: 论文实际发表年份 (数字)
 *  section: 'journals' | 'conferences'
 */
function createPaper(payload) {
  const config = readConfig();

  // 根据 year 找到合适的文件 (精确匹配 > 最早年份文件兜底)
  let targetFileEntry = null;
  for (const f of config.yearlyFiles) {
    if (typeof f.year === 'number' && f.year === payload.year) {
      targetFileEntry = f;
      break;
    }
  }
  // 如果没精确匹配, 找最早的数字年份文件 (year < 最小数字年份则归入 early)
  if (!targetFileEntry) {
    const numericFiles = config.yearlyFiles.filter(f => typeof f.year === 'number');
    const minYear = Math.min(...numericFiles.map(f => f.year));
    if (payload.year < minYear) {
      targetFileEntry = config.yearlyFiles.find(f => typeof f.year !== 'number');
    } else {
      // 年份超出范围, 用最近的文件
      targetFileEntry = config.yearlyFiles[0];
    }
  }
  if (!targetFileEntry) return { ok: false, error: '找不到合适的年份文件' };

  const yearFile = path.join(ROOT, targetFileEntry.file);
  if (!fs.existsSync(yearFile)) return { ok: false, error: '年份文件不存在: ' + targetFileEntry.file };

  const data = JSON.parse(fs.readFileSync(yearFile, 'utf8'));
  if (!data[payload.section]) data[payload.section] = [];

  // 找到年份匹配的 group, 或创建新的
  let group = data[payload.section].find(g => g.year === payload.year);
  if (!group) {
    group = { year: payload.year, items: [] };
    // 按年份降序插入 (最新在前)
    let insertIdx = 0;
    for (let i = 0; i < data[payload.section].length; i++) {
      if (typeof data[payload.section][i].year === 'number' && data[payload.section][i].year > payload.year) {
        insertIdx = i + 1;
      }
    }
    data[payload.section].splice(insertIdx, 0, group);
  }
  if (!group.items) group.items = [];

  // 构建新论文对象
  const newPaper = {
    authors: payload.authors || '',
    title: payload.title || '',
    venue: payload.venue || '',
    venueHighlight: payload.venueHighlight || false,
    url: payload.url || '',
    pdf: payload.pdf || '',
    topics: payload.topics || [],
  };
  if (payload.abstract && payload.abstract.trim()) {
    newPaper.abstract = payload.abstract.trim();
  }

  group.items.push(newPaper);
  fs.writeFileSync(yearFile, JSON.stringify(data, null, 2) + '\n', 'utf8');

  // 返回新论文的 id
  const newIdx = group.items.length - 1;
  const newId = `${targetFileEntry.year}/${payload.section}/${newIdx}`;
  return { ok: true, paper: newPaper, id: newId, file: targetFileEntry.file };
}

/** 根据 fileYear (可能是 "2020 and earlier") 查找文件路径 */
function findFileByYear(fileYear) {
  const config = readConfig();
  const found = config.yearlyFiles.find(f => String(f.year) === String(fileYear));
  return found ? found.file : null;
}

/** 重命名 PDF 文件并返回新路径 */
function renamePdf(oldRelPath, newFilename) {
  const oldAbs = path.join(ROOT, oldRelPath);
  let finalFilename = newFilename;
  let finalAbs = path.join(PAPERS_DIR, newFilename);

  if (path.normalize(oldAbs) === path.normalize(finalAbs)) {
    return { ok: true, renamed: false, newPdfRelPath: oldRelPath };
  }
  // 冲突加序号
  if (fs.existsSync(finalAbs)) {
    const ext = path.extname(newFilename);
    const base = path.basename(newFilename, ext);
    let i = 2;
    while (fs.existsSync(path.join(PAPERS_DIR, `${base}_${i}${ext}`))) i++;
    finalFilename = `${base}_${i}${ext}`;
    finalAbs = path.join(PAPERS_DIR, finalFilename);
  }
  if (!fs.existsSync(oldAbs)) return { ok: false, error: '源 PDF 不存在: ' + oldRelPath };
  fs.renameSync(oldAbs, finalAbs);
  return { ok: true, renamed: true, newPdfRelPath: 'papers/' + finalFilename, newFilename: finalFilename };
}

/** 扫描 papers/ 目录, 返回未被 JSON 引用的 PDF
 *  对每个未引用 PDF 做标题模糊匹配, 标注可能对应的已有论文
 */
function scanUnreferencedPdfs() {
  const referenced = new Set();
  const papers = readAllPapers();
  papers.forEach(p => { if (p.pdf) referenced.add(p.pdf); });

  if (!fs.existsSync(PAPERS_DIR)) return [];
  const unref = fs.readdirSync(PAPERS_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .filter(f => !referenced.has('papers/' + f))
    .map(f => ({ filename: f, path: 'papers/' + f }));

  // 对每个未引用 PDF, 尝试和已有论文标题匹配
  for (const pdf of unref) {
    pdf.possibleMatch = findPossibleMatch(pdf.filename, papers);
  }
  return unref;
}

/** 从 PDF 文件名提取标题, 和论文标题做模糊匹配
 *  返回 { paperId, title, score } 或 null
 */
function findPossibleMatch(filename, papers) {
  // 从文件名提取标题: 去掉 "年份_VENUE_" 前缀, 去掉扩展名
  const base = filename.replace(/\.pdf$/i, '');
  let titlePart = base.replace(/^\d{4}_[^_]+_/, '').replace(/_/g, ' ');
  // 去掉前导编号如 "7.3 "
  titlePart = titlePart.replace(/^[\d.]+\s+/, '').trim().toLowerCase();
  if (!titlePart || titlePart.length < 5) return null;

  const words1 = new Set(titlePart.split(/\s+/).filter(w => w.length > 2));

  let bestMatch = null, bestScore = 0;
  for (const p of papers) {
    const pTitle = (p.title || '').toLowerCase();
    if (!pTitle) continue;
    const words2 = new Set(pTitle.split(/\s+/).filter(w => w.length > 2));
    if (words2.size === 0) continue;
    let common = 0;
    for (const w of words1) if (words2.has(w)) common++;
    const score = common / Math.max(words1.size, words2.size);
    if (score > bestScore) { bestScore = score; bestMatch = p; }
  }

  // 阈值 0.4 以上认为可能匹配
  if (bestMatch && bestScore >= 0.4) {
    return {
      paperId: bestMatch.id,
      title: bestMatch.title,
      score: Math.round(bestScore * 100),
    };
  }
  return null;
}

/** 列出 papers/ 目录所有 PDF (供关联选择), 标注是否已被引用 */
function listAllPdfs() {
  const referenced = new Set();
  const papers = readAllPapers();
  papers.forEach(p => { if (p.pdf) referenced.add(p.pdf); });

  if (!fs.existsSync(PAPERS_DIR)) return [];
  return fs.readdirSync(PAPERS_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => ({
      filename: f,
      path: 'papers/' + f,
      referenced: referenced.has('papers/' + f),
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

/** 从 URL 抓取论文元数据
 *  策略: 1) 先从 URL/页面提取 DOI → Crossref API (最可靠, 返回完整 JSON)
 *        2) fallback 到 HTML 页面抓取 (JSON-LD / meta tags)
 */
async function fetchUrlMetadata(url) {
  // ── 步骤 1: 先尝试从 URL 提取 DOI, 调用 Crossref API ──
  const doiFromUrl = extractDoiFromUrl(url);
  if (doiFromUrl) {
    try {
      const crossref = await fetchCrossrefByDoi(doiFromUrl);
      if (crossref) {
        crossref.source = 'Crossref API';
        crossref.url = url;
        return crossref;
      }
    } catch (e) { /* Crossref 失败, 继续走 HTML 抓取 */ }
  }

  // ── 步骤 2: HTML 抓取 (同时从页面里再找 DOI 调 Crossref) ──
  const html = await fetchHtml(url);
  const htmlMeta = parseMetadataFromHtml(html, url);

  // 如果 HTML 抓取拿到了 DOI, 且 Crossref 还没试过, 再试一次 Crossref
  const doi = htmlMeta.doi || doiFromUrl;
  if (doi && (!doiFromUrl || doi !== doiFromUrl)) {
    try {
      const crossref = await fetchCrossrefByDoi(doi);
      if (crossref) {
        // Crossref 数据更权威, 但保留 HTML 抓取的 url
        crossref.source = 'Crossref API (via HTML DOI)';
        crossref.url = url;
        // 只用 Crossref 覆盖 HTML 里空的字段 (HTML 的 url 已设)
        return mergeMetadata(htmlMeta, crossref);
      }
    } catch (e) { /* 忽略, 用 HTML 结果 */ }
  }

  return htmlMeta;
}

/** 从 URL 中提取 DOI (支持 doi.org 链接和 URL 内嵌的 DOI) */
function extractDoiFromUrl(url) {
  // doi.org/10.xxxx/xxxx
  let m = url.match(/doi\.org\/(10\.\d{4,}\/[^\s;&'"#?]+)/i);
  if (m) return decodeURIComponent(m[1].replace(/[.,;]$/, ''));
  // URL 中直接包含 DOI
  m = url.match(/(10\.\d{4,}\/[^\s;&'"#?]+)/);
  if (m) return decodeURIComponent(m[1].replace(/[.,;]$/, ''));
  return null;
}

/** 调用 Crossref API 获取论文元数据 (返回 JSON, 不受反爬影响) */
function fetchCrossrefByDoi(doi) {
  const https = require('https');
  const apiUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;

  return new Promise((resolve, reject) => {
    const req = https.get(apiUrl, {
      headers: {
        'User-Agent': 'PaperManager/1.0 (mailto:researcher@example.com)',
        'Accept': 'application/json',
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode === 404) {
        res.resume();
        return resolve(null);  // DOI 在 Crossref 中不存在, 返回 null (不是错误)
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('Crossref HTTP ' + res.statusCode));
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const msg = data.message;
          if (!msg) return resolve(null);
          resolve(parseCrossrefMessage(msg, doi));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Crossref 请求超时')); });
  });
}

/** 解析 Crossref message 为统一元数据结构 */
function parseCrossrefMessage(msg, doi) {
  const result = {
    title: '', authors: '', abstract: '', venue: '',
    year: null, doi: doi || msg.DOI || '', url: '', source: '',
  };

  // 标题 (Crossref title 是数组)
  if (Array.isArray(msg.title) && msg.title.length > 0) {
    result.title = cleanText(msg.title[0]);
  }

  // 作者 — 转为缩写格式: "Jie Yang" → "J. Yang"
  if (Array.isArray(msg.author) && msg.author.length > 0) {
    const names = msg.author.map(a => {
      if (a.name) return a.name;  // 组织作者, 保持原样
      if (!a.family) return a.given || '';
      // given 可能是 "Jie" 或 "Jie Wei", 取每个 given name 的首字母
      const initials = (a.given || '')
        .split(/\s+/)
        .filter(Boolean)
        .map(n => n.charAt(0).toUpperCase() + '.')
        .join(' ');
      return (initials + ' ' + a.family).trim();
    }).filter(Boolean);
    if (names.length > 0) result.authors = names.join(', ');
  }

  // 摘要 (Crossref 的 abstract 常带 <jats:p> 标签, 需清理)
  if (msg.abstract) {
    result.abstract = cleanText(msg.abstract);
  }

  // venue: container-title (期刊/会议名)
  if (Array.isArray(msg['container-title']) && msg['container-title'].length > 0) {
    result.venue = cleanText(msg['container-title'][0]);
  }

  // 年份: 优先 published-print > published-online > published > issued
  const dateFields = ['published-print', 'published-online', 'published', 'issued'];
  for (const f of dateFields) {
    if (msg[f] && msg[f]['date-parts'] && msg[f]['date-parts'][0]) {
      const year = msg[f]['date-parts'][0][0];
      if (year) { result.year = year; break; }
    }
  }

  // URL
  if (msg.URL) result.url = msg.URL;

  return result;
}

/** 合并两份元数据: base 优先, 用 overlay 填充 base 中空的字段 */
function mergeMetadata(base, overlay) {
  return {
    title: base.title || overlay.title || '',
    authors: base.authors || overlay.authors || '',
    abstract: base.abstract || overlay.abstract || '',
    venue: base.venue || overlay.venue || '',
    year: base.year || overlay.year || null,
    doi: base.doi || overlay.doi || '',
    url: base.url || overlay.url || '',
    source: base.source + ' + ' + overlay.source,
  };
}

/** 抓取 URL 的 HTML 内容 (跟随重定向) */
function fetchHtml(url) {
  const https = require('https');
  const http = require('http');
  const client = url.startsWith('https') ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(fetchHtml(newUrl));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
  });
}

/** 从 HTML 解析论文元数据 */
function parseMetadataFromHtml(html, sourceUrl) {
  const result = {
    title: '', authors: '', abstract: '', venue: '',
    year: null, doi: '', url: sourceUrl, source: '',
  };

  // ── 1. JSON-LD (最可靠, 学术网站普遍支持) ──
  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const match of jsonLdMatches) {
    try {
      const jsonStr = match.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
      const data = JSON.parse(jsonStr);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'ScholarlyArticle' || item['@type'] === 'Article' ||
            item['@type'] === 'ResearchArticle' || item['headline']) {
          if (item['headline'] && !result.title) result.title = cleanText(item['headline']);
          if (item['description'] && !result.abstract) result.abstract = cleanText(item['description']);
          if (item['datePublished'] && !result.year) {
            const yearMatch = String(item['datePublished']).match(/(\d{4})/);
            if (yearMatch) result.year = parseInt(yearMatch[1], 10);
          }
          if (item['isPartOf'] && item['isPartOf']['name'] && !result.venue) {
            result.venue = cleanText(item['isPartOf']['name']);
          }
          if (item['author']) {
            const authors = Array.isArray(item['author']) ? item['author'] : [item['author']];
            const names = authors.map(a => typeof a === 'string' ? a : (a.name || a.givenName + ' ' + a.familyName)).filter(Boolean);
            if (names.length > 0 && !result.authors) result.authors = names.join(', ');
          }
          if (item['identifier'] && Array.isArray(item['identifier'])) {
            const doi = item['identifier'].find(id => id.propertyID && id.propertyID.includes('doi'));
            if (doi && !result.doi) result.doi = doi.value;
          }
          result.source = 'JSON-LD';
        }
      }
    } catch (e) { /* 忽略解析错误 */ }
  }

  // ── 2. og: / meta 标签 (fallback) ──
  function getMeta(property) {
    const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
    const match = html.match(regex);
    return match ? cleanText(match[1]) : '';
  }

  if (!result.title) result.title = getMeta('og:title') || getMeta('dc.Title') || getMeta('citation_title');
  if (!result.abstract) result.abstract = getMeta('og:description') || getMeta('dc.Description') || getMeta('citation_abstract') || getMeta('description');
  if (!result.venue) result.venue = getMeta('citation_journal_title') || getMeta('citation_conference_title') || getMeta('prism.publicationName');
  if (!result.doi) result.doi = getMeta('citation_doi') || getMeta('dc.Identifier') || getMeta('prism.doi');

  // citation_author (多个 meta 标签)
  if (!result.authors) {
    const authorMatches = html.match(/<meta[^>]*name=["']citation_author["'][^>]*content=["']([^"']*)["']/gi) || [];
    if (authorMatches.length > 0) {
      const authors = authorMatches.map(m => {
        const contentMatch = m.match(/content=["']([^"']*)["']/i);
        return contentMatch ? cleanText(contentMatch[1]) : '';
      }).filter(Boolean);
      if (authors.length > 0) result.authors = authors.join(', ');
    }
  }

  // citation_publication_date
  if (!result.year) {
    const dateStr = getMeta('citation_publication_date') || getMeta('prism.publicationDate') || getMeta('dc.Date');
    if (dateStr) {
      const yearMatch = dateStr.match(/(\d{4})/);
      if (yearMatch) result.year = parseInt(yearMatch[1], 10);
    }
  }

  // ── 3. DOI 从 URL 提取 ──
  if (!result.doi) {
    const doiMatch = sourceUrl.match(/10\.\d{4,}\/[^\s;&'"#]+/);
    if (doiMatch) result.doi = doiMatch[0].replace(/[.,;]$/, '');
  }

  if (!result.source) result.source = 'meta tags';
  result.title = result.title.substring(0, 500);
  result.abstract = result.abstract.substring(0, 5000);

  return result;
}

/** 清理 HTML 实体和多余空白 */
function cleanText(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}


// ═══════════════════════════════════════════════
//  HTTP 服务
// ═══════════════════════════════════════════════

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS (允许本地任意端口访问)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    // ── API 路由 ──

    // 获取所有论文
    if (pathname === '/api/papers' && method === 'GET') {
      const papers = readAllPapers();
      const config = readConfig();
      return sendJson(res, 200, {
        papers,
        filterTopics: config.filterTopics,
        yearlyFiles: config.yearlyFiles,
        unreferencedPdfs: scanUnreferencedPdfs(),
      });
    }

    // 更新论文
    if (pathname === '/api/paper' && method === 'POST') {
      const body = await readBody(req);
      const result = updatePaper(body);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    // 创建新论文
    if (pathname === '/api/paper/create' && method === 'POST') {
      const body = await readBody(req);
      const result = createPaper(body);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    // 删除论文
    if (pathname.startsWith('/api/paper/') && method === 'DELETE') {
      const id = decodeURIComponent(pathname.slice('/api/paper/'.length));
      const result = deletePaper(id);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    // 重命名 PDF
    if (pathname === '/api/rename-pdf' && method === 'POST') {
      const body = await readBody(req);
      const result = renamePdf(body.oldRelPath, body.newFilename);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    // 从 URL 抓取论文元数据
    if (pathname === '/api/fetch-url' && method === 'POST') {
      const body = await readBody(req);
      if (!body.url) return sendJson(res, 400, { ok: false, error: '缺少 url 参数' });
      try {
        const metadata = await fetchUrlMetadata(body.url);
        return sendJson(res, 200, { ok: true, metadata });
      } catch (err) {
        return sendJson(res, 200, { ok: false, error: err.message });
      }
    }

    // 列出 papers/ 目录所有 PDF (供关联选择)
    if (pathname === '/api/list-pdfs' && method === 'GET') {
      return sendJson(res, 200, { ok: true, pdfs: listAllPdfs() });
    }

    // 从 PDF 提取信息 (复用 add-paper.js)
    if (pathname === '/api/extract-pdf' && method === 'POST') {
      const body = await readBody(req);
      if (!body.pdfPath) return sendJson(res, 400, { ok: false, error: '缺少 pdfPath 参数' });
      try {
        // 复用 add-paper.js 的提取逻辑
        const addPaper = require('./add-paper.js');
        const pdfAbsPath = path.join(ROOT, body.pdfPath);
        if (!fs.existsSync(pdfAbsPath)) return sendJson(res, 404, { ok: false, error: 'PDF 不存在' });
        const info = await addPaper.extractPdfInfo(pdfAbsPath);
        // 同时解析文件名
        const fnInfo = addPaper.parseFilename(path.basename(body.pdfPath));
        return sendJson(res, 200, {
          ok: true,
          extracted: info,
          filenameInfo: fnInfo,
        });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    // 访问 papers/ 下的 PDF (预览用)
    if (pathname.startsWith('/papers/') && method === 'GET') {
      const pdfPath = path.join(ROOT, decodeURIComponent(pathname));
      if (!fs.existsSync(pdfPath)) return sendJson(res, 404, { error: 'PDF 不存在' });
      const stat = fs.statSync(pdfPath);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': stat.size,
        'Content-Disposition': 'inline; filename="' + path.basename(pdfPath) + '"',
      });
      fs.createReadStream(pdfPath).pipe(res);
      return;
    }

    // ── 静态文件: 主页面 ──
    if (pathname === '/' || pathname === '/index.html') {
      const html = fs.readFileSync(HTML_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    sendJson(res, 404, { error: 'Not Found: ' + pathname });
  } catch (err) {
    console.error('服务器错误:', err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════');
  console.log('  论文管理面板已启动');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('  浏览器访问:  http://localhost:' + PORT);
  console.log('');
  console.log('  数据目录:    ' + path.relative(ROOT, PUB_DIR));
  console.log('  PDF 目录:    papers/');
  console.log('');
  console.log('  按 Ctrl+C 停止服务');
  console.log('═══════════════════════════════════════════');
});
