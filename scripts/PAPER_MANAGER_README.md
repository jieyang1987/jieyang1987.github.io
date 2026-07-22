# 论文管理面板 (Paper Manager)

本地可视化管理学术论文的 Web 工具。提供论文浏览、筛选、编辑、元数据自动补全、PDF 关联和新论文提取功能。

## 快速开始

```bash
# 安装依赖
npm install

# 启动管理面板
npm run manage

# 指定端口 (默认 8002)
node scripts/paper-manager.js --port 9000
```

浏览器访问 `http://localhost:8002` 即可。

## 功能概览

### 论文浏览与筛选

- 三栏布局：左侧筛选栏、中间论文列表、右侧详情编辑
- 多维度联合筛选：类型（期刊/会议）、年份、主题、数据完整度
- 筛选标签上的计数随当前筛选条件动态变化
- 全文搜索（标题、作者、venue）
- 缺失字段高亮提示（缺 URL / PDF / 摘要的论文一目了然）

### 论文编辑与保存

- 所有字段可直接编辑：标题、作者、venue、年份、URL、PDF、主题、摘要
- 作者格式：缩写 + HTML 高亮，本人用 `<strong>J. Yang</strong>`，通讯作者加 `*`
- 主题标签：弹出菜单选择（脑机接口 BCI / 神经解码 Decoding / 神经调控 Neuromodulation / 类脑计算 Neuromorphic / 其他 Other）
- 保存直接写回 JSON 文件，无需额外操作
- 支持 PDF 文件重命名（根据标题自动生成规范文件名）

### URL 自动补全

在详情页 URL 字段旁点击「从 URL 自动补全字段」按钮：

- 优先从 URL 提取 DOI，调用 **Crossref API** 获取完整元数据（标题、作者、venue、年份、摘要）
- Crossref 失败时 fallback 到 HTML 页面抓取（JSON-LD / meta tags）
- 作者名自动转为缩写格式（Jie Yang → J. Yang）
- 抓取结果在预览面板中可编辑，确认后再填充到表单

支持的链接类型：
- DOI 链接：`https://doi.org/10.xxxx/xxxx`
- MDPI、ScienceDirect 等含 DOI 的页面
- Crossref 收录的任意 DOI

### PDF 关联管理

- 详情页点击「从文件夹选择 PDF」按钮，列出 `papers/` 目录所有 PDF
- 每个 PDF 标注状态：当前关联 / 已关联其他论文 / 可用
- 支持文件名搜索，点击即关联

### 未引用 PDF 智能处理

顶部提示条自动扫描 `papers/` 目录中未被数据库引用的 PDF：

- **可能匹配已有论文**（绿色标签）：标题模糊匹配度 ≥ 40%，显示匹配论文和匹配度
  - 点击后可选：关联到此论文 / 查看论文详情 / 作为新论文提取
- **可能是新论文**（橙色标签）：无匹配，点击后自动提取 PDF 内容
  - 从 PDF 元数据提取标题、作者、摘要、DOI
  - 从文件名解析年份和 venue
  - 预填新论文表单，醒目标注「⚠ 待审核」
  - 确认后保存到对应年份文件

### 命令行工具

```bash
# 交互式录入新论文 (从 PDF 提取信息)
npm run add-paper

# 列出所有论文
npm run list-papers
```

## 文件结构

```
.
├── scripts/
│   ├── paper-manager.js          # 后端服务器 + API
│   ├── paper-manager.html        # 前端面板 (单文件, 含 CSS + JS)
│   └── add-paper.js              # 命令行录入工具 + PDF 提取模块
├── data/
│   ├── publications.json         # 配置: 年份文件列表 + 主题分类
│   └── publications/
│       ├── 2026.json             # 按年份存储的论文数据
│       ├── 2025.json
│       ├── ...
│       └── early.json            # 2020 and earlier
├── papers/                       # 所有 PDF 文件
└── package.json
```

## 数据结构

### 年份文件格式 (如 2026.json)

```json
{
  "journals": [
    {
      "year": 2026,
      "items": [
        {
          "authors": "W. Zou, <strong>J. Yang*</strong>, M. Sawan*",
          "title": "论文标题",
          "venue": "期刊或会议名称",
          "venueHighlight": false,
          "url": "https://...",
          "pdf": "papers/filename.pdf",
          "topics": ["bci", "neuromorphic"],
          "abstract": "论文摘要..."
        }
      ]
    }
  ],
  "conferences": [
    {
      "year": 2026,
      "items": [...]
    }
  ]
}
```

### 论文 ID 格式

`{年份}/{section}/{索引}`，如 `2026/journals/0`，用于唯一定位一篇论文。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/papers` | 获取所有论文 + 筛选配置 + 未引用 PDF 列表 |
| POST | `/api/paper` | 更新论文（按 ID） |
| POST | `/api/paper/create` | 创建新论文 |
| DELETE | `/api/paper/{id}` | 删除论文 |
| POST | `/api/fetch-url` | 从 URL 抓取论文元数据（Crossref API 优先） |
| GET | `/api/list-pdfs` | 列出 papers/ 目录所有 PDF |
| POST | `/api/extract-pdf` | 从 PDF 提取元数据（标题/作者/摘要/DOI） |

## 技术栈

- 后端：Node.js 原生 HTTP 服务器，无框架依赖
- 前端：原生 HTML/CSS/JavaScript，单文件
- PDF 解析：pdf-parse
- 元数据源：Crossref API、HTML meta tags 解析
- 数据存储：JSON 文件，按年份分文件

## 注意事项

- IEEE Xplore 有 WAF 反爬，直接抓取可能失败。建议用 DOI 链接（`https://doi.org/...`）补全
- 作者名在 Crossref 中是全名，系统自动转为缩写格式
- 保存操作直接修改 JSON 文件，建议定期 git commit
- PDF 文件较大时不纳入 git，建议用 .gitignore 排除 `papers/` 目录
