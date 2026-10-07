"""One-time Word migration. Word is not needed for subsequent CV builds.

Supports this text-only source DOCX; refuses tables/images rather than losing them.
Only writes content.md when requested, and never overwrites it without --force.
"""
from pathlib import Path
from zipfile import ZipFile
import argparse
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def val(parent, tag, default=None):
    e = parent.find(W + tag) if parent is not None else None
    return e.get(W + "val", default) if e is not None else default


def enabled(parent, tag):
    e = parent.find(W + tag) if parent is not None else None
    return e is not None and e.get(W + "val", "1") not in ("0", "false", "off", "none")


def md_escape(s):
    return re.sub(r"([\\*\[\]<>_`])", r"\\\1", s)


def run_text(run):
    return "".join(n.text or "" if n.tag == W + "t" else " " if n.tag in (W + "tab", W + "br", W + "cr") else "" for n in run)


def text_content(paragraph):
    return "".join(run_text(run) for run in paragraph.iter(W + "r"))


def rich_text(paragraph, links, heading=False):
    spans = []
    for child in paragraph:
        if child.tag == W + "r": runs = [child]; url = None
        elif child.tag == W + "hyperlink":
            runs = list(child.iter(W + "r")); url = links.get(child.get(R + "id"))
        else: continue
        for run in runs:
            text = run_text(run)
            if not text: continue
            pr = run.find(W + "rPr")
            style = (False if heading else enabled(pr, "b"), False if heading else enabled(pr, "i"), val(pr, "vertAlign"), False if heading else enabled(pr, "u"), url)
            if spans and spans[-1][1] == style: spans[-1] = (spans[-1][0] + text, style)
            else: spans.append((text, style))
    result = []
    for text, (bold, italic, vertical, underline, url) in spans:
        m = re.fullmatch(r"(\s*)(.*?)(\s*)", text, re.S)
        before, core, after = m.groups()
        core = md_escape(core)
        if core:
            if vertical == "superscript": core = "<sup>" + core + "</sup>"
            elif vertical == "subscript": core = "<sub>" + core + "</sub>"
            if underline and not url: core = "<u>" + core + "</u>"
            if italic: core = "*" + core + "*"
            if bold: core = "**" + core + "**"
            if url: core = "[" + core + "](" + url + ")"
        result.append(before + core + after)
    return "".join(result).strip()


def extract(path):
    with ZipFile(path) as z:
        doc = ET.fromstring(z.read("word/document.xml"))
        if doc.find(".//" + W + "tbl") is not None or doc.find(".//" + W + "drawing") is not None:
            raise ValueError("This importer only supports text-only Word documents")
        if any(doc.find(".//" + W + tag) is not None for tag in ("ins", "del", "txbxContent", "object", "altChunk")):
            raise ValueError("Review tracked changes/embedded content before importing")
        numbering = ET.fromstring(z.read("word/numbering.xml"))
        rels = ET.fromstring(z.read("word/_rels/document.xml.rels"))
        links = {e.get("Id"): e.get("Target") for e in rels if e.get("Type", "").endswith("/hyperlink")}
    nums = {n.get(W + "numId"): n for n in numbering.findall(W + "num")}
    abstracts = {n.get(W + "abstractNumId"): n for n in numbering.findall(W + "abstractNum")}
    counters = {}
    records = []
    for index, paragraph in enumerate(doc.find(W + "body").findall(W + "p")):
        plain = text_content(paragraph)
        if not plain.strip(): continue
        pr = paragraph.find(W + "pPr")
        num = pr.find(W + "numPr") if pr is not None else None
        label = ""; bullet = False; level = 0
        if num is not None:
            nid = val(num, "numId"); level = int(val(num, "ilvl", "0"))
            definition = nums[nid]
            abstract = abstracts[val(definition, "abstractNumId")]
            lvl = next(l for l in abstract.findall(W + "lvl") if l.get(W + "ilvl") == str(level))
            start = int(val(lvl, "start", "1"))
            override = next((l for l in definition.findall(W + "lvlOverride") if l.get(W + "ilvl") == str(level)), None)
            start = int(val(override, "startOverride", str(start)))
            key = (nid, level); counters[key] = counters.get(key, start - 1) + 1
            fmt = val(lvl, "numFmt")
            if fmt == "bullet": bullet = True
            elif fmt == "decimal": label = val(lvl, "lvlText").replace("%" + str(level + 1), str(counters[key]))
            elif fmt == "japaneseCounting":
                label = val(lvl, "lvlText").replace("%" + str(level + 1), "一二三四五六七八九"[counters[key]-1])
            else: raise ValueError("Unsupported numbering format " + str(fmt))
        sizes = [int(val(r.find(W + "rPr"), "sz", "0")) / 2 for r in paragraph.findall(W + "r")]
        largest = max(sizes, default=0)
        if largest >= 20: kind = "h1"
        elif largest >= 14: kind = "h2"
        elif largest >= 12: kind = "h4" if bullet else "h3"
        elif re.fullmatch(r"\d{4}", plain.strip()): kind = "h4"
        elif bullet: kind = "bullet-sub" if level else "bullet"
        elif label: kind = "item"
        elif len(plain) - len(plain.lstrip()) >= 6: kind = "detail"
        else: kind = "paragraph"
        rich = rich_text(paragraph, links, kind.startswith("h"))
        # Ensure OOXML wrappers did not hide visible text from the rich-text path.
        from build import inline
        if re.sub(r"\s+", "", inline(rich, True)) != re.sub(r"\s+", "", plain):
            raise ValueError("Unrecognized text structure in Word paragraph " + str(index))
        records.append({"index": index, "kind": kind, "label": label, "plain": plain, "rich": rich})
    return records


def markdown(records):
    result = []
    for r in records:
        kind, label, text = r["kind"], r["label"], r["rich"]
        if kind.startswith("h"):
            prefix = "#" * int(kind[1]) + " "
            if label: text = label + text
            elif kind == "h4" and not re.fullmatch(r"\d{4}", r["plain"].strip()): text = "■ " + text
        elif kind == "item": prefix = label + " "
        elif kind == "bullet": prefix = "- "
        elif kind == "bullet-sub": prefix = "    - "
        elif kind == "detail": prefix = "> "
        else: prefix = ""
        result.append(prefix + text)
    return "\n\n".join(result) + "\n"


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source", type=Path)
    p.add_argument("--output", type=Path, default=ROOT / "content.md")
    p.add_argument("--force", action="store_true")
    args = p.parse_args()
    if args.output.exists() and not args.force: p.error("Output exists; refusing to overwrite. Use --force only for an intentional re-import.")
    records = extract(args.source)
    args.output.write_text(markdown(records), encoding="utf-8", newline="\n")
    print(f"Imported {len(records)} non-empty paragraphs into {args.output}")
