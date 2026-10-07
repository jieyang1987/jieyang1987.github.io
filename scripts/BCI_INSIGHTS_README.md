# 思考与随笔 / Writings：内容维护

栏目是杨杰的个人写作空间，容纳思考、随笔和研究观察，不是新闻聚合或文章导读栏目。页面不再展示原来的推广式介绍。

为保持既有链接与构建入口稳定，地址仍为 `insights.html` / `insights_en.html`，内容文件仍为 `data/bci-insights.json`。

## 添加文章

编辑 `articles` 数组：

- `id`：永久标识，小写英文字母、数字和连字符；发布后不要修改。
- `date`：写作日期，YYYY-MM-DD。
- `topics`：主题 ID 数组，可以为空 `[]`，不强制给随笔归类。主题名称在同一文件的 `topics` 中维护。
- `zh.title`、`zh.body`：标题与正文，使用纯文本，段落可用 `\n\n` 分开；不要求摘要或导读，不限制篇幅。
- 可选 `zh.note`：补记。
- 可选 `en`：同结构的英文写作。没有英文时，英文栏目不显示该篇，不自动翻译或代写。
- 可选 `source`、`url`、`sourceDate`：需要引用外部资料时才填写来源、HTTP(S) 参考链接和资料发布日期。个人随笔无需这些字段。
- 兼容旧数据：未填写 `body` 时，旧 `summary` 字段可作为正文显示，但不再显示“简短导读”标题。

结构示例（仅示意，不作为正式内容发布）：

```json
{
  "id": "a-personal-reflection",
  "date": "2026-09-17",
  "topics": [],
  "zh": {
    "title": "随笔标题",
    "body": "第一段想法。\n\n第二段想法。"
  }
}
```

仅加入本人确认的公开内容。`data/` 会随网站发布，**不要在此保存草稿、私密笔记或凭据**。内容中的 HTML 会作为普通文字处理，不执行。

## 生成与验证

```sh
npm run build:insights
npm run check:insights
```

调整共用导航后，先运行 `npm run build:zh`，再运行 `npm run build:insights`。不要直接修改生成后的 HTML。

- 按日期倒序显示，固定入口：`insights.html#note-<id>`。
- 正文预渲染，关闭 JavaScript 仍可阅读；搜索和主题筛选为渐进增强。
- 发布仍走原有 `npm run prepare:release` 流程。
- 这是静态写作栏目，没有增加在线投稿、留言或后台编辑服务。

## 轻量电路风格边框

文章和空状态共用原生 HTML / CSS / SVG 边框。按用户反馈，移除四边引脚、四角密集走线、封装套层和顶部装饰栏，仅在左上、右下保留一条低对比度电路折线与小焊盘。主体是一层白底细边框，阴影很轻，让文字成为视觉重点。

装饰不拦截点击，辅助技术忽略它们，也不参加文章搜索；手机端进一步缩小、淡化，打印时隐藏。结构维护在 `scripts/build-bci-insights.js`，样式位于 `static/css/bci-insights.css`。`.codex_tmp/` 中的排版示例仅供本地检查，不得加入正式文章或发布包。
