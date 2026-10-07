"""Explicit citation-author style only; never infer roles or reorder people."""
from functools import lru_cache
import json
from pathlib import Path
import re

STYLE_PATH = Path(__file__).resolve().parents[1] / 'author-name-style.json'


@lru_cache(maxsize=1)
def aliases():
    if not STYLE_PATH.exists():
        return {}
    config = json.loads(STYLE_PATH.read_text(encoding='utf-8-sig'))
    if config.get('version') != 1 or not isinstance(config.get('aliases'), dict):
        raise ValueError('Invalid author-name style configuration')
    return config['aliases']


def normalize_author_names(text):
    """Accept plain text, HTML or Markdown; preserve all non-name characters."""
    for full_name, abbreviated in sorted(aliases().items(), key=lambda pair: len(pair[0]), reverse=True):
        pattern = r'(?<![\w-])' + re.escape(full_name) + r'(?![\w-])'
        text = re.sub(pattern, lambda _: abbreviated, text)
    return text


def normalize_citation_authors(citation):
    title = re.search(r'["“]', citation)
    if not title:
        raise ValueError('Cannot isolate citation author list safely')
    return normalize_author_names(citation[:title.start()]) + citation[title.start():]
