# PDF论文更新工具使用说明

## 功能说明

`update_pdf_abstracts.py` 是一个**安全**的PDF更新工具,可以:

- ✅ 自动匹配PDF文件与数据库中的论文
- ✅ 更新PDF路径
- ✅ 自动提取并更新摘要
- ❌ **不会自动创建新条目**(避免数据污染)

## 使用方法

### 1. 放置PDF文件

将PDF文件放入 `papers/` 文件夹,文件命名格式:

```
年份_期刊或会议缩写_论文标题.pdf
```

示例:
- `2025_TCAS2_An_On-Chip_Reconfigurable_Front-End.pdf`
- `2023_TBioCAS_A_510_muW_SNN_Processor.pdf`
- `2026_ISSCC_Sparsity-Aware_Neural_Interface.pdf`

### 2. 运行脚本

```bash
python update_pdf_abstracts.py
```

### 3. 查看结果

脚本会输出处理结果:
- `[FOUND] Match found` - 找到匹配的论文
- `[SKIP] Already has PDF and abstract` - 论文已完整,跳过
- `[SUCCESS] Paper updated` - 更新成功
- `[NOT FOUND] No match in database` - 未找到匹配,需要手动添加

## 工作原理

### 1. 标题提取
从PDF文件名提取标题(移除年份、期刊名称等前缀)

### 2. 智能匹配
使用`difflib.SequenceMatcher`计算标题相似度:
- 阈值: 60%
- 实际匹配率: 94-100%

### 3. 更新策略
- 只更新已存在的论文
- 不自动创建新条目
- 如论文已有PDF和摘要,则跳过

### 4. 摘要提取
支持多种格式:
- IEEE期刊标准格式
- ISSCC会议论文特殊处理
- 自动过滤页眉、页脚等信息

## 输出示例

```
======================================================================
Safe PDF Update Tool (Abstracts Only)
======================================================================

Papers directory: papers
======================================================================

Loaded 7 yearly files
Found 9 PDF files in papers folder


[1/9] Processing: 2025_TCAS2_An_On-Chip_Reconfigurable_Front-End.pdf
----------------------------------------------------------------------
  Title from filename: An On-Chip Reconfigurable Front-End for...
  Searching in database...
  [FOUND] Match found (similarity: 100.0%)
  Extracting text from PDF...
  Updated PDF path: papers/2025_TCAS2_An_On-Chip_Reconfigurable_Front-End.pdf
  Updated abstract (792 chars)
  [SUCCESS] Paper updated

...

======================================================================
Summary
======================================================================
Papers updated: 3
Papers not found: 0
Papers skipped (already complete): 6
Errors: 0

======================================================================
Done!
======================================================================
```

## 新论文处理流程

如果PDF未匹配到数据库中的论文:

1. **查看输出信息**
   - 脚本会列出所有未匹配的PDF
   - 显示从文件名提取的标题

2. **手动添加到JSON文件**
   - 编辑对应年份的JSON文件(如 `2025.json`)
   - 添加完整的论文信息:
     - authors
     - title
     - venue
     - url
     - topics
     - pdf (可选,脚本会自动填充)
     - abstract (可选,脚本会自动提取)

3. **再次运行脚本**
   - 脚本会自动填充PDF路径和摘要

## 文件结构

```
academic-site-yangjie.ac.cn/
├── papers/                    # PDF文件存放目录
│   ├── 2026_ISSCC_xxx.pdf
│   ├── 2025_JSSC_xxx.pdf
│   └── ...
├── data/
│   └── publications/          # 年份JSON文件
│       ├── 2026.json
│       ├── 2025.json
│       └── ...
└── update_pdf_abstracts.py    # 本工具
```

## 与旧版本的区别

| 特性 | 旧版 (update_papers.py) | 新版 (update_pdf_abstracts.py) |
|------|------------------------|--------------------------------|
| 标题来源 | PDF文本(易出错) | 文件名(准确) |
| 自动创建新条目 | ✅ | ❌ |
| 数据安全性 | 低(可能污染) | 高(只更新) |
| 匹配准确率 | 不稳定 | 94-100% |

## 常见问题

### Q: 为什么不自动创建新条目?
A: 自动提取PDF标题非常困难,容易提取到页眉、页脚等错误内容。为避免数据污染,采用更安全的方式。

### Q: 如何添加新论文?
A: 手动编辑JSON文件,添加完整信息后再运行脚本自动填充PDF路径和摘要。

### Q: 文件名格式重要吗?
A: 非常重要!文件名中的标题用于匹配数据库中的论文。格式不规范可能导致匹配失败。

### Q: 匹配失败怎么办?
A: 检查文件名是否与数据库中的标题相似,或手动添加条目到JSON文件。

## 技术细节

- **PDF读取**: PyPDF2
- **标题匹配**: difflib.SequenceMatcher (相似度算法)
- **匹配阈值**: 60%
- **数据格式**: JSON
- **编码**: UTF-8

## 更新日志

### v1.0 (2026-03-22)
- 初始版本
- 使用文件名作为标题来源
- 只更新已存在论文
- 支持智能匹配(60%阈值)
