from copy import deepcopy
from datetime import date
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from sync_publications import plan_publications, load_publications, paper_key, citation_rows, rich_markdown, format_citation, normalize
from build import inline

CONTENT = '''# CV

## 个人荣誉

2025年，Honor

## 学术成果 (*为通信作者，#为共同第一作者)

### 书籍章节:

1. Unchanged book chapter.

### 期刊论文:

#### 2024

1. A. Chen, **J. Yang\\***, M. Sawan\\*, "Old journal topic", ***Old Journal***, 2024.（JCR一区）

### 会议论文:

**2020 and earlier**

1. A. Chen, **J. Yang**, "Old conference topic", *Old Conference*, 2014.

## 邀请报告

1. Keep this talk（2020年1月）
'''
CONFIG = {"version": 1, "aliases": {}}
AS_OF = date(2026, 10, 6)


def paper(title="New journal topic", year=2026, kind="journals", url="https://ieeexplore.ieee.org/document/10001"):
    return {"authors": "A. Chen, <strong>J. Yang*</strong>, M. Sawan*", "title": title, "venue": "Journal" if kind == "journals" else "Conference", "year": year, "kind": kind, "url": url}


def run(papers, content=CONTENT, state=None, config=CONFIG):
    return plan_publications(content, papers, config, state, AS_OF)


class PublicationSyncTests(unittest.TestCase):
    def test_append_and_preserve_legacy(self):
        out, _, report = run([paper(), paper("New conference", kind="conferences", url="https://doi.org/10.1234/conf")])
        self.assertEqual(len(report["added"]), 2)
        self.assertIn("Old journal topic", out)
        self.assertIn("Old conference topic", out)
        self.assertEqual(report["counts"]["journals"]["after"], 2)

    def test_descending_numbers_are_independent_and_span_year_groups(self):
        import re
        from sync_publications import span
        config=deepcopy(CONFIG);config["numbering"]="descending"
        sources=[paper(),paper("Another new title",2025,url="https://doi.org/10.1234/other"),paper("New conference",kind="conferences")]
        output,_,_=run(sources,config=config)
        for kind,expected in [("journals",[3,2,1]),("conferences",[2,1])]:
            a,b=span(output,kind)
            numbers=[int(v) for v in re.findall(r"^(\d+)\. ",output[a:b],re.M)]
            self.assertEqual(numbers,expected)
        self.assertLess(output.index('"New journal topic"'),output.index('"Old journal topic"'))

    def test_descending_numbers_increase_after_addition_and_are_idempotent(self):
        import re
        from sync_publications import span
        config=deepcopy(CONFIG);config["numbering"]="descending"
        first,state,_=run([paper()],config=config)
        sources=[paper(),paper("Distinct newer paper",url="https://doi.org/10.1234/new")]
        second,state2,_=run(sources,first,state,config)
        a,b=span(second,"journals")
        self.assertEqual([int(v) for v in re.findall(r"^(\d+)\. ",second[a:b],re.M)],[3,2,1])
        third,state3,report=run(sources,second,state2,config)
        self.assertEqual(second,third)
        self.assertEqual(state2,state3)
        self.assertFalse(report["content_changed"])

    def test_invalid_numbering_setting_fails(self):
        config=deepcopy(CONFIG);config["numbering"]="unknown"
        with self.assertRaises(ValueError):run([paper()],config=config)


    def test_books_honors_talks_are_unchanged(self):
        out, _, _ = run([paper()])
        self.assertEqual(out.split("### 期刊论文:")[0], CONTENT.split("### 期刊论文:")[0])
        self.assertEqual(out.split("## 邀请报告")[1], CONTENT.split("## 邀请报告")[1])

    def test_idempotent_including_blank_lines(self):
        a, state, _ = run([paper()])
        b, second_state, report = run([paper()], a, state)
        self.assertEqual(a, b)
        self.assertEqual(state, second_state)
        self.assertFalse(report["content_changed"])
        self.assertEqual(report["added"], [])

    def test_legacy_authors_and_annotations_not_rewritten(self):
        source = paper("Old journal topic", 2024)
        source["authors"] = "A. Chen, J. Yang, M. Sawan"
        out, _, report = run([source])
        self.assertIn(r"**J. Yang\***, M. Sawan\*", out)
        self.assertIn("（JCR一区）", out)
        self.assertEqual(len(report["added"]), 0)
        self.assertIn("通信/共同第一作者标记", report["legacy_differences"][0]["fields"])

    def test_legacy_award_addition_is_non_destructive(self):
        source = paper("Old journal topic", 2024); source["award"] = "Best Paper Award"
        out, state, report = run([source])
        self.assertEqual(len(report["updated"]), 1)
        self.assertIn("（JCR一区） **（奖项：Best Paper Award）**", out)
        second, _, report2 = run([source], out, state)
        self.assertEqual(out, second)
        self.assertFalse(report2["updated"])

    def test_existing_award_is_not_duplicated(self):
        content = CONTENT.replace("（JCR一区）", "（Best Paper Award）")
        source = paper("Old journal topic", 2024);source["award"] = "Best Paper Award"
        out, _, _ = run([source], content)
        self.assertEqual(out.count("Best Paper Award"), 1)

    def test_existing_early_year_is_not_changed_to_2020(self):
        source = paper("Old conference topic", None, "conferences")
        out, _, _ = run([source])
        self.assertIn("2014.", out)
        self.assertNotIn("Old Conference*, 2020", out)

    def test_new_early_paper_without_actual_year_is_held(self):
        out, _, report = run([paper("Unknown old paper", None)])
        self.assertEqual(len(report["review"]), 1)
        self.assertNotIn("Unknown old paper", out)

    def test_website_owned_metadata_is_updated(self):
        source = paper();out,state,_=run([source])
        source["year"]=2025;source["volume"]="10";source["pages"]="101–109"
        updated,_,report=run([source],out,state)
        self.assertEqual(len(report["updated"]),1)
        self.assertIn("vol. 10, pp. 101–109, 2025",updated)

    def test_manual_edit_is_preserved(self):
        source=paper();out,state,_=run([source]);out=out.replace("New journal topic","User wording")
        updated,_,report=run([source],out,state)
        self.assertIn("User wording",updated)
        self.assertNotIn("New journal topic",updated)
        self.assertEqual(len(report["review"]),1)

    def test_website_deletion_keeps_cv_entry(self):
        out,state,_=run([paper()]);updated,_,report=run([],out,state)
        self.assertIn("New journal topic",updated)
        self.assertEqual(len(report["retained"]),1)

    def test_same_title_in_different_categories_is_not_merged(self):
        a=paper();b=paper(kind="conferences")
        out,_,report=run([a,b])
        self.assertEqual(len(report["added"]),2)
        self.assertEqual(out.count('"New journal topic"'),2)

    def test_authors_html_keeps_explicit_role_markers(self):
        md=rich_markdown('A. Chen#, <strong>J. Yang*</strong>, M. Sawan*')
        self.assertEqual(inline(md,True),'A. Chen#, J. Yang*, M. Sawan*')
        self.assertIn(r'**J. Yang\***',md)

    def test_scientific_title_markup(self):
        source=paper('Chip <sup>2</sup> and f<sub>carrier</sub> & <-60dBc')
        md=format_citation(source)
        self.assertIn('²',md)
        self.assertIn('<sub>carrier</sub>',md)
        self.assertIn('& <-60dBc',inline(md,True))

    def test_doi_url_and_raw_doi_are_same_identity(self):
        a=paper(url='https://doi.org/10.1234/ABC');b=paper(url='10.1234/abc')
        self.assertEqual(paper_key(a),paper_key(b))

    def test_ieee_abstract_url_is_same_identity(self):
        a=paper(url='https://ieeexplore.ieee.org/abstract/document/1234/')
        b=paper(url='https://ieeexplore.ieee.org/document/1234?x=1')
        self.assertEqual(paper_key(a),paper_key(b))

    def test_verified_alias_keeps_real_legacy_citation(self):
        source=paper('Website wrong title',2024)
        config=deepcopy(CONFIG);config['aliases'][paper_key(source)]={'legacy_title':'Old journal topic','reason':'Verified DOI identity'}
        out,_,report=run([source],config=config)
        self.assertNotIn('Website wrong title',out)
        self.assertEqual(len(report['added']),0)
        self.assertIn('论文题目',report['legacy_differences'][0]['fields'])

    def test_very_similar_title_is_not_silently_merged(self):
        source=paper('Old journal topics',2024)
        out,_,report=run([source])
        self.assertEqual(len(report['review']),1)
        self.assertNotIn('Old journal topics',out)

    def test_future_publication_is_held(self):
        _,_,report=run([paper(year=2027)])
        self.assertEqual(len(report['added']),0)
        self.assertEqual(len(report['review']),1)

    def test_no_missing_fields_are_invented(self):
        text=format_citation(paper())
        self.assertNotIn('vol.',text)
        self.assertNotIn('pp.',text)
        self.assertNotIn('no.',text)


class PublicationRegistryTests(unittest.TestCase):
    def fixture(self, base, items, early=False):
        root=Path(base);(root/'data/publications').mkdir(parents=True)
        (root/'data/publications.json').write_text(json.dumps({'yearlyFiles':[{'year':'2020 and earlier' if early else 2026,'file':'data/publications/test.json'}]}),encoding='utf-8')
        raw=[{k:v for k,v in x.items() if k not in ('kind','year')} for x in items]
        (root/'data/publications/test.json').write_text(json.dumps({'journals':[{'year':2020 if early else 2026,'items':raw}],'conferences':[]}),encoding='utf-8')
        return root

    def test_early_bucket_is_not_a_publication_year(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=self.fixture(tmp,[paper()],True)
            self.assertIsNone(load_publications(root)[0]['year'])

    def test_duplicate_identical_source_is_not_counted_twice(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=self.fixture(tmp,[paper(),paper()])
            self.assertEqual(len(load_publications(root)),1)

    def test_same_link_different_titles_stay_distinct_with_warning(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=self.fixture(tmp,[paper(),paper('Distinct paper')])
            records=load_publications(root)
            self.assertNotEqual(paper_key(records[0]),paper_key(records[1]))
            self.assertTrue(all(r.get('source_identity_issue') for r in records))

    def test_conflicting_explicit_doi_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=self.fixture(tmp,[paper(url='https://doi.org/10.1234/x'),paper('Distinct paper',url='https://doi.org/10.1234/x')])
            with self.assertRaises(ValueError):load_publications(root)

    def test_path_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=self.fixture(tmp,[paper()])
            (root/'data/publications.json').write_text(json.dumps({'yearlyFiles':[{'year':2026,'file':'../outside.json'}]}),encoding='utf-8')
            with self.assertRaises(ValueError):load_publications(root)

    def test_missing_registered_file_does_not_silently_drop_papers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=self.fixture(tmp,[paper()])
            (root/'data/publications.json').write_text(json.dumps({'yearlyFiles':[{'year':2026,'file':'data/publications/missing.json'}]}),encoding='utf-8')
            with self.assertRaises(OSError):load_publications(root)


class PublicationWorkflowTests(unittest.TestCase):
    def fixture(self, tmp):
        from test_sync_website import WorkflowTests
        repo, cv = WorkflowTests().make_fixture(tmp)
        (cv / "content.md").write_text(CONTENT, encoding="utf-8")
        (cv / "publication-sync.json").write_text(json.dumps(CONFIG), encoding="utf-8")
        (repo / "data/publications").mkdir()
        (repo / "data/publications.json").write_text(json.dumps({"yearlyFiles":[{"year":2026,"file":"data/publications/2026.json"}]}), encoding="utf-8")
        path=repo / "data/publications/2026.json"
        item={k:v for k,v in paper().items() if k not in ("kind","year")}
        data={"journals":[{"year":2026,"items":[item]}],"conferences":[]}
        path.write_text(json.dumps(data), encoding="utf-8")
        return repo, cv, path, data

    def test_bad_publication_source_prevents_partial_honor_sync(self):
        from sync_website import synchronize
        with tempfile.TemporaryDirectory() as tmp:
            repo,cv,path,data=self.fixture(tmp)
            original=(cv/"content.md").read_bytes()
            data["journals"][0]["items"][0].pop("authors")
            path.write_text(json.dumps(data),encoding="utf-8")
            with self.assertRaises(ValueError):synchronize(repo,cv)
            self.assertEqual(original,(cv/"content.md").read_bytes())
            self.assertFalse((cv/"website-sync-state.json").exists())

    def test_freshness_detects_paper_change_without_writing(self):
        from update_cv import update
        with tempfile.TemporaryDirectory() as tmp:
            repo,cv,path,data=self.fixture(tmp)
            self.assertEqual(update(repo,cv,tex_only=True),0)
            self.assertEqual(update(repo,cv,check=True,tex_only=True),0)
            original=(cv/"content.md").read_bytes()
            data["journals"][0]["items"][0]["pages"]="10-20"
            path.write_text(json.dumps(data),encoding="utf-8")
            self.assertEqual(update(repo,cv,check=True,tex_only=True),1)
            self.assertEqual(original,(cv/"content.md").read_bytes())



if __name__=='__main__':unittest.main()
