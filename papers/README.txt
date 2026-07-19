此目录用于存放已发表论文的 PDF 文件。

命名建议:
  [年份]_[期刊/会议缩写]_[标题].pdf
  例: 2026_ISSCC_A_Sparsity-Aware_Neural_Interface.pdf
      2025_TBioCAS_Self-Adaptive_Pseudo-Resistors.pdf

添加新论文的最简方式:
  1. 把 PDF 放到本目录 (文件名随意, 脚本会自动规范化)
  2. 在仓库根目录运行: node scripts/add-paper.js
  3. 脚本自动从 PDF 提取标题/DOI/摘要, 交互确认后写入对应年份的 JSON
  4. 确认后脚本会根据论文 Title 自动重命名 PDF 为规范文件名,
     并同步更新 JSON 中的 pdf 字段 (可选择跳过)
  5. 查看本地预览确认效果, 然后 git push

其他命令:
  node scripts/add-paper.js --list    查看各年份论文统计
  node scripts/add-paper.js --file papers/xxx.pdf   指定单个 PDF

可视化管理面板 (推荐):
  npm run manage
  或: node scripts/paper-manager.js
  启动后浏览器访问 http://localhost:8002
  - 浏览所有论文 (按年份/类型/主题/数据状态筛选)
  - 可视化编辑任意字段, 点保存直接写回 JSON
  - 标记缺失字段 (缺 URL/PDF/摘要的论文高亮提示)
  - PDF 重命名、删除论文

手动添加 (旧方式, 不推荐):
  在 data/publications/{年份}.json 中对应论文条目填写:
    "pdf": "papers/2026_ISSCC_xxx.pdf"

若使用外部链接 (如 ResearchGate), 直接填完整 URL:
  "pdf": "https://www.researchgate.net/publication/..."
