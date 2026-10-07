"""Synchronize Jie Yang's author-role markers from the reviewed CV to website JSON.

Only authorship markers and their presentation are changed; names and ordering are not.
This script never commits, deploys, or rewrites an ambiguously matched paper.
"""
from pathlib import Path
import argparse
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[3]
CV = ROOT / 'CV' / 'latex'
sys.path.insert(0, str(CV / 'scripts'))
from build import inline
from sync_publications import citation_rows, normalize, paper_key, visible

OWNER = re.compile(r'(?:J\.\s*Yang|Jie\s+Yang|Yang\s+Jie|杨杰)')
WEB_OWNER = re.compile(r'<strong>((?:J\.\s*Yang|Jie\s+Yang|Yang\s+Jie|杨杰))([*#]*)</strong>(?:<sup>[*#]+</sup>)?|(?<![\w.])杨杰([*#]*)(?:<sup>[*#]+</sup>)?')


def cv_role(authors):
    found = list(OWNER.finditer(authors))
    if len(found) != 1:
        return None
    return re.match(r'[*#]*', authors[found[0].end():]).group()


def normalize_cv_style(source):
    # The existing bold span may include a star (and once, a comma). Move only
    # the marker outside the span; no paper is awarded or stripped of a role.
    source = re.sub(r'\*\*J\. Yang(\\\*(?:\\?#)?)(,?)\*\*',
                    lambda m: '**J. Yang**' + m[1].replace(r'\#', '#') + m[2], source)
    return source.replace('**J. Yang**\\*\\#', '**J. Yang**\\*#')


def website_authors(authors, role):
    found = list(WEB_OWNER.finditer(authors))
    if len(found) != 1:
        return None
    match = found[0]
    name = match[1] or '杨杰'
    replacement = '<strong>' + name + '</strong>' + ('<sup>' + role + '</sup>' if role else '')
    updated = authors[:match.start()] + replacement + authors[match.end():]
    # Preserve every other author's existing markers, changing their typography only.
    updated = re.sub(r'(?<=[A-Za-z])([*#]+)(?=\s*[,;]|\s*$)',
                     lambda m: '<sup>' + m[1] + '</sup>', updated)
    return updated


def plan():
    source = (CV / 'content.md').read_text(encoding='utf-8-sig')
    styled = normalize_cv_style(source)
    original_rows = [(kind, row) for kind in ('journals', 'conferences') for row in citation_rows(source, kind)]
    styled_rows = [(kind, row) for kind in ('journals', 'conferences') for row in citation_rows(styled, kind)]
    original_roles = {(kind, normalize(row['title'])): cv_role(row['authors']) for kind, row in original_rows}
    roles = {(kind, normalize(row['title'])): cv_role(row['authors']) for kind, row in styled_rows}
    if len(original_roles) != len(original_rows) or len(roles) != len(styled_rows):
        raise ValueError('Ambiguous duplicate CV paper title; do not sync author roles')
    if original_roles != roles:
        raise ValueError('CV role changed during style normalization')
    config = json.loads((CV / 'publication-sync.json').read_text(encoding='utf-8'))
    aliases = config.get('aliases', {})
    registry = json.loads((ROOT / 'data' / 'publications.json').read_text(encoding='utf-8'))['yearlyFiles']
    changes, unresolved, matched = {}, [], set()
    for entry in registry:
        path = ROOT / entry['file']
        data = json.loads(path.read_text(encoding='utf-8'))
        touched = False
        for kind in ('journals', 'conferences'):
            for group in data.get(kind, []):
                for paper in group.get('items', []):
                    title = visible(paper['title'])
                    key = (kind, normalize(aliases.get(paper_key({**paper, 'kind': kind}), {}).get('legacy_title', title)))
                    if key not in roles:
                        unresolved.append((kind, title, 'no exact CV title/approved alias'))
                        continue
                    if key in matched:
                        raise ValueError('Repeated website-to-CV match: ' + title)
                    matched.add(key)
                    role = roles[key]
                    if role is None:
                        unresolved.append((kind, title, 'owner not uniquely identified in CV'))
                        continue
                    authors = website_authors(paper['authors'], role)
                    if authors is None:
                        unresolved.append((kind, title, 'owner not uniquely identified on website'))
                        continue
                    if authors != paper['authors']:
                        paper['authors'] = authors
                        touched = True
        if touched:
            old = path.read_text(encoding='utf-8')
            new = json.dumps(data, ensure_ascii=False, indent=2) + ('\n' if old.endswith('\n') else '')
            changes[path] = new
    for key in roles.keys() - matched:
        unresolved.append((key[0], key[1], 'CV-only paper'))
    return source, styled, changes, unresolved, roles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    source, styled, changes, unresolved, roles = plan()
    print('CV source rows:', len(roles), 'style normalization:', source != styled,
          'website JSON files:', len(changes), 'unresolved:', len(unresolved))
    for kind, title, reason in unresolved:
        print('REVIEW', kind, reason, title)
    if args.write:
        if source != styled:
            (CV / 'content.md').write_text(styled, encoding='utf-8', newline='\n')
        for path, text in changes.items():
            path.write_text(text, encoding='utf-8', newline='\n')
        print('Local files updated; no commit, push or deployment.')
    return 0 if args.write or (not changes and source == styled) else 1


if __name__ == '__main__':
    raise SystemExit(main())
