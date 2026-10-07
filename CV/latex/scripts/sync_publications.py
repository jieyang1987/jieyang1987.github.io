"""Local, incremental publication synchronization without changing legacy authorship.

Registered website JSON is the input. Existing CV citations are preserved, with
non-destructive award additions. Newly imported citations follow website metadata
unless edited manually. No network request, PDF scraping or publication occurs.
"""
from copy import deepcopy
from datetime import date
from difflib import SequenceMatcher
from html.parser import HTMLParser
from hashlib import sha256
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit, unquote

from build import inline
from author_name_style import normalize_author_names, normalize_citation_authors
from sync_website import china_today, commonmark_superscripts, escape_md, load_json, website_markdown

HEADINGS = {"journals": "期刊论文", "conferences": "会议论文"}
DISPLAY_FIELDS = ("authors", "title", "venue", "venueHighlight", "url", "doi", "volume", "issue", "number", "pages", "articleNumber", "status", "award")


class RichHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.tags = [], []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
        elif not self.hidden and tag in ("strong", "b", "em", "i", "sup", "sub"):
            self.tags.append(tag)
            self.parts.append("**" if tag in ("strong", "b") else "*" if tag in ("em", "i") else "^" if tag == "sup" else "<sub>")
        elif not self.hidden and tag == "br":
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.hidden:
            self.hidden -= 1
        elif not self.hidden and tag in ("strong", "b", "em", "i", "sup", "sub"):
            if not self.tags or self.tags.pop() != tag:
                raise ValueError("Unbalanced publication author markup")
            self.parts.append("**" if tag in ("strong", "b") else "*" if tag in ("em", "i") else "^" if tag == "sup" else "</sub>")

    def handle_data(self, text):
        if not self.hidden:
            self.parts.append(escape_md(text))


def rich_markdown(text):
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Publication authors must be a non-empty string")
    parser = RichHTML()
    parser.feed(text)
    parser.close()
    if parser.tags:
        raise ValueError("Unclosed publication author markup")
    return commonmark_superscripts(" ".join("".join(parser.parts).split()))


def normalize(text):
    text = unicodedata.normalize("NFKC", text).lower().replace("µ", "u").replace("μ", "u")
    return "".join(c for c in text if c.isalnum())


def visible(text):
    return inline(website_markdown(text), True)


def doi_of(paper):
    value = paper.get("doi", "")
    if not value:
        url = paper.get("url", "")
        if re.fullmatch(r"10\.\d{4,9}/\S+", url):
            value = url
        elif urlsplit(url).hostname in ("doi.org", "dx.doi.org"):
            value = unquote(urlsplit(url).path.lstrip("/"))
    value = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", str(value), flags=re.I).strip().lower()
    if value and not re.fullmatch(r"10\.\d{4,9}/\S+", value):
        raise ValueError("Invalid publication DOI: " + value)
    return value


def paper_key(paper):
    prefix = paper["kind"] + ":"
    if paper.get("identity_override"):
        return prefix + paper["identity_override"]
    if paper.get("id"):
        return prefix + "id:" + str(paper["id"])
    doi = doi_of(paper)
    if doi:
        return prefix + "doi:" + doi
    url = paper.get("url", "")
    parsed = urlsplit(url)
    if parsed.hostname in ("ieeexplore.ieee.org", "www.ieeexplore.ieee.org"):
        match = re.search(r"/document/(\d+)", parsed.path)
        if match:
            return prefix + "ieee:" + match[1]
    if url:
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError("Invalid publication URL scheme")
        return prefix + "url:" + parsed.hostname.lower() + unquote(parsed.path).rstrip("/")
    return prefix + "title:" + normalize(visible(paper["title"]))


def snapshot(paper):
    return {"year": paper["year"], **{k: paper[k] for k in DISPLAY_FIELDS if k in paper}}


def load_publications(repo):
    repo = Path(repo).resolve()
    manifest = load_json(repo / "data/publications.json")
    registry = manifest.get("yearlyFiles")
    if not isinstance(registry, list) or not registry:
        raise ValueError("Publication registry must contain yearlyFiles")
    base = (repo / "data/publications").resolve()
    papers, files, seen = [], set(), {}
    for entry in registry:
        path = (repo / entry["file"]).resolve()
        if not path.is_relative_to(base) or path.suffix != ".json" or path in files:
            raise ValueError("Unsafe or repeated registered publication file: " + str(path))
        files.add(path)
        data = load_json(path)
        # early.json's group year=2020 is a display bucket, not every paper's year.
        early_bucket = not isinstance(entry["year"], int)
        for kind in HEADINGS:
            groups = data.get(kind)
            if not isinstance(groups, list):
                raise ValueError("Missing publication category: " + kind)
            for group in groups:
                if not isinstance(group.get("items"), list):
                    raise ValueError("Publication group items must be a list")
                for item in group["items"]:
                    for key in ("authors", "title", "venue"):
                        if not isinstance(item.get(key), str) or not item[key].strip():
                            raise ValueError("Missing publication " + key)
                    year = item.get("publicationYear", item.get("year", None if early_bucket else group["year"]))
                    if year is not None and (not isinstance(year, int) or not 1900 <= year <= 2200):
                        raise ValueError("Invalid publication year")
                    paper = {**item, "kind": kind, "year": year, "source_file": entry["file"]}
                    # Validate formatting before any output file is modified.
                    rich_markdown(item["authors"])
                    website_markdown(item["title"])
                    website_markdown(item["venue"])
                    identity = paper_key(paper)
                    if identity in seen:
                        first = seen[identity]
                        if snapshot(paper) == snapshot(first):
                            continue
                        if ":doi:" in identity or ":id:" in identity or normalize(visible(paper["title"])) == normalize(visible(first["title"])):
                            raise ValueError("Conflicting website records share a publication identity: " + identity)
                        # Distinct titles sharing an external URL are not silently merged.
                        # The link is not printed in the CV; report it as non-authoritative.
                        for collision_record in (first, paper):
                            token = collision_record["title"] + "|" + collision_record["venue"]
                            collision_record["identity_override"] = "ambiguous-url-title:" + sha256(token.encode("utf-8")).hexdigest()[:20]
                            collision_record["source_identity_issue"] = "不同题目的网页记录使用相同外链；不按该外链合并，题目分别保留，外链需核对：" + collision_record.get("url", "")
                    else:
                        seen[identity] = paper
                    papers.append(paper)
    return papers


def span(content, kind):
    matches = list(re.finditer(r"^### (期刊论文|会议论文)[:：][ \t]*\r?\n", content, re.M))
    found = [m for m in matches if m[1] == HEADINGS[kind]]
    if len(found) != 1:
        raise ValueError("Expected one publication subsection: " + HEADINGS[kind])
    start = found[0].end()
    end = re.search(r"^#{1,3} ", content[start:], re.M)
    return start, start + end.start() if end else len(content)


def parse_citation(body):
    plain = inline(body, True)
    title = re.search(r'["“](.*?)["”]', plain)
    if not title:
        raise ValueError("Cannot safely locate quoted legacy paper title: " + plain[:100])
    tail = plain[title.end():]
    years = list(re.finditer(r"[,，]\s*((?:19|20)\d{2})\s*[.。]", tail))
    if not years:
        raise ValueError("Cannot locate explicit publication year: " + plain[:100])
    year = years[0]
    return {"md": body, "title": title[1].strip().rstrip(",，"), "authors": plain[:title.start()].rstrip(" ,，"), "venue": tail[:year.start()].strip(" ,，"), "year": int(year[1])}


def citation_rows(content, kind):
    start, end = span(content, kind)
    result = []
    for chunk in re.split(r"\n\s*\n", content[start:end].strip()):
        chunk = chunk.strip()
        if not chunk:
            continue
        match = re.match(r"^\d+\.\s+([\s\S]+)$", chunk)
        if match:
            row = parse_citation(match[1])
            row["rank"] = 100000 + len(result)
            result.append(row)
        elif not re.fullmatch(r"(?:####\s+|\*\*)?\d{4}(?:\s*and earlier|及以前)?(?:\*\*)?", chunk):
            raise ValueError("Unrecognized text inside paper list: " + chunk[:100])
    return result


def award_suffix(award):
    return " **（奖项：" + website_markdown(award) + "）**" if award else ""


def format_citation(paper):
    if paper["year"] is None:
        raise ValueError("Publication year is unknown, not 2020 merely because of its display bucket")
    authors = normalize_author_names(rich_markdown(paper["authors"]))
    title = website_markdown(paper["title"])
    venue = website_markdown(paper["venue"])
    emphasis = "***" if paper["kind"] == "journals" or paper.get("venueHighlight") else "*"
    details = []
    if paper.get("volume"):
        details.append("vol. " + escape_md(str(paper["volume"])))
    issue = paper.get("issue", paper.get("number"))
    if issue:
        details.append("no. " + escape_md(str(issue)))
    if paper.get("pages"):
        details.append("pp. " + escape_md(str(paper["pages"])))
    elif paper.get("articleNumber"):
        details.append("Article " + escape_md(str(paper["articleNumber"])))
    if paper.get("status"):
        details.append(website_markdown(paper["status"]))
    extra = (", " + ", ".join(details)) if details else ""
    return f'{authors}, "{title}", {emphasis}{venue}{emphasis}{extra}, {paper["year"]}.' + award_suffix(paper.get("award"))


def differences(legacy, paper):
    fields = []
    web_authors = normalize_author_names(visible(paper["authors"]))
    if normalize(legacy["authors"]) != normalize(web_authors):
        fields.append("作者姓名/缩写/顺序")
    else:
        # Preserve author-marker placement, not just the total count of stars.
        keep_markers = lambda s: "".join(c for c in unicodedata.normalize("NFKC", s).lower() if c.isalnum() or c in "*#")
        if keep_markers(legacy["authors"]) != keep_markers(web_authors):
            fields.append("通信/共同第一作者标记")
    if normalize(legacy["title"]) != normalize(visible(paper["title"])):
        fields.append("论文题目")
    if paper["year"] is not None and legacy["year"] != paper["year"]:
        fields.append("发表年份")
    if normalize(legacy["venue"]) != normalize(visible(paper["venue"])):
        fields.append("刊物/会议表记")
    return fields


def plan_publications(content, papers, config, state=None, as_of=None):
    as_of = as_of or china_today()
    if config.get("version") != 1 or (state and state.get("version") != 1):
        raise ValueError("Unsupported publication sync state/config")
    numbering = config.get("numbering", "ascending")
    if numbering not in ("ascending", "descending"):
        raise ValueError("Publication numbering must be ascending or descending")
    result_state = deepcopy(state or {"version": 1, "records": {}})
    saved = result_state["records"]
    report = {"added": [], "updated": [], "matched": [], "review": [], "legacy_differences": [], "legacy_only": [], "retained": [], "source_warnings": [], "counts": {}}
    replacements, active = [], set()
    aliases = config.get("aliases", {})
    for kind in HEADINGS:
        existing = citation_rows(content, kind)
        before_count = len(existing)
        claimed = set()
        for rank, paper in enumerate(p for p in papers if p["kind"] == kind):
            identity = paper_key(paper)
            active.add(identity)
            event = {"key": identity, "kind": kind, "title": visible(paper["title"]), "website": snapshot(paper), "source_file": paper.get("source_file", "")}
            if paper.get("source_identity_issue"):
                report["source_warnings"].append({**event, "reason": paper["source_identity_issue"]})
            old = saved.get(identity)
            alias = aliases.get(identity)
            target = None
            if old:
                candidates = [r for r in existing if r["md"] == old["last_rendered"]]
                if len(candidates) != 1:
                    report["review"].append({**event, "reason": "受同步条目被手工修改或删除；保留本地内容，不覆盖、不重复新增。"})
                    continue
                target = candidates[0]
            else:
                expected_title = alias["legacy_title"] if alias else visible(paper["title"])
                candidates = [r for r in existing if normalize(r["title"]) == normalize(expected_title)]
                if len(candidates) > 1:
                    report["review"].append({**event, "reason": "同类别存在多个同题目记录，无法安全合并。"})
                    continue
                if candidates:
                    target = candidates[0]
                    # A newly supplied DOI/URL can adopt the former source identity.
                    old = next((v for v in saved.values() if v["last_rendered"] == target["md"]), None)
                elif alias:
                    report["review"].append({**event, "reason": "已审核的旧题目映射找不到目标，停止该条合并。"})
                    continue
            if target and id(target) in claimed:
                raise ValueError("Two website publications claim the same CV record: " + identity)
            if target is None:
                if paper["year"] is None:
                    report["review"].append({**event, "reason": "2020 及以前只是展示分组；新增论文缺少实际年份，暂不导入。"})
                    continue
                if paper["year"] > as_of.year:
                    report["review"].append({**event, "reason": "未来年份记录暂不作为已发表论文导入。"})
                    continue
                close = [r for r in existing if SequenceMatcher(None, normalize(r["title"]), normalize(event["title"])).ratio() >= 0.93]
                if close:
                    report["review"].append({**event, "reason": "题目高度相似但不能确认同一论文；请审核后添加明确映射。", "candidates": [r["title"] for r in close]})
                    continue
                rendered = format_citation(paper)
                target = {**parse_citation(rendered), "rank": rank}
                existing.append(target)
                ownership, base = "website", None
                report["added"].append({**event, "cv": rendered})
            else:
                ownership = old["ownership"] if old else "legacy"
                base = old.get("base_legacy", target["md"]) if old else target["md"]
                if ownership == "website":
                    if paper["year"] is None or paper["year"] > as_of.year:
                        report["review"].append({**event, "reason": "新元数据年份缺失/在未来，保留上次生成的有效记录。"})
                        continue
                    rendered = format_citation(paper)
                else:
                    base = normalize_citation_authors(base)
                    legacy = parse_citation(base)
                    fields = differences(legacy, paper)
                    if fields:
                        report["legacy_differences"].append({**event, "fields": fields, "preserved_authors": legacy["authors"], "preserved_cv": base, "reason": alias.get("reason") if alias else "保留原 CV 的作者、年份、刊物和备注，不自动改写历史记录。"})
                    rendered = base
                    # Add an explicit website award without discarding existing JCR/venue notes.
                    if paper.get("award") and not re.search(r"奖|\baward\b", inline(base, True), re.I):
                        rendered += award_suffix(paper["award"])
                if rendered != target["md"]:
                    report["updated"].append({**event, "before": target["md"], "after": rendered})
                    target.update(parse_citation(rendered))
                else:
                    report["matched"].append(event)
                target["rank"] = min(target["rank"], rank)
            claimed.add(id(target))
            saved[identity] = {"kind": kind, "ownership": ownership, "base_legacy": base if ownership == "legacy" else None, "last_rendered": target["md"], "snapshot": snapshot(paper)}
        managed_titles = {normalize(visible(v["snapshot"]["title"])) for v in saved.values()}
        for r in existing:
            if id(r) not in claimed:
                # Truly legacy-only entries can adopt the requested style too.
                # Do not bypass the manual-edit protection of managed records.
                if normalize(r["title"]) not in managed_titles:
                    styled = normalize_citation_authors(r["md"])
                    if styled != r["md"]:
                        report["updated"].append({"kind": kind, "key": "legacy-style:" + normalize(r["title"]), "title": r["title"], "before": r["md"], "after": styled, "reason": "User-requested initials style; names/roles/order preserved"})
                        r.update(parse_citation(styled))
                report["legacy_only"].append({"kind": kind, "title": r["title"], "cv": r["md"]})
        ordered = sorted(existing, key=lambda r: (-r["year"], r["rank"]))
        output, previous_group = [], None
        for index, row in enumerate(ordered, 1):
            group = row["year"] if row["year"] > 2020 else "2020及以前"
            if group != previous_group:
                output.append("#### " + str(group))
                previous_group = group
            number = len(ordered) - index + 1 if numbering == "descending" else index
            output.append(f"{number}. " + row["md"])
        start, end = span(content, kind)
        replacements.append((start, end, "\n" + "\n\n".join(output) + "\n\n"))
        report["counts"][kind] = {"before": before_count, "after": len(ordered)}
    for key, value in saved.items():
        if key not in active:
            report["retained"].append({"key": key, "reason": "网站未再收录该来源，CV 历史条目仍保留。"})
    merged = content
    for start, end, replacement in sorted(replacements, reverse=True):
        merged = merged[:start] + replacement + merged[end:]
    report["content_changed"] = merged != content
    report["state_changed"] = result_state != (state or {"version": 1, "records": {}})
    return merged, result_state, report


def publication_review_markdown(report):
    lines = ["# CV 论文同步核对说明", "", "此报告自动生成；旧 CV 的作者和备注不被批量覆盖。网页未给出的卷期、页码不推测补写。", ""]
    for kind, label in HEADINGS.items():
        c = report["counts"][kind]
        lines.append(f"- {label}：当前 {c['after']} 篇。")
    lines += ["", "## 保留的网站未收录记录", ""]
    lines += ["- " + escape_md(r["title"]) for r in report["legacy_only"]] or ["- 无。"]
    lines += ["", "## 尚不能安全导入或覆盖的记录", ""]
    for entry in report["review"]:
        lines += ["- " + escape_md(entry["title"]) + "：" + entry["reason"]]
    if not report["review"]:
        lines.append("- 本轮没有阻止导入的记录。")
    if report["source_warnings"]:
        lines += ["", "## 网页来源问题", ""]
        lines += ["- " + escape_md(r["title"]) + "：" + r["reason"] for r in report["source_warnings"]]
    lines += ["", "## 旧记录与网页的表记差异", "", "下面也包括缩写、刊物名称写法和通信作者星号差异，并不代表这些都是学术错误。原 CV 写法保留；已明确的新论文仍正常增补。", ""]
    for i, entry in enumerate(report["legacy_differences"], 1):
        lines += [f"### {i}. " + escape_md(entry["title"]), "", "差异字段：" + "、".join(entry["fields"]), "", "保留的 CV：" + entry["preserved_cv"], "", "网页作者：" + website_markdown(entry["website"]["authors"]), ""]
        if entry.get("reason"):
            lines += ["处理说明：" + entry["reason"], ""]
    return "\n".join(lines) + "\n"
