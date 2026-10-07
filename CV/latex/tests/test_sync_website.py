from copy import deepcopy
from datetime import date
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from sync_website import plan, event_key, website_markdown, synchronize, rows
from update_cv import ensure_editor_safe, update, refresh_public_pdf
from build import build

AS_OF = date(2026, 10, 6)
CONFIG = {"version": 1, "highlight_new_honors": True, "talk_decisions": {}}
CONTENT = """# CV

## 个人基本信息

Unrelated **profile** must stay byte-for-byte intact.

## 个人荣誉

**2022年，Legacy honor（extra qualification）**

2021年，Older honor not on the website

## 项目经历

Unrelated project data & formatting.

## 邀请报告

1. Original venue：“Old topic”（2021年5月，中国杭州）

## 学术兼职

Keep this final section.
"""


def honor(title="New honor", year=2026, identifier="h1"):
    return {"id": identifier, "title": title, "year": year}


def talk(title="New venue：邀请报告：《New topic》", day="2026.9.20", identifier="t1"):
    return {"id": identifier, "title": title, "date": day, "url": ""}


def run(content=CONTENT, honors=None, talks=None, config=CONFIG, state=None):
    return plan(content, {"selectedHonors": honors or []}, {"items": talks or []}, config, state, AS_OF)


class SyncTests(unittest.TestCase):
    def test_adds_and_retains_legacy_only_records(self):
        output, state, report = run(honors=[honor()], talks=[talk()])
        self.assertEqual(report["counts"], {"honors": {"before": 2, "after": 3}, "talks": {"before": 1, "after": 2}})
        self.assertIn("Older honor not on the website", output)
        self.assertIn("Original venue", output)
        self.assertLess(output.index("New venue"), output.index("Original venue"))

    def test_only_two_sections_change(self):
        output, _, _ = run(honors=[honor()], talks=[talk()])
        self.assertEqual(output.split("## 个人荣誉")[0], CONTENT.split("## 个人荣誉")[0])
        self.assertEqual(output.split("## 项目经历")[1].split("## 邀请报告")[0], CONTENT.split("## 项目经历")[1].split("## 邀请报告")[0])
        self.assertEqual(output.split("## 学术兼职")[1], CONTENT.split("## 学术兼职")[1])

    def test_repeat_is_idempotent(self):
        output, state, _ = run(honors=[honor()], talks=[talk()])
        second, state2, report = run(output, [honor()], [talk()], state=state)
        self.assertEqual(output, second)
        self.assertEqual(state, state2)
        self.assertFalse(report["content_changed"])
        self.assertFalse(report["state_changed"])
        self.assertEqual(report["added"], [])

    def test_existing_honor_keeps_extra_qualification(self):
        output, _, report = run(honors=[honor("Legacy honor", 2022)])
        self.assertEqual(len(rows(output, "honors")), 2)
        self.assertIn("Legacy honor（extra qualification）", output)
        self.assertEqual(report["added"], [])

    def test_report_numbers_descend_without_reversing_the_talks(self):
        import re
        from sync_website import section_span
        config={**CONFIG,'talk_numbering':'descending'}
        records=[talk('Recent talk 邀请报告',day='2026.9.20',identifier='a'),talk('Earlier talk 邀请报告',day='2025.9.20',identifier='b')]
        updated,state,report=run(talks=records,config=config)
        start,end=section_span(updated,'邀请报告')
        nums=[int(n) for n in re.findall(r'^(\d+)\. ',updated[start:end],re.M)]
        self.assertEqual(nums,[3,2,1])
        self.assertLess(updated.index('Recent talk'),updated.index('Earlier talk'))
        self.assertLess(updated.index('Earlier talk'),updated.index('Original venue'))
        self.assertEqual(report['counts']['talks'],{'before':1,'after':3})
        repeated,state2,status=run(updated,talks=records,config=config,state=state)
        self.assertEqual(updated,repeated)
        self.assertEqual(state,state2)
        self.assertFalse(status['content_changed'])

    def test_new_report_automatically_increases_first_number(self):
        import re
        from sync_website import section_span
        config={**CONFIG,'talk_numbering':'descending'}
        first=talk('Existing talk 邀请报告',day='2026.9.20',identifier='a')
        result,state,_=run(talks=[first],config=config)
        later=talk('Most recent talk 邀请报告',day='2026.10.6',identifier='b')
        result2,_,_=run(result,talks=[later,first],config=config,state=state)
        start,end=section_span(result2,'邀请报告')
        self.assertEqual([int(n) for n in re.findall(r'^(\d+)\. ',result2[start:end],re.M)],[3,2,1])
        self.assertLess(result2.index('Most recent talk'),result2.index('Existing talk'))

    def test_invalid_report_numbering_is_rejected(self):
        config={**CONFIG,'talk_numbering':'random'}
        with self.assertRaises(ValueError): run(config=config)

    def test_website_owned_title_correction_updates_not_duplicates(self):
        output, state, _ = run(honors=[honor()], talks=[talk()])
        changed, _, report = run(output, [honor("Corrected honor")], [talk("New venue：邀请报告：《Corrected topic》")], state=state)
        self.assertEqual(len(report["updated"]), 2)
        self.assertNotIn("New topic", changed)
        self.assertNotIn("New honor", changed)
        self.assertEqual(len(rows(changed, "talks")), 2)

    def test_website_deletion_never_deletes_cv_records(self):
        output, state, _ = run(honors=[honor()], talks=[talk()])
        after, _, report = run(output, state=state)
        self.assertIn("New topic", after)
        self.assertIn("New honor", after)
        self.assertEqual(len(report["retained"]), 2)

    def test_manually_edited_managed_entry_is_not_overwritten_or_duplicated(self):
        output, state, _ = run(talks=[talk()])
        manually_edited = output.replace("New topic", "My edited topic")
        after, _, report = run(manually_edited, talks=[talk("New venue：邀请报告：《Website correction》")], state=state)
        self.assertIn("My edited topic", after)
        self.assertNotIn("Website correction", after)
        self.assertEqual(len(rows(after, "talks")), 2)
        self.assertTrue(report["review"])

    def test_unresolved_legacy_source_change_stays_in_review(self):
        source = honor("Legacy honor", 2022)
        output, state, _ = run(honors=[source])
        source["title"] = "Corrected website wording"
        after, state2, report = run(output, honors=[source], state=state)
        self.assertEqual(len(report["review"]), 1)
        again, _, report2 = run(after, honors=[source], state=state2)
        self.assertEqual(again, after)
        self.assertEqual(len(report2["review"]), 1)
        self.assertIn("Legacy honor（extra qualification）", again)


    def test_non_talk_activities_not_misclassified(self):
        titles = ["大会圆桌讨论：《A》", "MIND Poster Session：《B》", "荣获新奖", "项目启动会", "NEWCAS Special Session: Session", "会议专题主席", "新闻报道：《研究结果》"]
        output, _, report = run(talks=[talk(t, identifier=str(i)) for i, t in enumerate(titles)])
        self.assertEqual(len(rows(output, "talks")), 1)
        self.assertEqual(len(report["skipped"]), len(titles))

    def test_ambiguous_meeting_requires_review(self):
        output, _, report = run(talks=[talk("医院：临床应用研讨会")])
        self.assertEqual(len(rows(output, "talks")), 1)
        self.assertEqual(len(report["review"]), 1)

    def test_explicit_website_category_includes_without_keyword(self):
        item = talk("Institute event: A topic")
        item["cv"] = {"kind": "invited-talk"}
        output, _, report = run(talks=[item])
        self.assertEqual(len(report["added"]), 1)

    def test_explicit_exclusion_wins_over_keyword(self):
        item = talk(); item["cv"] = {"include": False}
        output, _, report = run(talks=[item])
        self.assertEqual(len(rows(output, "talks")), 1)

    def test_month_precision_does_not_invent_a_day(self):
        item=talk("NEWCAS：邀请报告：《Confirmed topic》",day="2022.06")
        output,state,report=run(talks=[item])
        self.assertIn("（2022年6月）",output)
        self.assertNotIn("2022年6月1日",output)
        self.assertEqual(state["sources"]["talks"][event_key(item)]["snapshot"]["date"],"2022-06")
        self.assertEqual(len(report["added"]),1)

    def test_month_precision_fallback_identity_preserves_precision(self):
        item=talk(day="2022.06");item.pop("id")
        self.assertTrue(event_key(item).startswith("talk:2022-06:"))
        self.assertNotIn("2022-06-01",event_key(item))

    def test_moderator_is_not_imported_as_talk(self):
        item=talk("医院研讨会（主持人）");item["cv"]={"kind":"moderator"}
        output,_,report=run(talks=[item])
        self.assertEqual(len(rows(output,"talks")),1)
        self.assertEqual(len(report["skipped"]),1)
        self.assertEqual(report["review"],[])


    def test_future_event_is_not_a_completed_talk(self):
        output, _, report = run(talks=[talk(day="2027.1.1")])
        self.assertEqual(len(report["added"]), 0)
        self.assertEqual(len(report["review"]), 1)

    def test_hold_keeps_legacy_topic_and_does_not_duplicate(self):
        item = talk("Original venue：邀请报告：《Different topic》", "2021.5.20")
        config = deepcopy(CONFIG)
        config["talk_decisions"][event_key(item)] = {"action": "hold", "legacy_contains": "Original venue", "reason": "Conflicting report title"}
        output, state, report = run(talks=[item], config=config)
        self.assertIn("Old topic", output)
        self.assertNotIn("Different topic", output)
        self.assertEqual(len(report["review"]), 1)
        _, _, repeated = run(output, talks=[item], config=config, state=state)
        self.assertEqual(len(repeated["review"]), 1)

    def test_dates_and_topic_superscript_preserved(self):
        output, _, _ = run(talks=[talk("ICAC 2026：邀请报告：《0.00022mm<sup>2</sup>/electrode & chips》")])
        self.assertIn("²", output)
        self.assertIn("2026年9月20日", output)
        self.assertIn("& chips", output)

    def test_html_is_not_executable_and_tex_is_escaped(self):
        value = website_markdown('<script>bad()</script><b>Title</b> <sup>2</sup> \\input{x} &amp; more')
        self.assertNotIn("bad()", value)
        self.assertNotIn("<b>", value)
        self.assertIn(r"\\input{x}", value)
        self.assertIn("²", value)

    def test_two_distinct_ids_allow_same_day_venue(self):
        a, b = talk(), talk("New venue：邀请报告：《Second topic》", identifier="t2")
        _, _, report = run(talks=[a, b])
        self.assertEqual(len(report["added"]), 2)

    def test_ambiguous_fallback_identity_fails_closed(self):
        a, b = talk(), talk("New venue：邀请报告：《Second topic》")
        del a["id"]; del b["id"]
        with self.assertRaises(ValueError): run(talks=[a, b])

    def test_missing_section_fails_closed(self):
        with self.assertRaises(ValueError): run(CONTENT.replace("## 邀请报告", "## Different heading"), talks=[talk()])

    def test_invalid_date_fails_closed(self):
        with self.assertRaises(ValueError): run(talks=[talk(day="2026.2.31")])

    def test_month_only_old_record_remains_month_only(self):
        output, _, _ = run(talks=[talk()])
        self.assertIn("2021年5月，中国杭州", output)
        self.assertNotIn("2021年5月1日", output)


class WorkflowTests(unittest.TestCase):
    def make_fixture(self, base):
        repo, cv = Path(base), Path(base) / "CV/latex"
        (repo / "data").mkdir()
        (cv / "templates").mkdir(parents=True)
        (cv / "content.md").write_text(CONTENT, encoding="utf-8")
        (cv / "templates/layout.tex").write_text("BEGIN\n%%CV_BODY%%\nEND", encoding="utf-8")
        (repo / "data/zh-home.json").write_text(json.dumps({"selectedHonors": [honor()]}), encoding="utf-8")
        (repo / "data/coverage.json").write_text(json.dumps({"items": [talk()]}), encoding="utf-8")
        (cv / "website-sync.json").write_text(json.dumps(CONFIG), encoding="utf-8")
        return repo, cv

    def test_check_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo, cv = self.make_fixture(tmp)
            before = {str(p): p.read_bytes() for p in repo.rglob("*") if p.is_file()}
            code = update(repo, cv, check=True, tex_only=True)
            after = {str(p): p.read_bytes() for p in repo.rglob("*") if p.is_file()}
            self.assertEqual(code, 1)
            self.assertEqual(before, after)

    def test_invalid_input_does_not_partially_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo, cv = self.make_fixture(tmp)
            original = (cv / "content.md").read_bytes()
            (repo / "data/coverage.json").write_text(json.dumps({"items": [talk(day="invalid")]}), encoding="utf-8")
            with self.assertRaises(ValueError): synchronize(repo, cv)
            self.assertEqual((cv / "content.md").read_bytes(), original)
            self.assertFalse((cv / "website-sync-state.json").exists())

    def test_template_edit_allowed_but_editor_edit_protected(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo, cv = self.make_fixture(tmp)
            build(cv / "content.md", cv / "templates/layout.tex", cv / "cv.tex")
            (cv / "templates/layout.tex").write_text("NEW\n%%CV_BODY%%", encoding="utf-8")
            ensure_editor_safe(cv)
            (cv / "cv.tex").write_text("Manual editor change", encoding="utf-8")
            with self.assertRaises(ValueError): update(repo, cv, tex_only=True)
            self.assertEqual((cv / "content.md").read_text(encoding="utf-8"), CONTENT)

    def test_sync_tex_only_does_not_compile(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo, cv = self.make_fixture(tmp)
            with patch("update_cv.compile_pdf") as compile_mock:
                self.assertEqual(update(repo, cv, tex_only=True), 0)
                compile_mock.assert_not_called()
            self.assertTrue((cv / "cv.tex").exists())
            self.assertTrue((cv / "website-sync-state.json").exists())
            self.assertFalse((cv / "cv.pdf").exists())
            self.assertEqual(update(repo, cv, check=True, tex_only=True), 0)

    def test_public_cv_is_a_copy_of_only_the_completed_pdf(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo, cv = self.make_fixture(tmp)
            (cv / "cv.pdf").write_bytes(b"%PDF-website-test")
            public = refresh_public_pdf(repo, cv / "cv.pdf")
            self.assertEqual(public.relative_to(repo).as_posix(), "static/assets/cv/jie-yang-cv.pdf")
            self.assertEqual(public.read_bytes(), (cv / "cv.pdf").read_bytes())
            self.assertEqual(refresh_public_pdf(repo, cv / "cv.pdf"), public)
            self.assertFalse((repo / "static/assets/cv/content.md").exists())

    def test_public_cv_rejects_non_pdf_input_before_copying(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo, cv = self.make_fixture(tmp)
            (cv / "cv.pdf").write_bytes(b"NOT A PDF")
            with self.assertRaises(ValueError): refresh_public_pdf(repo, cv / "cv.pdf")
            self.assertFalse((repo / "static/assets/cv/jie-yang-cv.pdf").exists())

    def test_pdf_build_copies_approved_artifact_and_detects_stale_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo, cv = self.make_fixture(tmp)
            def compile_fixture(*args, **kwargs):
                pdf = cv / "cv.pdf"
                pdf.write_bytes(b"%PDF-test")
                return pdf
            with patch("update_cv.compile_pdf", side_effect=compile_fixture):
                self.assertEqual(update(repo, cv), 0)
            public = repo / "static/assets/cv/jie-yang-cv.pdf"
            self.assertEqual(public.read_bytes(), (cv / "cv.pdf").read_bytes())
            self.assertEqual(update(repo, cv, check=True), 0)
            public.write_bytes(b"%PDF-old")
            self.assertEqual(update(repo, cv, check=True), 1)

    def test_compilation_failure_is_not_reported_as_fresh_pdf(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo, cv = self.make_fixture(tmp)
            (cv / "cv.pdf").write_bytes(b"OLD PDF")
            with patch("update_cv.compile_pdf", side_effect=PermissionError("PDF locked")):
                with self.assertRaises(PermissionError): update(repo, cv)
            self.assertEqual((cv / "cv.pdf").read_bytes(), b"OLD PDF")
            self.assertFalse((cv / "cv.pdf.build.json").exists())
            self.assertEqual(update(repo, cv, check=True), 1)


if __name__ == "__main__":
    unittest.main()
