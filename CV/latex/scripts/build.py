"""Render the deliberately small CV Markdown dialect to standalone XeLaTeX.

Python standard library only. No shell invocation, network access or publication.
"""
from pathlib import Path
import argparse
import re
import json
from hashlib import sha256

ROOT = Path(__file__).resolve().parents[1]
ESCAPES = {"\\": r"\textbackslash{}", "{": r"\{", "}": r"\}", "$": r"\$", "&": r"\&", "#": r"\#", "%": r"\%", "_": r"\_", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}"}
SYMBOLS = {"■": r"\CVSquare{}", "µ": "µ", "μ": "µ", "Ω": r"\ensuremath{\Omega}", "−": "-", "²": r"\textsuperscript{2}", "³": r"\textsuperscript{3}", "": " "}


def tex_escape(text):
    return "".join(ESCAPES.get(c, SYMBOLS.get(c, c)) for c in text)


def inline(text, plain=False):
    """Escaped Markdown text, emphasis, links and legacy HTML sup/sub/u; no raw TeX."""
    out = []
    i = 0
    def emit(s):
        return s if plain else tex_escape(s)
    while i < len(text):
        if text[i] == "\\" and i + 1 < len(text):
            out.append(emit(text[i+1])); i += 2; continue
        matched = False
        for opening, closing, macro in [("<sup>", "</sup>", "textsuperscript"), ("<sub>", "</sub>", "textsubscript"), ("<u>", "</u>", "CVUnderline"), ("***", "***", "CVStrongEm"), ("**", "**", "textbf"), ("*", "*", "textit")]:
            if text.startswith(opening, i):
                j = i + len(opening)
                while True:
                    end = text.find(closing, j)
                    if end < 0: break
                    # A closing delimiter preceded by an odd backslash count is literal.
                    bs = 0
                    k = end - 1
                    while k >= 0 and text[k] == "\\": bs += 1; k -= 1
                    if bs % 2 == 0: break
                    j = end + 1
                if end >= 0:
                    value = inline(text[i+len(opening):end], plain)
                    out.append(value if plain else "\\" + macro + "{" + value + "}")
                    i = end + len(closing); matched = True; break
        if matched: continue
        if text[i] == "[":
            m = re.match(r"\[((?:\\.|[^\]])*)\]\(([^\s)]+)\)", text[i:])
            if m:
                label, target = m.groups()
                if not target.startswith(("https://", "http://", "mailto:")):
                    raise ValueError("Unsupported link target: " + target)
                value = inline(label, plain)
                out.append(value if plain else r"\href{" + tex_escape(target) + "}{" + value + "}")
                i += len(m[0]); continue
        out.append(emit(text[i])); i += 1
    return "".join(out)


def blocks(source):
    for block in re.split(r"\n\s*\n", source.strip("\r\n")):
        if block.lstrip().startswith("<!--") and block.rstrip().endswith("-->"): continue
        line = " ".join(x.strip() for x in block.splitlines())
        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m: yield ("h" + str(len(m[1])), "", m[2]); continue
        if line.startswith("> "): yield ("detail", "", line[2:]); continue
        # Four spaces mark subordinate bullet paragraphs in the source.
        if line.startswith("- "):
            yield ("bullet-sub" if block.startswith("    ") else "bullet", "", line[2:]); continue
        m = re.match(r"^(\d+[.、])\s+(.*)$", line)
        if m: yield ("item", m[1], m[2]); continue
        yield ("paragraph", "", line)


def academic_item_inline(value):
    """Render ordinary Markdown author markers as PDF superscripts, only before the title."""
    title = re.search(r'["“《]', value)
    split = title.start() if title else len(value)
    authors, rest = value[:split], value[split:]
    authors = re.sub(r"\\\*(?:\\?#)?|(?<=[A-Za-z])#", lambda m: "<sup>" + m[0].replace("\\#", "#") + "</sup>", authors)
    return inline(authors) + inline(rest)


def render(source):
    result = []
    in_personal = False
    section = ""
    parsed = list(blocks(source))
    for index, (kind, label, value) in enumerate(parsed):
        plain = inline(value, True)
        if kind == "h2":
            section = plain
            in_personal = section == "个人基本信息"
        next_kind = parsed[index + 1][0] if index + 1 < len(parsed) else None
        rendered = inline(value)
        if kind == "h1": result.append(r"\CVTitle{" + rendered + "}")
        elif kind == "h2":
            title_note = re.fullmatch(r"(学术成果)\s+(\(.*\))", plain)
            if title_note:
                result.append(r"\CVSectionWithNote{" + tex_escape(title_note[1]) + "}{" + tex_escape(title_note[2]) + "}")
            else: result.append(r"\CVSection{" + rendered + "}")
            if section.startswith("学术成果"): result.append(r"\CVReferenceMode")
        elif kind == "h3": result.append(r"\CVSubsection{" + rendered + "}")
        elif section.startswith("学术成果") and re.fullmatch(r"\d{4}(?:\s*and earlier|及以前)?", plain):
            result.append(r"\CVYear{" + rendered + "}")
        elif kind == "h4" and value.startswith("■ "):
            result.append(r"\CVResearchTitle{" + inline(value[2:]) + "}")
        elif kind == "h4": result.append(r"\CVSubheading{" + rendered + "}")
        elif kind == "item": result.append(r"\CVItem{" + tex_escape(label) + "}{" + (academic_item_inline(value) if section.startswith("学术成果") else rendered) + "}")
        elif kind == "bullet" and section == "研究成果荣誉":
            award = re.fullmatch(r"(\d{4})年\s+(.+)", value)
            if not award:
                raise ValueError("Research honor must begin with its four-digit year")
            result.append(r"\CVResearchAward{" + award[1] + "}{" + inline(award[2]) + "}")
        elif kind.startswith("bullet"):
            result.append((r"\CVSubItem{" if kind.endswith("sub") else r"\CVBullet{") + rendered + "}")
        elif kind == "detail":
            macro = r"\CVProjectDetail{" if section == "项目经历" else r"\CVDetail{"
            result.append(macro + rendered + "}")
        elif in_personal:
            # Include all closing emphasis/underline markers with the label.
            m = re.match(r"^((?:\*\*)?(?:<u>)?[^:：]+[:：](?:</u>)?(?:\*\*)?)\s*(.*)$", value)
            if m:
                result.append(r"\CVField{" + inline(m[1]) + "}{" + inline(m[2]) + "}")
            else: result.append(r"\CVParagraph{" + rendered + "}")
        else:
            accent = section in ("个人荣誉", "项目经历") and value.startswith("**") and value.endswith("**")
            if accent:
                macro = r"\CVAccentLeadParagraph{" if next_kind == "detail" else r"\CVAccentParagraph{"
            else:
                macro = r"\CVLeadParagraph{" if next_kind == "detail" else r"\CVParagraph{"
            result.append(macro + rendered + "}")
    return "\n\n".join(result)


def build(content=ROOT / "content.md", template=ROOT / "templates" / "layout.tex", output=ROOT / "cv.tex"):
    source = content.read_text(encoding="utf-8-sig")
    layout = template.read_text(encoding="utf-8-sig")
    if layout.count("%%CV_BODY%%") != 1: raise ValueError("Template must contain exactly one %%CV_BODY%% marker")
    result = layout.replace("%%CV_BODY%%", render(source))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(result, encoding="utf-8", newline="\n")
    receipt = {
        "tex_sha256": sha256(output.read_bytes()).hexdigest(),
        "content_sha256": sha256(content.read_bytes()).hexdigest(),
        "template_sha256": sha256(template.read_bytes()).hexdigest(),
    }
    output.with_suffix(".build.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    return output


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--content", type=Path, default=ROOT / "content.md")
    p.add_argument("--template", type=Path, default=ROOT / "templates" / "layout.tex")
    p.add_argument("--output", type=Path, default=ROOT / "cv.tex")
    args = p.parse_args()
    print(build(args.content, args.template, args.output))
