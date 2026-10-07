"""Verify a one-time migration against the original Word (not against website data)."""
import argparse
from collections import Counter
from pathlib import Path
import re
from build import ROOT, blocks, inline
from import_word import extract


def normalized(text):
    return re.sub(r"\s+", "", text)


def verify(word, content):
    original = extract(word)
    actual = list(blocks(content.read_text(encoding="utf-8-sig")))
    if len(actual) != len(original):
        raise ValueError(f"Paragraph count mismatch: Word={len(original)}, Markdown={len(actual)}")
    for record, (kind, label, text) in zip(original, actual):
        expected = record["plain"].strip()
        if kind != record["kind"]:
            raise ValueError(f"Structure changed at Word paragraph {record['index']}: {kind} != {record['kind']}")
        if kind.startswith("h") and record["label"]:
            expected = record["label"] + expected
        elif kind == "h4" and not re.fullmatch(r"\d{4}", expected):
            expected = "■ " + expected
        if kind == "item" and label != record["label"]:
            raise ValueError(f"Number changed at Word paragraph {record['index']}")
        if normalized(inline(text, True)) != normalized(expected):
            raise ValueError(f"Text changed at Word paragraph {record['index']}")
        # Exact rich-text round-trip also checks emphasis, links and vertical alignment.
        from import_word import markdown
        expected_block = list(blocks(markdown([record])))[0]
        if expected_block != (kind, label, text):
            raise ValueError(f"Inline formatting changed at Word paragraph {record['index']}")
    return Counter(kind for kind, _, _ in actual)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source", type=Path)
    p.add_argument("--content", type=Path, default=ROOT / "content.md")
    args = p.parse_args()
    counts = verify(args.source, args.content)
    print(f"PASS: {sum(counts.values())} non-empty paragraphs; text, ordering, list numbering and inline formatting match the Word import.")
    print(dict(counts))
