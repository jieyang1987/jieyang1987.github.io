"""One-level, website-fed CV research honors with explicit awardee attribution."""
from copy import deepcopy
from hashlib import sha256
import re

from sync_website import website_markdown

HEADING = "研究成果荣誉"
PROJECT_HEADING = "项目经历"


def form_entry(item):
    if not isinstance(item.get("year"), int) or not 1900 <= item["year"] <= 2200:
        raise ValueError("Research honor needs an explicit year")
    for field in ("venue", "distinction"):
        if not isinstance(item.get(field), str) or not item[field].strip():
            raise ValueError("Research honor missing " + field)
    venue = website_markdown(item["venue"])
    distinction = website_markdown(item["distinction"])
    title = f"**{venue} · {distinction}**"
    is_team = bool(item.get("awardee") or item.get("project"))
    is_cover = bool(item.get("cover")) or "封面" in item["distinction"]
    if is_team:
        if not item.get("awardee") or not item.get("project"):
            raise ValueError("Team honor requires both the awardee and the project")
        detail = "；获奖主体：" + website_markdown(item["awardee"]) + "；项目：《" + website_markdown(item["project"]) + "》"
    elif item.get("paperTitle"):
        detail = "；论文：《" + website_markdown(item["paperTitle"]) + "》"
    elif is_cover:
        raise ValueError("Cover honor requires a linked paper title")
    else:
        # Unlinked poster honors are still listed, without inventing a paper ID.
        detail = ""
    confirmation = item.get("cv") or {}
    if not isinstance(confirmation, dict):
        raise ValueError("Research honor confirmation metadata must be an object")
    if confirmation.get("confirmedCorresponding") is True:
        if is_team or "通讯作者" not in item.get("authorRole", ""):
            raise ValueError("A team award or unconfirmed authorRole cannot become a personal corresponding-author claim")
        detail += "；通讯作者"
    # Unverified authorRole labels are never imported into the CV.
    return f"- {item['year']}年 {title}{detail}。"


def section_span(content):
    found = list(re.finditer(r"^## 研究成果荣誉[ \t]*\r?\n", content, re.M))
    if not found:
        return None
    if len(found) != 1:
        raise ValueError("Research honor section is ambiguous")
    start = found[0].start()
    following = re.search(r"^## [^\r\n]+\r?\n", content[found[0].end():], re.M)
    if not following:
        raise ValueError("Research honors must precede another top-level section")
    return start, found[0].end() + following.start()


def plan_research_awards(content, home, state=None):
    items = home.get("paperAwards")
    if not isinstance(items, list) or not items:
        raise ValueError("Website paperAwards must be a nonempty array; never silently erase CV honors")
    if any(not isinstance(item, dict) or not isinstance(item.get("year"), int) or not 1900 <= item["year"] <= 2200 for item in items):
        raise ValueError("Website research honors need explicit integer years")
    ordered = sorted(enumerate(items), key=lambda pair: (-pair[1]["year"], pair[0]))
    entries = [form_entry(item) for _, item in ordered]
    if len(set(entries)) != len(entries):
        raise ValueError("Website research honors have duplicate visible entries")
    body = "## " + HEADING + "\n\n" + "\n\n".join(entries) + "\n\n"
    span = section_span(content)
    previous = (state or {}).get("research_awards")
    if span is None:
        if previous:
            raise ValueError("A managed research honor section was removed; do not silently recreate it")
        target = list(re.finditer(r"^## 项目经历\r?\n", content, re.M))
        if len(target) != 1:
            raise ValueError("Expected one projects section after personal honors")
        marker = target[0].start()
        result = content[:marker] + body + content[marker:]
    else:
        start, end = span
        current = content[start:end]
        if not previous:
            raise ValueError("Existing research honors have no sync baseline; review before taking ownership")
        if previous.get("body_sha256") != sha256(current.encode("utf-8")).hexdigest():
            raise ValueError("Managed research honors were edited locally; preserve the manual text and review")
        result = content[:start] + body + content[end:]
    next_state = deepcopy(state or {})
    next_state["research_awards"] = {"body_sha256": sha256(body.encode("utf-8")).hexdigest(), "count": len(entries)}
    report = {"count": len(entries), "content_changed": result != content, "state_changed": next_state != (state or {}), "sections": 1}
    return result, next_state, report
