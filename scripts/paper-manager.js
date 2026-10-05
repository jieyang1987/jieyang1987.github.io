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
const urlMetadata = require('./paper-manager/metadata.js');
const { createChromeBridge } = require('./paper-manager/chrome-bridge.js');
const { handleChromeHttp, readJson: readSmallJson } = require('./paper-manager/chrome-http.js');
const { createScholarWatcher } = require('./paper-manager/scholar-watch.js');

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
  // 作者字段: 自动重新格式化 (缩写 + 姓名顺序 + J.Yang 加粗)
  let authorsValue = payload.authors ?? old.authors;
  if (authorsValue) authorsValue = reformatAuthorsString(authorsValue);
  group.items[idx] = {
    // Preserve stored extension fields; only allow the editable fields below from payload.
    ...old,
    authors: authorsValue,
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

/** 上移/下移论文 (在同一年份分组内交换位置)
 *  direction: 'up' | 'down'
 */
function movePaper(id, direction) {
  const [fileYear, section, idxStr] = id.split('/');
  const idx = parseInt(idxStr, 10);
  const yearFile = path.join(ROOT, findFileByYear(fileYear));
  if (!fs.existsSync(yearFile)) return { ok: false, error: '年份文件不存在' };

  const data = JSON.parse(fs.readFileSync(yearFile, 'utf8'));
  if (!data[section]) return { ok: false, error: '无效的 section' };

  // 找到包含该索引的分组
  for (const group of data[section]) {
    if (!group.items || idx >= group.items.length) continue;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= group.items.length) {
      return { ok: false, error: direction === 'up' ? '已在顶部' : '已在底部' };
    }
    // 交换
    [group.items[idx], group.items[targetIdx]] = [group.items[targetIdx], group.items[idx]];
    fs.writeFileSync(yearFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
    // 返回新的 id (索引变了)
    const newId = `${fileYear}/${section}/${targetIdx}`;
    return { ok: true, newId };
  }
  return { ok: false, error: '未找到对应论文' };
}

/** 按 DOI 或规范 URL 查重，不根据近似标题合并论文。 */
function findDuplicates(url, doi) {
  const identity = urlMetadata.identityUrl(url);
  const normalizedDoi = urlMetadata.doiFrom(doi || url);
  if (!identity && !normalizedDoi) return [];
  return readAllPapers().filter(p =>
    (identity && urlMetadata.identityUrl(p.url) === identity) ||
    (normalizedDoi && urlMetadata.doiFrom(p.doi || p.url) === normalizedDoi)
  ).map(p => ({ id: p.id, title: p.title, year: p.groupYear }));
}

function writeJsonAtomic(file, value) {
  const temporary = file + '.' + process.pid + '.tmp';
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8'); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function createPaper(payload) {
  if (!['journals', 'conferences'].includes(payload.section)) return { ok: false, error: '请选择期刊或会议类型' };
  if (!Number.isInteger(payload.year) || payload.year < 1900 || payload.year > 2100) return { ok: false, error: '请填写有效的四位发表年份' };
  for (const field of ['title', 'authors', 'venue']) {
    if (typeof payload[field] !== 'string' || !payload[field].trim()) return { ok: false, error: '必填字段缺失: ' + field };
  }
  if (payload.topics !== undefined && (!Array.isArray(payload.topics) || payload.topics.some(t => typeof t !== 'string'))) return { ok: false, error: '主题格式错误' };
  if (payload.abstract !== undefined && typeof payload.abstract !== 'string') return { ok: false, error: '摘要必须为文本' };
  if (payload.url) { try { urlMetadata.inputUrl(payload.url); } catch (e) { return { ok: false, error: e.message }; } }
  const duplicates = findDuplicates(payload.url, payload.doi);
  if (duplicates.length) return { ok: false, error: '这篇论文已在网站数据中，请编辑已有条目', duplicates };
  const config = readConfig();
  let targetFileEntry = config.yearlyFiles.find(f => f.year === payload.year);
  const needsRegistration = !targetFileEntry;
  if (!targetFileEntry) targetFileEntry = { year: payload.year, file: 'data/publications/' + payload.year + '.json' };
  const yearFile = path.join(ROOT, targetFileEntry.file);
  const existed = fs.existsSync(yearFile);
  const previousData = existed ? fs.readFileSync(yearFile, 'utf8') : null;
  const data = existed ? JSON.parse(previousData) : { journals: [], conferences: [] };
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
    authors: reformatAuthorsString(payload.authors || ''),
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

  if (payload.doi) newPaper.doi = urlMetadata.doiFrom(payload.doi);
  group.items.push(newPaper);
  writeJsonAtomic(yearFile, data);
  if (needsRegistration) {
    config.yearlyFiles.push(targetFileEntry);
    config.yearlyFiles.sort((a, b) => (typeof b.year === 'number' ? b.year : 0) - (typeof a.year === 'number' ? a.year : 0));
    try { writeJsonAtomic(PUB_CONFIG, config); }
    catch (error) { if (!existed) fs.unlinkSync(yearFile); else writeJsonAtomic(yearFile, JSON.parse(previousData)); throw error; }
  }

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

/** 生成批量重命名预览计划
 *  对每篇关联了 PDF 的论文按规范格式 {year}_{venue}_{title}.pdf 计算目标文件名
 *  venue 缩写: 优先从 venue 全称反查 VENUE_MAP, 查不到则沿用旧文件名中的 venue 段
 *  返回 [{ id, title, oldFilename, newFilename, changed, missing, note }]
 */
function buildRenamePlan() {
  const addPaper = require('./add-paper.js');
  const papers = readAllPapers().filter(p => p.pdf && p.pdf.startsWith('papers/'));
  const plan = [];
  const usedTargets = new Map(); // 小写文件名 → 论文 id (检测批内目标重名)

  for (const p of papers) {
    const oldFilename = path.basename(p.pdf);
    const oldAbs = path.join(ROOT, p.pdf);
    const notes = [];
    const fn = addPaper.parseFilename(oldFilename);

    // 年份: 优先条目自身 year, 其次旧文件名年份 (early.json 条目无 year 字段),
    // 与分组年份不一致时标注供复核
    let year = (typeof p.year === 'number' && p.year) || null;
    if (!year && fn.year) {
      year = fn.year;
      if (typeof p.groupYear === 'number' && p.groupYear !== fn.year) {
        notes.push(`年份取自旧文件名 ${fn.year} (分组年份为 ${p.groupYear})`);
      }
    }
    if (!year) year = typeof p.groupYear === 'number' ? p.groupYear : 'paper';
    // 数据年份与旧文件名年份不一致 → 标注供复核
    if (fn.year && typeof year === 'number' && fn.year !== year &&
        !notes.some(n => n.startsWith('年份取自'))) {
      notes.push(`数据年份 ${year} 与文件名年份 ${fn.year} 不一致`);
    }

    let venueAbbrev = addPaper.findVenueAbbrev(p.venue);
    if (!venueAbbrev) {
      venueAbbrev = fn.venueAbbrev || 'paper';
      notes.push(fn.venueAbbrev ? 'venue 未收录, 沿用旧文件名片段' : 'venue 无法识别');
    }

    if (!p.title) {
      plan.push({ id: p.id, title: '', oldFilename, newFilename: oldFilename,
        changed: false, missing: !fs.existsSync(oldAbs), note: '缺标题, 跳过' });
      continue;
    }

    let newFilename = addPaper.buildCanonicalFilename(year, venueAbbrev, p.title);

    // 批内目标重名 → 自动加序号
    const key = newFilename.toLowerCase();
    if (usedTargets.has(key) && usedTargets.get(key) !== p.id) {
      const ext = path.extname(newFilename);
      const base = path.basename(newFilename, ext);
      let i = 2;
      while (usedTargets.has(`${base}_${i}${ext}`.toLowerCase())) i++;
      newFilename = `${base}_${i}${ext}`;
      notes.push('同名冲突, 自动加序号');
    }
    usedTargets.set(newFilename.toLowerCase(), p.id);

    // 目标已被盘上的批外文件占用 (大小写不敏感比较, Windows 文件系统不区分大小写,
    // 仅大小写不同的改名如 Front-End → Front-end 不算占用)
    const targetAbs = path.join(PAPERS_DIR, newFilename);
    const isSelf = targetAbs.toLowerCase() === oldAbs.toLowerCase();
    if (!isSelf && fs.existsSync(targetAbs) &&
        !papers.some(q => q.id !== p.id && path.basename(q.pdf).toLowerCase() === newFilename.toLowerCase())) {
      notes.push('⚠ 目标文件名已被未关联文件占用');
    }

    plan.push({
      id: p.id, title: p.title, oldFilename, newFilename,
      changed: oldFilename !== newFilename,
      missing: !fs.existsSync(oldAbs),
      note: notes.join('; '),
    });
  }
  return plan;
}

/** 只更新 JSON 中论文的 pdf 字段 (不动其他字段, 避免覆盖式更新丢字段) */
function updatePdfField(paper, newRelPath) {
  const yearFile = path.join(ROOT, paper.file);
  if (!fs.existsSync(yearFile)) return false;
  const data = JSON.parse(fs.readFileSync(yearFile, 'utf8'));
  const groups = data[paper.section] || [];
  const group = groups.find(g => g.year === paper.groupYear);
  if (!group || !group.items || !group.items[paper.index]) return false;
  group.items[paper.index].pdf = newRelPath;
  fs.writeFileSync(yearFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return true;
}

/** 执行批量重命名 (用户复核后的清单)
 *  items: [{ id, newFilename }]
 *  两阶段重命名 (先全部改为临时名, 再改为目标名), 避免 A→B / B→C 顺序冲突
 *  返回 { ok, results: [{ id, ok, oldFilename, newFilename, error? }] }
 */
function applyRenameBatch(items) {
  const papers = readAllPapers();
  const byId = new Map(papers.map(p => [p.id, p]));
  const results = [];
  const jobs = [];

  // ── 校验阶段 ──
  for (const it of items || []) {
    const p = byId.get(it.id);
    if (!p || !p.pdf) { results.push({ id: it.id, ok: false, error: '论文不存在或未关联 PDF' }); continue; }
    const newFilename = path.basename(String(it.newFilename || '').trim());
    if (!/\.pdf$/i.test(newFilename) || /[\\/:*?"<>|]/.test(newFilename)) {
      results.push({ id: it.id, ok: false, error: '文件名非法: ' + it.newFilename }); continue;
    }
    const oldFilename = path.basename(p.pdf);
    if (oldFilename === newFilename) { results.push({ id: it.id, ok: true, skipped: true, oldFilename, newFilename }); continue; }
    if (!fs.existsSync(path.join(ROOT, p.pdf))) {
      results.push({ id: it.id, ok: false, oldFilename, error: '源文件不存在' }); continue;
    }
    jobs.push({ p, oldFilename, newFilename });
  }

  // 批内目标重名检查
  const seenTargets = new Set();
  for (const j of jobs) {
    const k = j.newFilename.toLowerCase();
    if (seenTargets.has(k)) j.error = '批量内目标重名';
    seenTargets.add(k);
  }
  // 目标与批外文件冲突检查
  const batchOldKeys = new Set(jobs.map(j => j.oldFilename.toLowerCase()));
  for (const j of jobs) {
    if (j.error) continue;
    const targetAbs = path.join(PAPERS_DIR, j.newFilename);
    if (fs.existsSync(targetAbs) &&
        j.newFilename.toLowerCase() !== j.oldFilename.toLowerCase() &&
        !batchOldKeys.has(j.newFilename.toLowerCase())) {
      j.error = '目标文件已存在 (批外文件)';
    }
  }

  // ── 执行阶段: 两阶段重命名 ──
  const runnable = jobs.filter(j => !j.error);
  const failed = jobs.filter(j => j.error);
  for (const j of failed) results.push({ id: j.p.id, ok: false, oldFilename: j.oldFilename, newFilename: j.newFilename, error: j.error });

  const renamed = [];
  // 阶段 1: 全部改为临时名
  for (let i = 0; i < runnable.length; i++) {
    const j = runnable[i];
    const tmpName = `.rename_tmp_${Date.now()}_${i}.pdf`;
    try {
      fs.renameSync(path.join(PAPERS_DIR, j.oldFilename), path.join(PAPERS_DIR, tmpName));
      renamed.push({ j, tmpName });
    } catch (e) {
      results.push({ id: j.p.id, ok: false, oldFilename: j.oldFilename, error: '重命名失败: ' + e.message });
    }
  }
  // 阶段 2: 临时名改为目标名 + 更新 JSON
  for (const { j, tmpName } of renamed) {
    try {
      fs.renameSync(path.join(PAPERS_DIR, tmpName), path.join(PAPERS_DIR, j.newFilename));
      const jsonOk = updatePdfField(j.p, 'papers/' + j.newFilename);
      results.push({ id: j.p.id, ok: true, oldFilename: j.oldFilename, newFilename: j.newFilename,
        ...(jsonOk ? {} : { warning: '文件已重命名但 JSON 更新失败' }) });
    } catch (e) {
      // 目标名失败 → 尽量恢复原名
      try { fs.renameSync(path.join(PAPERS_DIR, tmpName), path.join(PAPERS_DIR, j.oldFilename)); } catch (_) {}
      results.push({ id: j.p.id, ok: false, oldFilename: j.oldFilename, error: '重命名为目标名失败: ' + e.message });
    }
  }

  const okCount = results.filter(r => r.ok && !r.skipped).length;
  const failCount = results.filter(r => !r.ok).length;
  return { ok: failCount === 0, renamed: okCount, failed: failCount, results };
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
  return urlMetadata.resolveMetadata(url);
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

/** 修正姓名顺序, 统一为 "Given Family" (名 姓) 西方顺序
 *  处理三种输入:
 *  1) "Family, Given" (逗号格式, 如 arxiv citation_author "Shao, Kunming") → "Kunming Shao"
 *  2) "Yang Jie" (中文姓在前) → "Jie Yang"  (仅当首词是常见姓氏且次词不是)
 *  3) "Jie Yang" (已是西方顺序) → 不变
 */
function normalizeNameOrder(name) {
  let n = name.trim();
  // 1) 逗号格式 "Family, Given" → "Given Family"
  //    (单个作者名内的逗号一定是 "姓, 名" 格式, 如 arxiv "Shao, Kunming")
  if (n.includes(',')) {
    const commaParts = n.split(',').map(s => s.trim()).filter(Boolean);
    if (commaParts.length === 2) {
      n = commaParts[1] + ' ' + commaParts[0];
    }
  }
  const parts = n.trim().split(/\s+/);
  if (parts.length < 2) return n;
  // 常见中文姓氏 (拼音), 不区分大小写
  // 注: xiao/ming 等更多用作名字的词已移除, 避免误判
  const surnames = new Set([
    'yang','wang','li','zhang','liu','chen','wu','zhao','huang','zhou','xu','sun',
    'hu','zhu','gao','lin','he','guo','ma','luo','song','shen','zheng','liang',
    'xie','han','tang','feng','deng','cao','peng','zeng','tian','dong',
    'yuan','pan','yu','jiang','cai','du','ye','cheng','su','wei','lu','ding',
    'ren','yao','cui','zhong','tan','fang','shi','fu','zou','wen','hou',
    'bai','qiu','qin','gu','zhan','yan','mo','cui','dai','xia',
  ]);
  // 2) 首词是姓氏 且 次词不是姓氏 → 姓在前, 翻转
  //    (两个都是姓氏时无法判断, 默认 "名 姓" 不翻转, 如 "Wei Zou")
  if (surnames.has(parts[0].toLowerCase()) && !surnames.has(parts[1].toLowerCase())) {
    const family = parts[0];
    const givenParts = parts.slice(1);
    return givenParts.join(' ') + ' ' + family;
  }
  return n;
}

/** 名字部分 → 首字母缩写, 支持连字符
 *  "Jie" → "J.", "Chi-Ying" → "C-Y.", "Kwang-Ting" → "K-T."
 */
function givenInitial(p) {
  if (p.includes('-')) {
    return p.split('-').map(seg => seg.charAt(0).toUpperCase()).join('-') + '.';
  }
  return p.charAt(0).toUpperCase() + '.';
}

/** 将逗号分隔的作者字符串重新格式化:
 *  - 去HTML标签, 保留非 J.Yang 作者的星号 (共同通讯标记)
 *  - 未缩写的全名 → normalizeNameOrder + 缩写
 *  - "Yang Jie" → "Jie Yang" → "J. Yang" → <strong>J. Yang</strong>
 *  - 已缩写的 (如 "W. Zou", "Y-H. Chen") 保持不变
 *  输入: "Yang Jie, W. Zou, <strong>J. Yang*</strong>, M. Sawan*"
 *  输出: "<strong>J. Yang*</strong>, W. Zou, M. Sawan*"
 */
function reformatAuthorsString(authorsStr) {
  if (!authorsStr || !authorsStr.trim()) return authorsStr || '';

  // 按逗号拆分
  const rawParts = authorsStr.replace(/[;；，\r\n]+|\s+and\s+|\s+&\s+/gi, ',').split(/,\s*/).map(p => p.trim()).filter(Boolean);

  // ── 检测 "Family, Given" 逗号格式 (citation_author 标签常见) ──
  // 例如: "Shao, Kunming, Tian, Fengshi, Yang, Jie"
  // 拆分后得到 ["Shao", "Kunming", "Tian", "Fengshi", "Yang", "Jie"]
  // 需要两两配对: ("Shao","Kunming") ("Tian","Fengshi") ("Yang","Jie")
  //
  // 判定条件:
  // 1) 没有任何部分是已缩写格式 (不以 "X." 或 "X-Y." 开头)
  // 2) 不是所有部分都含 2+ 单词 (排除 "Given Family, Given Family" 格式)
  // 3) 偶数下标部分都是单词 (姓氏), 奇数下标可以是多词 (名字)
  // 4) 总数 ≥ 2 且为偶数
  const cleanedForCheck = rawParts.map(p => p.replace(/<[^>]+>/g, '').replace(/\*/g, '').trim());
  const hasAbbreviated = cleanedForCheck.some(p => /^[A-Z](?:\.?-[A-Z])?\./.test(p));
  const hasChineseName = cleanedForCheck.some(p => /\p{Script=Han}/u.test(p));
  const allMultiWord = cleanedForCheck.every(p => p.split(/\s+/).length >= 2);
  const evenIndexSingleWord = cleanedForCheck.every((p, i) =>
    i % 2 === 0 ? p.split(/\s+/).length === 1 : true
  );

  let names;
  if (!hasAbbreviated && !hasChineseName && !allMultiWord && evenIndexSingleWord &&
      cleanedForCheck.length >= 2 && cleanedForCheck.length % 2 === 0) {
    // "Family, Given" 配对合并 → "Given Family"
    names = [];
    for (let i = 0; i < rawParts.length; i += 2) {
      const family = rawParts[i].replace(/<[^>]+>/g, '').replace(/\*/g, '').trim();
      const given = rawParts[i + 1].replace(/<[^>]+>/g, '').replace(/\*/g, '').trim();
      const hasStar = /\*/.test(rawParts[i] + rawParts[i + 1]);
      names.push(given + ' ' + family + (hasStar ? '*' : ''));
    }
  } else {
    names = rawParts;
  }

  const formatted = names.map(raw => {
    // 去HTML标签, 检查是否有星号
    const cleaned = raw.replace(/<[^>]+>/g, '').trim();
    const hasStar = /\*$/.test(cleaned);

    // 纯名字 (去星号)
    let name = cleaned.replace(/\*/g, '').trim();
    if (!name) return raw; // 空的保留原样

    if (name === '杨杰') return 'J. Yang' + (hasStar ? '*' : '');

    // Normalize compact initials (J.Yang, Y.H.Chen), preserving multi-part initials.
    const abbreviated = name.match(/^((?:[A-Z](?:\.?-[A-Z])?\.\s*)+)([\p{L}][\p{L}'’ -]*)$/u);
    if (abbreviated) {
      const initials = abbreviated[1].trim().replace(/\.-/g, '-').replace(/\.\s*/g, '. ').trim();
      return initials + ' ' + abbreviated[2].trim() + (hasStar ? '*' : '');
    }

    // 修正姓名顺序 (逗号格式 / 中文姓在前)
    const normalized = normalizeNameOrder(name);

    // 全名转缩写: "Jie Yang" → "J. Yang", "Chi-Ying Tsui" → "C-Y. Tsui"
    const parts = normalized.trim().split(/\s+/);
    if (parts.length < 2) return name + (hasStar ? '*' : ''); // 无法拆分
    const family = parts[parts.length - 1];
    const givenParts = parts.slice(0, -1);
    const initials = givenParts.map(givenInitial).join(' ');
    return (initials + ' ' + family).trim() + (hasStar ? '*' : '');
  });

  // J. Yang 加粗，但仅保留输入中已有的通讯星号
  return formatted.map(n => {
    if (/^J\.\s*Yang\*?$/i.test(n)) return '<strong>J. Yang' + (n.endsWith('*') ? '*' : '') + '</strong>';
    return n;
  }).join(', ');
}

/** 批量重新格式化所有论文的作者字段
 *  返回 { ok, total, changed, details }
 */
function reformatAllAuthors() {
  const config = readConfig();
  let total = 0, changed = 0;
  const details = [];

  for (const f of config.yearlyFiles) {
    const fp = path.join(ROOT, f.file);
    if (!fs.existsSync(fp)) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { continue; }

    let fileChanged = false;
    for (const section of ['journals', 'conferences']) {
      if (!data[section]) continue;
      for (const group of data[section]) {
        if (!group.items) continue;
        for (const item of group.items) {
          if (!item.authors) continue;
          total++;
          const before = item.authors;
          const after = reformatAuthorsString(before);
          if (before !== after) {
            item.authors = after;
            changed++;
            details.push({ file: f.file, title: (item.title || '').substring(0, 60), before, after });
            fileChanged = true;
          }
        }
      }
    }

    if (fileChanged) {
      fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    }
  }

  return { ok: true, total, changed, details: details.slice(0, 20) }; // 最多返回前20条
}

// ═══════════════════════════════════════════════
//  PDF 自动下载 (Unpaywall API + 直接下载)
// ═══════════════════════════════════════════════

/** 从论文 URL 提取 DOI */
function extractDoiFromUrlString(url) {
  let m = url.match(/doi\.org\/(10\.\d{4,}\/[^\s;&'"#?]+)/i);
  if (m) return decodeURIComponent(m[1].replace(/[.,;]$/, ''));
  m = url.match(/(10\.\d{4,}\/[^\s;&'"#?]+)/);
  if (m) return decodeURIComponent(m[1].replace(/[.,;]$/, ''));
  return null;
}

/** 调用 Unpaywall API 查找开放获取 PDF 链接
 *  返回 { pdfUrl, source, hostType } 或 null
 */
function findOaPdfViaUnpaywall(doi) {
  const https = require('https');
  const apiUrl = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=papermanager@gmail.com`;

  return new Promise((resolve) => {
    const req = https.get(apiUrl, {
      headers: { 'User-Agent': 'PaperManager/1.0', 'Accept': 'application/json' },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const bestOa = data.best_oa_location;
          if (bestOa && bestOa.url_for_pdf) {
            resolve({ pdfUrl: bestOa.url_for_pdf, source: 'Unpaywall', hostType: bestOa.host_type });
          } else if (bestOa && bestOa.url) {
            resolve({ pdfUrl: bestOa.url, source: 'Unpaywall (landing page)', hostType: bestOa.host_type });
          } else {
            resolve(null);
          }
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/** 从论文 URL 直接推断 PDF 下载链接 (MDPI / arXiv / Frontiers 等) */
function guessDirectPdfUrl(url) {
  // arXiv: https://arxiv.org/abs/2410.12866 → https://arxiv.org/pdf/2410.12866
  let m = url.match(/arxiv\.org\/abs\/([0-9.]+)/);
  if (m) return `https://arxiv.org/pdf/${m[1]}.pdf`;

  // MDPI: https://www.mdpi.com/1424-8220/23/21/8882 → https://www.mdpi.com/1424-8220/23/21/8882/pdf
  m = url.match(/mdpi\.com\/(\d+-\d+\/\d+\/\d+\/\d+)/);
  if (m) return `https://www.mdpi.com/${m[1]}/pdf`;

  // Frontiers: 通常 Unpaywall 能找到, 不直接推断
  return null;
}

/** 下载 PDF 到 papers/ 目录, 返回保存路径
 *  options: { url, filename, paperTitle }
 */
async function downloadPdf(url, filename) {
  const https = require('https');
  const http = require('http');

  // 生成安全文件名
  let safeName = (filename || 'downloaded').replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
  if (!safeName.endsWith('.pdf')) safeName += '.pdf';
  let finalPath = path.join(PAPERS_DIR, safeName);
  // 冲突加序号
  if (fs.existsSync(finalPath)) {
    const base = path.basename(safeName, '.pdf');
    let i = 2;
    while (fs.existsSync(path.join(PAPERS_DIR, `${base}_${i}.pdf`))) i++;
    safeName = `${base}_${i}.pdf`;
    finalPath = path.join(PAPERS_DIR, safeName);
  }

  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,*/*',
      },
      timeout: 60000,
    }, (res) => {
      // 跟随重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(downloadPdf(newUrl, filename));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      // 验证是 PDF (content-type 或前几字节)
      const contentType = res.headers['content-type'] || '';
      if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
        res.resume();
        return reject(new Error('返回的不是 PDF (content-type: ' + contentType + ')'));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 1000) {
          return reject(new Error('文件太小, 可能不是有效 PDF (' + buf.length + ' bytes)'));
        }
        // 检查 PDF 魔数
        if (buf.substring(0, 4) !== '%PDF') {
          return reject(new Error('文件不是有效 PDF (缺少 %PDF 头)'));
        }
        fs.writeFileSync(finalPath, buf);
        resolve({ savedPath: 'papers/' + safeName, filename: safeName, size: buf.length });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('下载超时')); });
  });
}

/** 自动下载论文 PDF
 *  策略: 0) 从 URL 提取 DOI → 失败则抓取页面提取 DOI
 *        1) Unpaywall 查 OA PDF → 下载
 *        2) 直接推断 PDF URL (arXiv/MDPI) → 下载
 *        3) 都失败则返回错误
 */
async function autoDownloadPaperPdf(paperUrl, paperTitle) {
  // 生成文件名
  let filename = 'downloaded.pdf';
  if (paperTitle) {
    filename = paperTitle.substring(0, 80).replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_') + '.pdf';
  }

  // 策略 0: 提取 DOI (URL 直接提取 → 抓取页面提取)
  let doi = extractDoiFromUrlString(paperUrl);
  if (!doi) {
    // 抓取页面 HTML, 从 meta tags 提取 DOI
    try {
      const html = await fetchHtml(paperUrl);
      const metaDoi = html.match(/<meta[^>]*name=["']citation_doi["'][^>]*content=["']([^"']+)["']/i);
      if (metaDoi) {
        doi = metaDoi[1].trim();
      } else {
        // 正则搜 DOI
        const regexDoi = html.match(/10\.\d{4,}\/[^\s"'<;]+/);
        if (regexDoi) doi = regexDoi[0].replace(/[.,;]$/, '');
      }
    } catch (e) { /* 页面抓取失败, 继续 */ }
  }

  // 策略 1: Unpaywall (通过 DOI)
  if (doi) {
    const oaResult = await findOaPdfViaUnpaywall(doi);
    if (oaResult && oaResult.pdfUrl) {
      try {
        const result = await downloadPdf(oaResult.pdfUrl, filename);
        return { ...result, doi, source: oaResult.source };
      } catch (e) {
        // Unpaywall 找到了链接但下载失败, 继续尝试其他策略
      }
    }
  }

  // 策略 2: 直接推断 PDF URL (arXiv / MDPI)
  const directUrl = guessDirectPdfUrl(paperUrl);
  if (directUrl) {
    try {
      const result = await downloadPdf(directUrl, filename);
      return { ...result, source: 'direct URL', doi: doi || '' };
    } catch (e) {
      // 继续报错
    }
  }

  // 都失败
  const reason = doi
    ? `DOI: ${doi}, 但 Unpaywall 未找到开放获取版本 (可能需要订阅)`
    : '无法从 URL 提取 DOI, 且无法直接推断 PDF 链接';
  return { error: reason };
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

const chromeBridge = createChromeBridge({ root: ROOT, readAllPapers });
const scholarWatcher = createScholarWatcher({ root: ROOT, readAllPapers, getProfileUrl: () => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'profile.json'), 'utf8')).contact?.googleScholar; }
  catch { return null; }
} });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  // Local editor only: do not let arbitrary websites invoke write or credential-backed import APIs.
  const allowedHosts = ['localhost:' + PORT, '127.0.0.1:' + PORT];
  const allowedOrigins = allowedHosts.map(host => 'http://' + host);
  if (!allowedHosts.includes(req.headers.host)) return sendJson(res, 403, { ok: false, error: '只允许本机地址访问' });
  if (pathname.startsWith('/api/chrome/extension/')) return handleChromeHttp(req, res, pathname, chromeBridge, sendJson);
  if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) {
    return sendJson(res, 403, { ok: false, error: '只允许本地管理页面访问' });
  }
  if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    // ── API 路由 ──
    if (pathname.startsWith('/api/chrome/')) return handleChromeHttp(req, res, pathname, chromeBridge, sendJson);
    if (pathname.startsWith('/api/scholar/')) {
      try {
        if (pathname === '/api/scholar/status' && method === 'GET') return sendJson(res, 200, scholarWatcher.status());
        if (method !== 'POST') return sendJson(res, 405, { ok: false, error: '不支持的操作' });
        const body = await readSmallJson(req);
        if (pathname === '/api/scholar/check') return sendJson(res, 200, await scholarWatcher.check(body.networkRetry === true ? 'network-retry' : 'manual'));
        if (pathname === '/api/scholar/settings') return sendJson(res, 200, scholarWatcher.configure(body.enabled));
        if (pathname === '/api/scholar/review') return sendJson(res, 200, scholarWatcher.review(body.id, body.ignored));
        if (pathname === '/api/scholar/resolve') return sendJson(res, 200, await scholarWatcher.resolve(body.id, body.doi));
        return sendJson(res, 404, { ok: false, error: '接口不存在' });
      } catch (error) { return sendJson(res, error.status || 400, { ok: false, error: error.message }); }
    }

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

    // 上移/下移论文
    if (pathname === '/api/paper/move' && method === 'POST') {
      const body = await readBody(req);
      if (!body.id || !body.direction) return sendJson(res, 400, { ok: false, error: '缺少 id 或 direction 参数' });
      const result = movePaper(body.id, body.direction);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    // 重命名 PDF
    if (pathname === '/api/rename-pdf' && method === 'POST') {
      const body = await readBody(req);
      const result = renamePdf(body.oldRelPath, body.newFilename);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    // 批量重命名: 预览 (按规范格式生成目标文件名, 供用户复核)
    if (pathname === '/api/rename-preview' && method === 'GET') {
      try {
        const plan = buildRenamePlan();
        return sendJson(res, 200, { ok: true, plan });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    // 批量重命名: 执行 (用户复核确认后的清单)
    if (pathname === '/api/rename-apply' && method === 'POST') {
      const body = await readBody(req);
      if (!Array.isArray(body.items)) return sendJson(res, 400, { ok: false, error: '缺少 items 数组' });
      try {
        const result = applyRenameBatch(body.items);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    // 从 URL 抓取论文元数据
    if ((pathname === '/api/fetch-url' || pathname === '/api/import-url') && method === 'POST') {
      const body = await readBody(req);
      if (!body.url) return sendJson(res, 400, { ok: false, error: '缺少 url 参数' });
      try {
        const metadata = await fetchUrlMetadata(body.url);
        const duplicates = findDuplicates(metadata.url, metadata.doi);
        return sendJson(res, 200, { ok: true, metadata, duplicates });
      } catch (err) {
        return sendJson(res, 200, { ok: false, error: err.message });
      }
    }

    // Format a draft only; unlike the batch endpoint, this never writes paper data.
    if (pathname === '/api/format-authors' && method === 'POST') {
      const body = await readBody(req);
      if (typeof body?.authors !== 'string' || body.authors.length > 20000) {
        return sendJson(res, 400, { ok: false, error: '作者必须是长度不超过 20000 字符的文本' });
      }
      return sendJson(res, 200, { ok: true, authors: reformatAuthorsString(body.authors) });
    }

    // 批量重新格式化所有论文的作者字段
    if (pathname === '/api/reformat-authors' && method === 'POST') {
      const result = reformatAllAuthors();
      return sendJson(res, 200, result);
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
        // 作者字段按统一标准格式化: 全名→缩写 (Jie Yang → J. Yang),
        // 中文姓在前自动翻转 (Yang Jie → J. Yang), J. Yang 加粗标通信 *
        if (info.authors) info.authors = reformatAuthorsString(info.authors);
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

    // 自动下载论文 PDF (单篇)
    if (pathname === '/api/download-pdf' && method === 'POST') {
      const body = await readBody(req);
      if (!body.url) return sendJson(res, 400, { ok: false, error: '缺少 url 参数' });
      try {
        const result = await autoDownloadPaperPdf(body.url, body.title);
        if (result.error) {
          return sendJson(res, 200, { ok: false, error: result.error });
        }
        // 如果指定了 paperId, 自动更新 pdf 字段
        if (body.paperId) {
          const p = readAllPapers().find(x => x.id === body.paperId);
          if (p) {
            updatePaper({
              id: p.id, groupYear: p.groupYear,
              authors: p.authors, title: p.title, venue: p.venue,
              venueHighlight: p.venueHighlight, url: p.url,
              pdf: result.savedPath, topics: p.topics || [],
              ...(p.abstract ? { abstract: p.abstract } : {}),
            });
          }
        }
        return sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err.message });
      }
    }

    // 批量下载 PDF (返回可下载列表, 前端逐个调用)
    if (pathname === '/api/download-pdf-check' && method === 'POST') {
      const papers = readAllPapers();
      const candidates = papers.filter(p => p.url && !p.pdf);
      const results = [];
      for (const p of candidates) {
        const doi = extractDoiFromUrlString(p.url);
        const directUrl = guessDirectPdfUrl(p.url);
        let downloadable = false, source = '';
        // 有 DOI 的标记为 "可能可下载" (Unpaywall 检查留给实际下载时)
        // 有直接 URL 的标记为 "可下载"
        if (directUrl) {
          downloadable = true; source = 'direct URL';
        } else if (doi) {
          downloadable = true; source = 'Unpaywall (待检查)';
        }
        results.push({
          id: p.id, title: p.title, url: p.url,
          doi: doi || '', downloadable, source,
        });
      }
      return sendJson(res, 200, { ok: true, candidates: results });
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

    if (pathname === '/paper-manager-scholar.js' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(path.join(__dirname, 'paper-manager', 'scholar-ui.js'), 'utf8'));
    }

    if (pathname === '/paper-manager-chrome.js' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(path.join(__dirname, 'paper-manager', 'chrome-ui.js'), 'utf8'));
    }

    if (pathname === '/paper-manager-url.js' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(__dirname, 'paper-manager', 'url-import.js'), 'utf8'));
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

server.listen(PORT, '127.0.0.1', () => {
  scholarWatcher.start();
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
