"""Incrementally merge website honors/talks into two CV Markdown sections.

Standard library only. Never deletes CV records, guesses talk locations, changes
other sections, uploads data, or publishes. Ambiguous website activities remain
in a review report. State tracks ownership so manual CV edits are not overwritten.
"""
from copy import deepcopy
from datetime import date, datetime, timezone, timedelta
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
import argparse
import json
import re
import unicodedata

from build import ROOT, inline

REPO = ROOT.parents[1]
SECTIONS = {"honors": "个人荣誉", "talks": "邀请报告"}


def china_today():
    return datetime.now(timezone(timedelta(hours=8))).date()


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def normalized(value):
    return "".join(c.lower() for c in unicodedata.normalize("NFKC", value) if c.isalnum())


def escape_md(value):
    return re.sub(r"([\\*\[\]<>_`])", r"\\\1", value)


class WebsiteText(HTMLParser):
    """Strip web-only HTML; retain scientific superscripts without allowing TeX."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0
        self.vertical = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
        elif not self.hidden and tag in ("sup", "sub"):
            self.parts.append("^" if tag == "sup" else "<sub>")
            self.vertical.append(tag)
        elif not self.hidden and tag == "br":
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.hidden:
            self.hidden -= 1
        elif not self.hidden and tag in ("sup", "sub"):
            if not self.vertical or self.vertical.pop() != tag:
                raise ValueError("Unbalanced website superscript/subscript markup")
            self.parts.append("^" if tag == "sup" else "</sub>")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(escape_md(data))


def website_markdown(text):
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Website title must be a non-empty string")
    parser = WebsiteText()
    parser.feed(text)
    parser.close()
    if parser.vertical:
        raise ValueError("Unclosed website superscript/subscript markup")
    result = commonmark_superscripts(" ".join("".join(parser.parts).split()))
    if not inline(result, True).strip():
        raise ValueError("Website title has no visible text")
    return result


def commonmark_superscripts(value):
    """Use literal author markers and Unicode exponents; retain HTML only for unknown notation."""
    digits = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")
    def convert(match):
        text = match[1].replace(r"\*", "*").replace(r"\#", "#")
        if text in ("*", "*#"):
            return r"\*" + text[1:]
        if text == "#":
            return "#"
        if text.isascii() and text.isdigit():
            return text.translate(digits)
        if text == "th":
            return "th"
        return "<sup>" + match[1] + "</sup>"
    return re.sub(r"\^([^\^]+)\^", convert, value)


def date_parts(value):
    match = re.fullmatch(r"(\d{4})[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?", str(value))
    if not match:
        raise ValueError("Expected a website year/month or complete date: " + str(value))
    year, month = int(match[1]), int(match[2])
    day = int(match[3]) if match[3] is not None else None
    date(year, month, day or 1)  # Validate; the lower-bound day is never displayed.
    return year, month, day


def parse_date(value):
    """Lower-bound date for comparisons only; retain precision in display/state."""
    year, month, day = date_parts(value)
    return date(year, month, day or 1)


def date_iso(value):
    year, month, day = date_parts(value)
    return f"{year:04d}-{month:02d}" + (f"-{day:02d}" if day is not None else "")


def event_key(item):
    meta = item.get("cv", {})
    if not isinstance(meta, dict):
        raise ValueError("coverage.cv must be an object")
    if meta.get("id") or item.get("id"):
        return "talk:" + str(meta.get("id") or item["id"])
    day = date_iso(item["date"])
    plain = inline(website_markdown(item["title"]), True)
    venue = re.split(r"[:：]", plain, maxsplit=1)[0]
    # Title corrections after the venue separator keep the same identity.
    return "talk:" + day + ":" + normalized(venue)


def honor_key(item):
    if not isinstance(item.get("year"), int) or not 1900 <= item["year"] <= 2200:
        raise ValueError("Honor year must be an integer between 1900 and 2200")
    title = inline(website_markdown(item.get("titleZh") or item.get("title")), True)
    return "honor:" + str(item.get("id") or f"{item['year']}:{normalized(title)}")


def section_span(text, heading):
    matches = list(re.finditer(r"^## ([^\r\n]+)\r?\n", text, re.M))
    found = [(i, m) for i, m in enumerate(matches) if m[1].strip() == heading]
    if len(found) != 1:
        raise ValueError(f"Expected one '{heading}' section, found {len(found)}")
    i, match = found[0]
    end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
    return match.end(), end


def rows(text, section):
    start, end = section_span(text, SECTIONS[section])
    records = []
    for chunk in re.split(r"\n\s*\n", text[start:end].strip()):
        if not chunk.strip():
            continue
        body = chunk.strip()
        if section == "talks":
            body = re.sub(r"^\d+[.、]\s+", "", body)
        records.append({"md": body, "rank": 100000 + len(records)})
    return records


def record_date(record, kind):
    plain = inline(record["md"], True)
    if kind == "honors":
        m = re.match(r"(\d{4})年", plain)
        if not m:
            raise ValueError("Honor must begin with its year: " + plain)
        return int(m[1]), 0, 0
    dates = re.findall(r"(\d{4})年\s*(\d{1,2})月(?:\s*(\d{1,2})日)?", plain)
    if not dates:
        raise ValueError("Talk needs a Chinese year/month date: " + plain)
    y, m, d = dates[-1]
    return int(y), int(m), int(d or 0)


def classify_talk(item, decision, as_of):
    if parse_date(item["date"]) > as_of:
        return "review", "Future event; do not present an upcoming talk as already delivered"
    meta = item.get("cv", {})
    if meta.get("include") is False or meta.get("kind") in ("news", "poster", "panel", "session-chair", "moderator", "award", "project"):
        return "skip", "Explicit website CV exclusion/category"
    if decision:
        return decision["action"], decision.get("reason", "Reviewed CV mapping")
    if meta.get("include") is True or meta.get("kind") in ("invited-talk", "talk", "tutorial"):
        return "include", "Explicit website talk classification"
    title = inline(website_markdown(item["title"]), True)
    non_talk = r"圆桌讨论|Poster\s+Session|专题主席|荣获|入选|入围|立项|启动|揭牌|报道|报送|Special\s+Session|第一财经|新智元|钱江晚报|潮新闻|科普中国|获批|与.+交流[：:]"
    if re.search(non_talk, title, re.I):
        return "skip", "News, award, project, panel, poster or organizational activity, not a confirmed talk"
    if re.search(r"邀请报告|报告主题|报告题目|系列报告|学术讲座|名师分享会|发言内容|Tutorial|Guest Lecture", title, re.I):
        return "include", "Explicit lecture/report/tutorial wording"
    if re.search(r"(?:大会|学术会议|研讨会|Workshop|社区)[^：:]*[：:]\s*《", title, re.I):
        return "include", "Named speaking event with a quoted presentation topic"
    return "review", "Activity does not establish a report/presentation; not automatically imported"


def snapshot(item, kind):
    if kind == "honors":
        return {"year": item["year"], "title": item.get("titleZh") or item["title"]}
    return {"date": date_iso(item["date"]), "title": item["title"], "url": item.get("url", "")}


def formatted(item, kind, highlight_honors):
    if kind == "honors":
        body = f"{item['year']}年，" + website_markdown(item.get("titleZh") or item["title"])
        return "**" + body + "**" if highlight_honors else body
    year, month, day = date_parts(item["date"])
    label = f"{year}年{month}月" + (f"{day}日" if day is not None else "")
    return website_markdown(item["title"]) + f"（{label}）"


def same_honor(row, item):
    plain = inline(row["md"], True)
    m = re.match(r"(\d{4})年[，,]\s*(.+)", plain)
    if not m or int(m[1]) != item["year"]:
        return False
    title = inline(website_markdown(item.get("titleZh") or item["title"]), True)
    return normalized(m[2]) == normalized(title) or (
        m[2].startswith(title) and m[2][len(title):].lstrip().startswith(("（", "(")))


def plan(content, home, coverage, config, state=None, as_of=None):
    """Pure planner: returns content/state/report without any file side effects."""
    as_of = as_of or china_today()
    if not isinstance(home.get("selectedHonors"), list) or not isinstance(coverage.get("items"), list):
        raise ValueError("Website data must provide selectedHonors and items arrays")
    if config.get("version") != 1 or (state and state.get("version") != 1):
        raise ValueError("Unsupported sync configuration/state version")
    talk_numbering = config.get("talk_numbering", "ascending")
    if talk_numbering not in ("ascending", "descending"):
        raise ValueError("Talk numbering must be ascending or descending")
    result_state = deepcopy(state or {"version": 1, "sources": {}})
    result_state.setdefault("sources", {})
    report = {"sources": ["data/zh-home.json:selectedHonors", "data/coverage.json:items"], "added": [], "updated": [], "matched": [], "retained": [], "review": [], "skipped": [], "counts": {}}
    replacements = []
    decisions = config.get("talk_decisions", {})
    for kind, source_items in (("honors", home["selectedHonors"]), ("talks", coverage["items"])):
        existing = rows(content, kind)
        previous = result_state["sources"].setdefault(kind, {})
        active = set()
        before_count = len(existing)
        for rank, item in enumerate(source_items):
            if not isinstance(item, dict):
                raise ValueError("Website records must be objects")
            key = honor_key(item) if kind == "honors" else event_key(item)
            decision = decisions.get(key)
            action, reason = ("include", "Homepage personal honor") if kind == "honors" else classify_talk(item, decision, as_of)
            if kind == "honors" and item["year"] > as_of.year:
                action, reason = "review", "Future-year honor needs confirmation"
            event = {"section": kind, "key": key, "website": snapshot(item, kind)}
            if action in ("skip", "review"):
                report["skipped" if action == "skip" else "review"].append({**event, "reason": reason})
                continue
            if action not in ("include", "match", "hold"):
                raise ValueError("Unknown sync decision: " + action)
            if key in active:
                raise ValueError("Ambiguous website record identity; assign distinct cv.id values: " + key)
            active.add(key)
            source_snapshot = snapshot(item, kind)
            proposed = formatted(item, kind, config.get("highlight_new_honors", True))
            old = previous.get(key)
            changed_source = bool(old and old["snapshot"] != source_snapshot)
            target = None
            if old:
                exact = [r for r in existing if r["md"] == old["last_rendered"]]
                if len(exact) == 1:
                    target = exact[0]
                else:
                    report["review"].append({**event, "reason": "Previously synchronized CV entry was edited/deleted locally; preserve manual changes", "previous_cv": old["last_rendered"]})
                    continue
            elif decision and decision.get("legacy_contains"):
                match = normalized(decision["legacy_contains"])
                candidates = [r for r in existing if match in normalized(inline(r["md"], True))]
                if len(candidates) != 1:
                    report["review"].append({**event, "reason": "Legacy alias is missing or ambiguous; do not guess a merge"})
                    continue
                target = candidates[0]
            else:
                candidates = [r for r in existing if (same_honor(r, item) if kind == "honors" else normalized(inline(r["md"], True)) == normalized(inline(proposed, True)))]
                if len(candidates) > 1:
                    report["review"].append({**event, "reason": "Multiple CV matches; manual merge required"})
                    continue
                if candidates:
                    target = candidates[0]
            if target is None:
                target = {"md": proposed, "rank": rank}
                existing.append(target)
                ownership = "website"
                report["added"].append({**event, "cv": proposed})
            else:
                ownership = old["ownership"] if old else "legacy"
                if action == "hold":
                    report["review"].append({**event, "reason": reason, "preserved_cv": target["md"]})
                elif ownership == "website" and target["md"] != proposed:
                    report["updated"].append({**event, "before": target["md"], "after": proposed})
                    target["md"] = proposed
                elif changed_source and ownership == "legacy":
                    report["review"].append({**event, "reason": "Website changed an entry with richer legacy CV wording; legacy text preserved", "preserved_cv": target["md"]})
                else:
                    report["matched"].append(event)
                target["rank"] = min(target["rank"], rank)
            baseline = old["snapshot"] if changed_source and ownership == "legacy" and action != "hold" else source_snapshot
            previous[key] = {"ownership": ownership, "last_rendered": target["md"], "snapshot": baseline, "status": "held" if action == "hold" else "active"}
        for key, old in previous.items():
            if key not in active:
                report["retained"].append({"section": kind, "key": key, "reason": "Not currently selected/present on website; existing CV record is never deleted"})
        ordered = sorted(existing, key=lambda r: (*(-v for v in record_date(r, kind)), r["rank"]))
        body = "\n\n".join(
            (f"{len(ordered)-i if talk_numbering == 'descending' else i+1}. " if kind == "talks" else "") + r["md"]
            for i, r in enumerate(ordered)
        )
        start, end = section_span(content, SECTIONS[kind])
        replacements.append((start, end, "\n" + body + "\n\n"))
        report["counts"][kind] = {"before": before_count, "after": len(ordered)}
    result = content
    for start, end, replacement in sorted(replacements, reverse=True):
        result = result[:start] + replacement + result[end:]
    report["content_changed"] = result != content
    report["state_changed"] = result_state != (state or {"version": 1, "sources": {}})
    return result, result_state, report


def review_markdown(report):
    lines = ["# CV 网站同步待核对清单", "", "本文件由同步脚本生成。待核对项不会静默覆盖原 CV；没有确认报告身份的活动不会自动收入邀请报告。", ""]
    if not report["review"]:
        return "\n".join(lines + ["当前没有待核对项。", ""])
    for i, entry in enumerate(report["review"], 1):
        source = entry["website"]
        lines += [f"## {i}. {source.get('date', source.get('year', ''))}", "", "网页记录：" + website_markdown(source["title"]), "", "处理原因：" + entry["reason"], ""]
        if entry.get("preserved_cv"):
            lines += ["保留的 CV 记录：" + entry["preserved_cv"], ""]
        if entry.get("previous_cv"):
            lines += ["上次同步记录：" + entry["previous_cv"], ""]
        lines += ["来源标识：`" + entry["key"] + "`", ""]
    lines += ["确认后，在 website-sync.json 中调整对应映射/决策，或修订源数据。不要仅修改本生成报告。", ""]
    return "\n".join(lines)


def plan_all(repo=REPO, cv_root=ROOT, as_of=None):
    repo, cv_root = Path(repo), Path(cv_root)
    content = (cv_root / "content.md").read_text(encoding="utf-8-sig")
    state_path = cv_root / "website-sync-state.json"
    home = load_json(repo / "data/zh-home.json")
    merged, state, report = plan(content, home, load_json(repo / "data/coverage.json"), load_json(cv_root / "website-sync.json"), load_json(state_path) if state_path.exists() else None, as_of)
    if (cv_root / "research-awards-sync.json").exists():
        awards_config = load_json(cv_root / "research-awards-sync.json")
        if awards_config.get("version") != 1 or awards_config.get("format") != "one-chronological-list":
            raise ValueError("Research honors must remain one chronological list")
        from sync_research_awards import plan_research_awards
        merged, state, honors_report = plan_research_awards(merged, home, state)
        report["research_awards"] = honors_report
        report["state_changed"] = report["state_changed"] or honors_report["state_changed"]
    publication_state = None
    if (cv_root / "publication-sync.json").exists():
        from sync_publications import load_publications, plan_publications
        pub_path = cv_root / "publication-sync-state.json"
        merged, publication_state, pub_report = plan_publications(merged, load_publications(repo), load_json(cv_root / "publication-sync.json"), load_json(pub_path) if pub_path.exists() else None, as_of)
        report["publications"] = pub_report
        report["state_changed"] = report["state_changed"] or pub_report["state_changed"]
    report["content_changed"] = merged != content
    return merged, state, report, publication_state


def synchronize(repo=REPO, cv_root=ROOT, check=False, as_of=None):
    repo, cv_root = Path(repo), Path(cv_root)
    result, state, report, publication_state = plan_all(repo, cv_root, as_of)
    if not check:
        # All source files, including registered paper years, are validated before writes.
        if report["content_changed"]:
            (cv_root / "content.md").write_text(result, encoding="utf-8", newline="\n")
        if report["state_changed"]:
            (cv_root / "website-sync-state.json").write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (cv_root / "sync-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (cv_root / "SYNC_REVIEW.md").write_text(review_markdown(report), encoding="utf-8")
        if publication_state is not None:
            from sync_publications import publication_review_markdown
            if report["publications"]["state_changed"]:
                (cv_root / "publication-sync-state.json").write_text(json.dumps(publication_state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            (cv_root / "publication-sync-report.json").write_text(json.dumps(report["publications"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            (cv_root / "PUBLICATION_REVIEW.md").write_text(publication_review_markdown(report["publications"]), encoding="utf-8")
    return report


def print_summary(report):
    for name in ("honors", "talks"):
        count = report["counts"][name]
        added = sum(r["section"] == name for r in report["added"])
        updated = sum(r["section"] == name for r in report["updated"])
        print(f"{name}: {count['before']} -> {count['after']}; added={added}, updated={updated}")
    print(f"Review items: {len(report['review'])}. Unselected legacy CV records have been preserved.")
    if "research_awards" in report:
        print(f"Research honors: {report['research_awards']['count']} website-backed entries in one section.")
    if "publications" in report:
        pub = report["publications"]
        for kind, count in pub["counts"].items():
            added = sum(r["kind"] == kind for r in pub["added"])
            updated = sum(r["kind"] == kind for r in pub["updated"])
            print(f"{kind}: {count['before']} -> {count['after']}; added={added}, updated={updated}")
        print(f"Publication import holds: {len(pub['review'])}; legacy wording differences: {len(pub['legacy_differences'])}; source-link warnings: {len(pub['source_warnings'])}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Read-only: exit 1 when sync would change content/state")
    parser.add_argument("--as-of", type=date.fromisoformat)
    args = parser.parse_args()
    try:
        report = synchronize(check=args.check, as_of=args.as_of)
        print_summary(report)
        raise SystemExit(1 if args.check and (report["content_changed"] or report["state_changed"]) else 0)
    except (OSError, ValueError, KeyError) as exc:
        parser.exit(2, f"Sync failed without publishing: {exc}\n")
