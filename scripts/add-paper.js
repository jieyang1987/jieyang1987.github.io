#!/usr/bin/env node
/**
 * add-paper.js — 交互式论文添加工具
 *
 * 用法:
 *   node scripts/add-paper.js                          扫描 papers/ 添加新论文
 *   node scripts/add-paper.js --file papers/xxx.pdf    指定单个 PDF
 *   node scripts/add-paper.js --list                   列出所有已录入论文统计
 *
 * 工作流程:
 *   1. 把新论文 PDF 放到 papers/ 目录 (命名建议: 年份_期刊缩写_标题.pdf)
 *   2. 运行本脚本, 自动发现未被 JSON 引用的 PDF
 *   3. 从 PDF 提取标题/作者/摘要, 交互式逐项确认
 *   4. 自动写入对应年份的 JSON 文件 (data/publications/{year}.json)
 *   5. 若是新年份, 自动创建文件并更新 publications.json
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ── 路径常量 ──
const ROOT = path.resolve(__dirname, '..');
const PAPERS_DIR = path.join(ROOT, 'papers');
const PUB_CONFIG = path.join(ROOT, 'data', 'publications.json');
const PUB_DIR = path.join(ROOT, 'data', 'publications');

// ── venue 缩写 → 全称 + 类型映射 ──
// 从 site-renderer.js 的统计逻辑和现有 JSON 数据整理而来
const VENUE_MAP = {
  // 期刊
  'JSSC':      { name: 'IEEE Journal of Solid-State Circuits', type: 'journal' },
  'JBHI':      { name: 'IEEE Journal of Biomedical and Health Informatics', type: 'journal' },
  'TBioCAS':   { name: 'IEEE Transactions on Biomedical Circuits and Systems', type: 'journal' },
  'TCSAI':     { name: 'IEEE Transactions on Circuits and Systems for Artificial Intelligence', type: 'journal' },
  'TCAS2':     { name: 'IEEE Transactions on Circuits and Systems II', type: 'journal' },
  'TCAS-I':    { name: 'IEEE Transactions on Circuits and Systems I: Regular Papers', type: 'journal' },
  'TCSVT':     { name: 'IEEE Transactions on Circuits and Systems for Video Technology', type: 'journal' },
  'TBME':      { name: 'IEEE Transactions on Biomedical Engineering', type: 'journal' },
  'JNE':       { name: 'Journal of Neural Engineering', type: 'journal' },
  'TNSRE':     { name: 'IEEE Transactions on Neural Systems and Rehabilitation Engineering', type: 'journal' },
  'IEEE_RAL':  { name: 'IEEE Robotics and Automation Letters', type: 'journal' },
  'Sensors':   { name: 'Sensors', type: 'journal' },
  'KBS':       { name: 'Knowledge-Based Systems', type: 'journal' },
  'cbsystems': { name: 'Cell Reports Physical Science', type: 'journal' },
  'Neuroelectronics': { name: 'Neuroelectronics', type: 'journal' },
  // 会议
  'ISSCC':   { name: 'IEEE International Solid-State Circuits Conference (ISSCC)', type: 'conference' },
  'ISCAS':   { name: 'IEEE International Symposium on Circuits and Systems (ISCAS)', type: 'conference' },
  'CICC':    { name: 'IEEE Custom Integrated Circuits Conference (CICC)', type: 'conference' },
  'BioCAS':  { name: 'IEEE Biomedical Circuits and Systems Conference (BioCAS)', type: 'conference' },
  'A-SSCC':  { name: 'IEEE Asian Solid-State Circuits Conference (A-SSCC)', type: 'conference' },
  'AICAS':   { name: 'IEEE Artificial Intelligence Circuits and Systems Conference (AICAS)', type: 'conference' },
  'ICLR':    { name: 'International Conference on Learning Representations (ICLR)', type: 'conference' },
  'ECCV':    { name: 'European Conference on Computer Vision (ECCV)', type: 'conference' },
  'DATE':    { name: 'Design, Automation & Test in Europe (DATE)', type: 'conference' },
  'ESSCIRC': { name: 'European Solid-State Circuits Conference (ESSCIRC)', type: 'conference' },
  'ESSERC':  { name: 'European Solid-State Electronics Research Conference (ESSERC)', type: 'conference' },
  'VLSI':    { name: 'IEEE Symposium on VLSI Circuits', type: 'conference' },
  'DAC':     { name: 'Design Automation Conference (DAC)', type: 'conference' },
};

// 默认高亮的 venue (顶级会议/期刊)
const HIGHLIGHT_VENUES = ['ISSCC', 'JSSC', 'VLSI', 'ICLR', 'DAC'];

// 可选主题
const ALL_TOPICS = ['bci', 'decoding', 'neuromodulation', 'neuromorphic', 'other'];


// ═══════════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════════

/** 交互式单行输入, 支持默认值 (直接回车保留) */
function ask(rl, question, defaultValue) {
  const suffix = (defaultValue !== undefined && defaultValue !== '') ? ` [${defaultValue}]` : '';
  return new Promise(resolve => {
    rl.question(`${question}${suffix}: `, answer => {
      const val = answer.trim();
      resolve(val || (defaultValue !== undefined ? String(defaultValue) : ''));
    });
  });
}

/** 交互式 y/n 确认 */
function askYesNo(rl, question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  return new Promise(resolve => {
    rl.question(`${question} (${hint}): `, answer => {
      const v = answer.trim().toLowerCase();
      if (!v) return resolve(defaultYes);
      resolve(v === 'y' || v === 'yes');
    });
  });
}

/** 扫描 papers/ 目录下所有 PDF */
function scanPapers() {
  if (!fs.existsSync(PAPERS_DIR)) return [];
  return fs.readdirSync(PAPERS_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => ({ filename: f, path: path.join(PAPERS_DIR, f) }));
}

/** 从所有年份 JSON 收集已被引用的 pdf 相对路径 (papers/xxx.pdf) */
function loadReferencedPdfs() {
  const referenced = new Set();
  if (!fs.existsSync(PUB_CONFIG)) return referenced;
  const config = JSON.parse(fs.readFileSync(PUB_CONFIG, 'utf8'));
  if (!config.yearlyFiles) return referenced;

  for (const fileInfo of config.yearlyFiles) {
    const filePath = path.join(ROOT, fileInfo.file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const section of ['journals', 'conferences']) {
        if (!data[section]) continue;
        for (const group of data[section]) {
          for (const item of (group.items || [])) {
            if (item.pdf && item.pdf.startsWith('papers/')) {
              referenced.add(item.pdf);
            }
          }
        }
      }
    } catch (e) {
      // 跳过损坏的 JSON
    }
  }
  return referenced;
}

/** 从文件名提取年份和 venue 缩写
 *  命名规律: {year}_{venue}_{title}.pdf
 *  例: 2026_ISSCC_A_Sparsity-Aware_xxx.pdf → year=2026, venue=ISSCC
 *      2025_TBioCAS_Self-Adaptive_xxx.pdf  → year=2025, venue=TBioCAS
 *      2026_IEEE_RAL_Event-Fused_xxx.pdf  → year=2026, venue=IEEE_RAL
 */
function parseFilename(filename) {
  const base = filename.replace(/\.pdf$/i, '');
  const parts = base.split('_');
  const year = parseInt(parts[0], 10);
  if (isNaN(year)) return { year: null, venueAbbrev: null, venueInfo: null };

  // 尝试匹配 VENUE_MAP: 先试 2 段拼接, 再试 1 段
  let venueAbbrev = null;
  let venueInfo = null;
  if (parts.length >= 2) {
    const twoSeg = parts.slice(1, 3).join('_');
    if (VENUE_MAP[twoSeg]) {
      venueAbbrev = twoSeg;
      venueInfo = VENUE_MAP[twoSeg];
    } else if (VENUE_MAP[parts[1]]) {
      venueAbbrev = parts[1];
      venueInfo = VENUE_MAP[parts[1]];
    } else {
      venueAbbrev = parts[1];
    }
  }
  return { year, venueAbbrev, venueInfo };
}

/** 用 pdf-parse 提取 PDF 文本, 启发式解析标题/作者/摘要 */
async function extractPdfInfo(pdfPath) {
  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch (e) {
    return { error: 'pdf-parse 未安装, 请先运行 npm install' };
  }

  let pdfData;
  try {
    const buf = fs.readFileSync(pdfPath);
    pdfData = await pdfParse(buf, { max: 3 }); // 只读前 3 页, 提速
  } catch (err) {
    return { error: err.message };
  }

  const text = pdfData.text || '';
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const meta = pdfData.info || {};
  const skipPattern = /^(ieee\s|vol\.|volume|issue|no\.|doi|https?:|©|\(c\)|received|accepted|published|pp\.|\d{4}\s*$|\s*\d+\s*$|corresponding author|isscc|\d{4}\s+ieee|9[78]\d-|isbn|session\s)/i;

  // ── 提取标题 ──
  // 优先使用 PDF 元数据 Title (更准确), 清理前导编号如 "36.6 "
  let title = '';
  if (meta.Title && meta.Title.length > 10) {
    title = meta.Title.replace(/^[\d.]+\s+/, '').trim();
  } else {
    // 回退: 跳过页眉/页脚, 取第一个有意义的较长行
    for (const line of lines.slice(0, 25)) {
      if (line.length < 8) continue;
      if (skipPattern.test(line)) continue;
      if (/^[\d\s\-.]+$/.test(line)) continue;
      title = line;
      break;
    }
    title = title.replace(/[—\-]\s*$/, '').trim();
  }

  // ── 提取 DOI / URL ──
  // 从 Subject 元数据或正文前部提取 DOI, 构造 doi.org 链接
  let doi = '';
  const doiSource = (meta.Subject || '') + ' ' + text.substring(0, 2000);
  const doiMatch = doiSource.match(/(10\.\d{4,}\/[^\s;"')]+)/i);
  if (doiMatch) doi = doiMatch[1].replace(/[.,;]$/, '');
  let url = doi ? 'https://doi.org/' + doi : '';

  // ── 提取摘要 ──
  let abstract = '';
  const absMatch = text.match(/abstract\s*[:：—\-\s]*([\s\S]+?)(?:index terms|keywords|introduction|i\.\s*introduction|1\.\s*introduction|©|\bI\.?\s*Introduction)/i);
  if (absMatch) {
    abstract = absMatch[1].trim()
      .replace(/\s+/g, ' ')          // 压缩空白
      .replace(/—\s*/g, '— ')        // 修正破折号间距
      .substring(0, 3000);            // 限制长度
  } else {
    // fallback (ISSCC 等无 Abstract 关键词的会议论文): 取正文前几段
    const bodyStart = lines.findIndex((l, i) => i > 2 && l.length > 80 && !skipPattern.test(l));
    if (bodyStart >= 0) {
      let bodyText = '';
      for (let i = bodyStart; i < Math.min(bodyStart + 15, lines.length); i++) {
        if (/^(figure|fig\.|table|TABLE|reference)/i.test(lines[i])) break;
        bodyText += lines[i] + ' ';
        if (bodyText.length > 1500) break;
      }
      abstract = bodyText.trim().replace(/\s+/g, ' ').substring(0, 3000);
    }
  }

  // ── 提取作者 ──
  // 策略: 标题之后、Abstract 之前的文本
  let authors = '';
  if (title) {
    const titleIdx = lines.findIndex(l => l.includes(title.substring(0, 30)));
    if (titleIdx >= 0) {
      const after = lines.slice(titleIdx + 1, titleIdx + 15);
      const absLineIdx = after.findIndex(l => /^abstract/i.test(l));
      const authorLines = absLineIdx >= 0
        ? after.slice(0, absLineIdx)
        : after.slice(0, 4);
      authors = authorLines
        .filter(l => l.length > 2 && !skipPattern.test(l))
        .join(', ')
        .replace(/\s+/g, ' ')
        .trim();
      if (authors.length > 400) authors = authors.substring(0, 400) + '...';
    }
  }

  // 作者清理: 过滤 IEEE 头衔, 校验质量, 提取不准则置空
  if (authors) {
    authors = authors
      .replace(/(Student Member|Senior Member|Member|Fellow|Life Fellow)\s*,?\s*IEEE/gi, '')
      .replace(/,\s*,/g, ',')
      .replace(/^,\s*|,\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    // 如果作者文本包含标题片段, 说明提取错误, 置空
    if (title && authors.toLowerCase().includes(title.substring(0, 20).toLowerCase())) {
      authors = '';
    }
    // 如果太短或太长, 可能有问题
    if (authors.length < 5 || authors.length > 300) authors = '';
  }

  // 摘要校验: 如果太短或含页眉特征, 置空
  if (abstract && (abstract.length < 100 || /9[78]\d-|ISBN|IEEE International|Solid-State Circuits Conference/i.test(abstract.substring(0, 120)))) {
    abstract = '';
  }

  return {
    title,
    authors,
    abstract,
    doi,
    url,
    metaTitle: meta.Title || '',
    metaAuthor: meta.Author || '',
    textLength: text.length,
  };
}

/** 自动高亮本人名字 (J. Yang / 杨杰) 为 <strong> 包裹 */
function highlightSelfAuthor(authors) {
  if (!authors) return authors;
  let result = authors;
  // 先处理已有 * 的 J. Yang (通信作者)
  result = result.replace(/\bJ\.?\s*Yang\s*\*/g, '<strong>J. Yang*</strong>');
  // 再处理无 * 的 J. Yang
  result = result.replace(/(?<!<strong>)\bJ\.?\s*Yang\b(?!\*|<\/strong>)/g, '<strong>J. Yang</strong>');
  // 中文
  result = result.replace(/(?<!<strong>)杨杰(?!<\/strong>)/g, '<strong>杨杰</strong>');
  return result;
}

/** 确保年份 JSON 文件存在; 若新建则同步注册到 publications.json */
function ensureYearFile(year) {
  const yearFile = path.join(PUB_DIR, `${year}.json`);
  if (!fs.existsSync(yearFile)) {
    const template = {
      journals: [{ year: year, items: [] }],
      conferences: [{ year: year, items: [] }]
    };
    fs.writeFileSync(yearFile, JSON.stringify(template, null, 2) + '\n', 'utf8');
    console.log(`✓ 新建年份文件: data/publications/${year}.json`);
  }

  // 同步注册到 publications.json
  const config = JSON.parse(fs.readFileSync(PUB_CONFIG, 'utf8'));
  const exists = config.yearlyFiles.some(f => f.year === year);
  if (!exists) {
    // 插入到合适位置 (数字年份降序, "2020 and earlier" 排最后)
    const newEntry = { year: year, file: `data/publications/${year}.json` };
    const numericYears = config.yearlyFiles.filter(f => typeof f.year === 'number');
    const stringYears = config.yearlyFiles.filter(f => typeof f.year !== 'number');
    numericYears.push(newEntry);
    numericYears.sort((a, b) => b.year - a.year);
    config.yearlyFiles = [...numericYears, ...stringYears];
    fs.writeFileSync(PUB_CONFIG, JSON.stringify(config, null, 2) + '\n', 'utf8');
    console.log(`✓ 已在 publications.json 注册年份: ${year}`);
  }
  return yearFile;
}

/** 将条目写入对应年份 JSON 文件 */
function writeEntry(entry) {
  const yearFile = ensureYearFile(entry.year);
  const data = JSON.parse(fs.readFileSync(yearFile, 'utf8'));

  const section = entry.type === 'conference' ? 'conferences' : 'journals';
  if (!data[section]) data[section] = [];

  // 找对应年份分组, 没有则新建
  let group = data[section].find(g => g.year === entry.year);
  if (!group) {
    group = { year: entry.year, items: [] };
    data[section].push(group);
  }

  // 构造论文条目 (字段顺序与现有数据一致)
  const item = {
    authors: entry.authors,
    title: entry.title,
    venue: entry.venue,
    venueHighlight: entry.venueHighlight,
    url: entry.url,
    pdf: entry.pdf,
    topics: entry.topics,
  };
  if (entry.abstract) item.abstract = entry.abstract;

  // 插入到分组开头 (最新论文排前)
  group.items.unshift(item);

  fs.writeFileSync(yearFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return yearFile;
}

/** 从 venue 全称反查缩写 (用于生成规范文件名) */
function findVenueAbbrev(venueName) {
  if (!venueName) return null;
  for (const [abbrev, info] of Object.entries(VENUE_MAP)) {
    if (info.name === venueName) return abbrev;
  }
  return null;
}

/** 清理标题为合法文件名片段
 *  - 去掉 Windows 非法字符 \ / : * ? " < > |
 *  - 空格 → 下划线 (与现有命名风格一致)
 *  - 限制长度, 避免 Windows 260 字符路径限制
 */
function sanitizeTitleForFilename(title) {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 120);
  return cleaned || 'untitled';
}

/** 生成规范文件名: {year}_{venue}_{title}.pdf */
function buildCanonicalFilename(year, venueAbbrev, title) {
  const safeTitle = sanitizeTitleForFilename(title) || 'untitled';
  const safeVenue = venueAbbrev || 'paper';
  return `${year}_${safeVenue}_${safeTitle}.pdf`;
}

/** 重命名 PDF 文件并同步更新 JSON 中刚写入条目的 pdf 字段
 *  返回 { renamed, newPdfRelPath, newFilename }
 */
function renamePdfAndUpdateJson(oldPdfRelPath, newFilename, year, type) {
  const oldAbs = path.join(ROOT, oldPdfRelPath);
  let finalFilename = newFilename;
  let finalAbs = path.join(PAPERS_DIR, newFilename);

  // 新旧相同, 无需操作
  if (path.normalize(oldAbs) === path.normalize(finalAbs)) {
    return { renamed: false, newPdfRelPath: oldPdfRelPath, newFilename: finalFilename };
  }

  // 目标已存在且不是当前文件 → 加序号避免覆盖
  if (fs.existsSync(finalAbs) && path.normalize(oldAbs) !== path.normalize(finalAbs)) {
    const ext = path.extname(newFilename);
    const base = path.basename(newFilename, ext);
    let i = 2;
    while (fs.existsSync(path.join(PAPERS_DIR, `${base}_${i}${ext}`))) i++;
    finalFilename = `${base}_${i}${ext}`;
    finalAbs = path.join(PAPERS_DIR, finalFilename);
  }

  // 重命名文件
  if (fs.existsSync(oldAbs)) {
    fs.renameSync(oldAbs, finalAbs);
  }

  // 同步更新 JSON 中刚写入条目的 pdf 字段
  const yearFile = path.join(PUB_DIR, `${year}.json`);
  if (fs.existsSync(yearFile)) {
    const data = JSON.parse(fs.readFileSync(yearFile, 'utf8'));
    const section = type === 'conference' ? 'conferences' : 'journals';
    let updated = false;
    if (data[section]) {
      for (const group of data[section]) {
        if (!group.items) continue;
        for (const item of group.items) {
          if (item.pdf === oldPdfRelPath) {
            item.pdf = 'papers/' + finalFilename;
            updated = true;
            break;
          }
        }
        if (updated) break;
      }
    }
    if (updated) {
      fs.writeFileSync(yearFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
    }
  }

  return { renamed: true, newPdfRelPath: 'papers/' + finalFilename, newFilename: finalFilename };
}

/** 列出所有已录入论文的统计 */
function listAllPapers() {
  console.log('═══════════════════════════════════════════');
  console.log('  论文统计 (按年份)');
  console.log('═══════════════════════════════════════════');

  const config = JSON.parse(fs.readFileSync(PUB_CONFIG, 'utf8'));
  const sorted = [...config.yearlyFiles].sort((a, b) => {
    const ya = typeof a.year === 'number' ? a.year : 0;
    const yb = typeof b.year === 'number' ? b.year : 0;
    return yb - ya;
  });

  let totalJ = 0, totalC = 0;
  for (const f of sorted) {
    const fp = path.join(ROOT, f.file);
    if (!fs.existsSync(fp)) continue;
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const jCount = (data.journals || []).reduce((s, g) => s + (g.items || []).length, 0);
    const cCount = (data.conferences || []).reduce((s, g) => s + (g.items || []).length, 0);
    totalJ += jCount;
    totalC += cCount;
    const label = typeof f.year === 'number' ? f.year : f.year;
    console.log(`  ${label}:  期刊 ${jCount} 篇 / 会议 ${cCount} 篇`);
  }
  console.log('───────────────────────────────────────────');
  console.log(`  合计:  期刊 ${totalJ} 篇 / 会议 ${totalC} 篇 / 总计 ${totalJ + totalC} 篇`);
  console.log('═══════════════════════════════════════════');
}


// ═══════════════════════════════════════════════
//  单篇论文处理
// ═══════════════════════════════════════════════

async function processPaper(rl, pdf) {
  console.log('');
  console.log('───────────────────────────────────────────');
  console.log(`正在处理: ${pdf.filename}`);
  console.log('正在从 PDF 提取信息...');

  const { year, venueAbbrev, venueInfo } = parseFilename(pdf.filename);
  const extracted = await extractPdfInfo(pdf.path);

  if (extracted.error) {
    console.log(`⚠ PDF 提取失败: ${extracted.error}`);
    console.log('将使用文件名信息, 请手动填写各字段。');
  } else {
    console.log(`✓ 提取完成 (文本长度 ${extracted.textLength} 字符)`);
  }

  // 逐项交互确认
  console.log('');
  console.log('请逐项确认 (直接回车 = 保留方括号内的默认值):');

  // 类型
  const defaultType = venueInfo ? venueInfo.type : 'journal';
  const typeAns = await ask(rl, '1. 类型 (journal/conference)', defaultType);
  const type = typeAns.toLowerCase().startsWith('c') ? 'conference' : 'journal';

  // 年份
  const defaultYear = year || new Date().getFullYear();
  const yearAns = await ask(rl, '2. 年份', String(defaultYear));
  const entryYear = parseInt(yearAns, 10) || defaultYear;

  // venue
  const defaultVenue = venueInfo ? venueInfo.name : (venueAbbrev || '');
  const venue = await ask(rl, '3. 期刊/会议全称', defaultVenue);

  // 标题
  const title = await ask(rl, '4. 标题', extracted.title || '');

  // 作者
  console.log('');
  console.log('  作者格式说明:');
  console.log('    - 通信作者在名字后加 *');
  console.log('    - 本人 (J. Yang) 会自动加 <strong> 高亮');
  console.log('    - 示例: H. Wu, J. Yang*, M. Sawan*');
  const rawAuthors = await ask(rl, '5. 作者', extracted.authors || '');
  const authors = highlightSelfAuthor(rawAuthors);

  // URL (默认用从 PDF 提取的 DOI 链接)
  const url = await ask(rl, '6. 链接 URL (可回车用提取的 DOI, 或粘贴 IEEE 链接)', extracted.url || '');

  // topics
  console.log('');
  console.log(`  可选主题: ${ALL_TOPICS.join(' / ')}`);
  const topicsAns = await ask(rl, '7. 主题 (逗号分隔, 默认 bci)', 'bci');
  const topics = topicsAns.split(/[,，]/).map(s => s.trim()).filter(Boolean);

  // venueHighlight
  const defaultHighlight = HIGHLIGHT_VENUES.includes(venueAbbrev);
  const highlightAns = await ask(rl, `8. 高亮 venue (true/false, ${defaultHighlight ? '默认 true 顶会/顶刊' : '默认 false'})`, defaultHighlight ? 'true' : 'false');
  const venueHighlight = highlightAns.toLowerCase() === 'true';

  // 摘要
  console.log('');
  if (extracted.abstract) {
    const preview = extracted.abstract.length > 150
      ? extracted.abstract.substring(0, 150) + '...'
      : extracted.abstract;
    console.log(`  提取摘要预览: ${preview}`);
  }
  console.log('  (回车 = 使用提取的摘要; 输入 n = 不填摘要; 输入其他 = 替换)');
  const abstractAns = await ask(rl, '9. 摘要', extracted.abstract || '');
  let abstract = '';
  if (abstractAns.toLowerCase() === 'n') {
    abstract = '';
  } else if (abstractAns) {
    abstract = abstractAns;
  } else {
    abstract = extracted.abstract || '';
  }

  // 组装条目
  const entry = {
    type, year: entryYear,
    authors, title, venue, venueHighlight,
    url, pdf: 'papers/' + pdf.filename,
    topics, abstract,
  };

  // 展示确认
  console.log('');
  console.log('───────────────────────────────────────────');
  console.log('请确认最终条目:');
  const display = { ...entry };
  if (display.abstract && display.abstract.length > 100) {
    display.abstract = display.abstract.substring(0, 100) + '... (共 ' + display.abstract.length + ' 字符)';
  }
  console.log(JSON.stringify(display, null, 2));

  const confirmed = await askYesNo(rl, '\n写入 ' + entryYear + '.json 的 ' + (type === 'conference' ? 'conferences' : 'journals') + ' 部分?');
  if (!confirmed) {
    console.log('已跳过此论文。');
    return false;
  }

  const written = writeEntry(entry);
  console.log(`✓ 已写入: ${path.relative(ROOT, written)}`);
  console.log(`  PDF 路径已记录: ${entry.pdf}`);

  // 根据确认后的 title 规范化 PDF 文件名
  // venue 缩写: 优先用 venue 全称反查标准缩写, 回退到文件名解析的缩写
  const finalVenueAbbrev = findVenueAbbrev(entry.venue) || venueAbbrev;
  const canonicalName = buildCanonicalFilename(entry.year, finalVenueAbbrev, entry.title);

  if (canonicalName !== pdf.filename) {
    console.log('');
    console.log('  建议将 PDF 重命名为规范文件名:');
    console.log(`    旧: ${pdf.filename}`);
    console.log(`    新: ${canonicalName}`);
    const doRename = await askYesNo(rl, '  是否重命名? (JSON 中 pdf 字段会同步更新)', true);
    if (doRename) {
      const result = renamePdfAndUpdateJson(entry.pdf, canonicalName, entry.year, entry.type);
      if (result.renamed) {
        console.log(`✓ PDF 已重命名: ${result.newFilename}`);
        console.log('  JSON 中 pdf 字段已同步更新');
        entry.pdf = result.newPdfRelPath;
      } else {
        console.log('  文件名已符合规范, 无需重命名。');
      }
    } else {
      console.log('  已跳过重命名, 保留原文件名。');
    }
  }
  return true;
}


// ═══════════════════════════════════════════════
//  主入口
// ═══════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  // --list 模式
  if (args.includes('--list')) {
    listAllPapers();
    return;
  }

  console.log('═══════════════════════════════════════════');
  console.log('  论文添加工具  add-paper.js');
  console.log('═══════════════════════════════════════════');

  // 扫描 papers/ 目录
  console.log('\n正在扫描 papers/ 目录...');
  const allPdfs = scanPapers();
  console.log(`  共 ${allPdfs.length} 个 PDF 文件。`);

  // 加载已引用列表
  const referenced = loadReferencedPdfs();
  console.log(`  JSON 中已引用 ${referenced.size} 个 PDF。`);

  // 找未引用的 PDF
  let newPdfs = allPdfs.filter(p => !referenced.has('papers/' + p.filename));

  // --file 模式: 指定单个文件
  const fileIdx = args.indexOf('--file');
  if (fileIdx >= 0 && args[fileIdx + 1]) {
    const target = args[fileIdx + 1];
    const filename = path.basename(target);
    newPdfs = [{ filename, path: path.isAbsolute(target) ? target : path.join(ROOT, target) }];
  }

  if (newPdfs.length === 0) {
    console.log('\n✓ 没有发现未录入的新论文。');
    console.log('  把新论文 PDF 放到 papers/ 目录后重新运行本脚本即可。');
    console.log('  命名建议: 年份_期刊缩写_标题.pdf  (例: 2026_ISSCC_xxx.pdf)');
    return;
  }

  console.log(`\n发现 ${newPdfs.length} 个未录入的 PDF:`);
  newPdfs.forEach((p, i) => console.log(`  ${i + 1}. ${p.filename}`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let added = 0;
  for (let i = 0; i < newPdfs.length; i++) {
    const ok = await processPaper(rl, newPdfs[i]);
    if (ok) added++;

    if (i < newPdfs.length - 1) {
      const cont = await askYesNo(rl, '\n继续处理下一篇?');
      if (!cont) break;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`  完成! 本次添加 ${added} 篇论文。`);
  if (added > 0) {
    console.log('  下一步:');
    console.log('    1. 本地预览: 访问 http://127.0.0.1:8001/publications.html 确认效果');
    console.log('    2. 推送 GitHub: git add . && git commit && git push');
    console.log('    3. 部署腾讯云: tcb hosting deploy <文件夹>');
  }
  console.log('═══════════════════════════════════════════');
  rl.close();
}

// 导出函数供测试或外部调用
module.exports = { extractPdfInfo, parseFilename, scanPapers, loadReferencedPdfs, highlightSelfAuthor, listAllPapers, findVenueAbbrev, sanitizeTitleForFilename, buildCanonicalFilename, renamePdfAndUpdateJson };

// 仅在直接运行时执行主流程
if (require.main === module) {
  main().catch(err => {
    console.error('运行出错:', err);
    process.exit(1);
  });
}
