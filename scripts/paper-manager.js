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

/** 扫描 papers/ 目录, 返回未被 JSON 引用的 PDF (新论文) */
function scanUnreferencedPdfs() {
  const referenced = new Set();
  const papers = readAllPapers();
  papers.forEach(p => { if (p.pdf) referenced.add(p.pdf); });

  if (!fs.existsSync(PAPERS_DIR)) return [];
  return fs.readdirSync(PAPERS_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .filter(f => !referenced.has('papers/' + f))
    .map(f => ({ filename: f, path: 'papers/' + f }));
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
