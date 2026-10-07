from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build import academic_item_inline, blocks, build, inline, render, tex_escape


class BuildTests(unittest.TestCase):
    def test_tex_special_characters(self):
        self.assertEqual(tex_escape("10% & A_B #1 $x {y}"), r"10\% \& A\_B \#1 \$x \{y\}")

    def test_raw_tex_is_not_executable(self):
        self.assertEqual(inline(r"\\input{secret}"), r"\textbackslash{}input\{secret\}")

    def test_bold_and_corresponding_author_star(self):
        self.assertEqual(inline(r"**J. Yang\***"), r"\textbf{J. Yang*}")
        self.assertEqual(inline(r"**J. Yang\***", True), "J. Yang*")

    def test_combined_bold_and_italic(self):
        self.assertEqual(inline("***IEEE Journal***"), r"\CVStrongEm{IEEE Journal}")
        self.assertEqual(inline("***IEEE Journal***", True), "IEEE Journal")

    def test_superscript_and_subscript(self):
        self.assertEqual(inline("mm<sup>2</sup> V<sub>DD</sub>"), r"mm\textsuperscript{2} V\textsubscript{DD}")
        self.assertEqual(inline("**mm<sup>2</sup>**", True), "mm2")
        self.assertEqual(inline(r"**J. Yang**\*", True), "J. Yang*")
        self.assertEqual(academic_item_inline(r'**J. Yang**\*, M. Sawan\*, "Title"'), r'\textbf{J. Yang}\textsuperscript{*}, M. Sawan\textsuperscript{*}, "Title"')
        self.assertEqual(academic_item_inline(r'S. Zhao#, **J. Yang**\*#, "Title"'), r'S. Zhao\textsuperscript{\#}, \textbf{J. Yang}\textsuperscript{*\#}, "Title"')

    def test_scientific_symbols(self):
        self.assertEqual(inline("1µW 2μW"), "1µW 2µW")

    def test_link_target_and_display_text_are_distinct(self):
        self.assertEqual(inline("[short](https://example.org/?a=1&b=2)"), r"\href{https://example.org/?a=1\&b=2}{short}")
        self.assertEqual(inline("[short](https://example.org/)", True), "short")

    def test_reject_unsafe_link(self):
        with self.assertRaises(ValueError): inline("[bad](file:///secret)")

    def test_nested_emphasis_in_link(self):
        self.assertEqual(inline("[**email**](mailto:name@example.org)"), r"\href{mailto:name@example.org}{\textbf{email}}")

    def test_structure_and_wrapped_paragraphs(self):
        self.assertEqual(list(blocks("# CV\n\n## Papers\n\n16. A\ncontinued\n\n    - Detail\n\n> Note")), [("h1", "", "CV"), ("h2", "", "Papers"), ("item", "16.", "A continued"), ("bullet-sub", "", "Detail"), ("detail", "", "Note")])

    def test_contact_fields_do_not_leak_markdown(self):
        output = render("## 个人基本信息\n\n**<u>姓名:</u>**    **杨杰**\n\n<u>E-mail:</u> [mail](mailto:a@b.org)")
        self.assertIn(r"\CVField{\textbf{\CVUnderline{姓名:}}}{\textbf{杨杰}}", output)
        self.assertIn(r"\CVField{\CVUnderline{E-mail:}}{\href{mailto:a@b.org}{mail}}", output)
        self.assertNotIn("<u>", output)
        self.assertNotIn("**", output)

    def test_heading_and_explicit_number(self):
        output = render("# CV\n\n## Papers\n\n#### 2025\n\n16. Paper")
        self.assertIn(r"\CVTitle{CV}", output)
        self.assertIn(r"\CVItem{16.}{Paper}", output)

    def test_real_content_has_no_unconverted_markup(self):
        output = render((ROOT / "content.md").read_text(encoding="utf-8"))
        for marker in ("<sup>", "</sup>", "<sub>", "</sub>", "<u>", "</u>", "**"):
            self.assertNotIn(marker, output)

    def test_publication_mode_and_caption_are_separate(self):
        output = render("## 学术成果 (\\*为通信作者，#为共同第一作者)\n\n#### 2025\n\n1. Paper")
        self.assertIn(r"\CVSectionWithNote{学术成果}", output)
        self.assertIn(r"\CVReferenceMode", output)
        self.assertIn(r"\CVYear{2025}", output)

    def test_project_detail_is_centered_but_mentor_is_not(self):
        output = render("## 项目经历\n\nProject\n\n> Funding\n\n## 教育背景\n\nUniversity\n\n> Mentor")
        self.assertIn(r"\CVLeadParagraph{Project}", output)
        self.assertIn(r"\CVProjectDetail{Funding}", output)
        self.assertIn(r"\CVDetail{Mentor}", output)

    def test_research_title_uses_a_semantic_marker(self):
        self.assertEqual(render("#### ■ Topic"), r"\CVResearchTitle{Topic}")


    def test_color_accent_is_limited_to_emphasized_honors_and_projects(self):
        output = render("## 个人荣誉\n\n**Key honor**\n\nOrdinary honor\n\n## 项目经历\n\n**Project leader**\n\n> Funding")
        self.assertIn(r"\CVAccentParagraph{\textbf{Key honor}}", output)
        self.assertIn(r"\CVParagraph{Ordinary honor}", output)
        self.assertIn(r"\CVAccentLeadParagraph{\textbf{Project leader}}", output)
        self.assertIn(r"\CVProjectDetail{Funding}", output)

    def test_publications_do_not_receive_achievement_color(self):
        output = render("## 学术成果\n\n1. **J. Yang** Paper\n\n**Other scholarly material**")
        self.assertNotIn(r"\CVAccent", output)

    def test_scoped_colors_are_owned_by_template(self):
        template = (ROOT / "templates" / "layout.tex").read_text(encoding="utf-8")
        self.assertIn(r"\definecolor{CVAchievement}{HTML}{7D383B}", template)
        self.assertIn(r"\renewcommand{\CVUnderline}[1]{{\CJKunderline[textformat=\color{CVAchievement},format=\color{CVAchievement}]{##1}}}", template)
        self.assertNotIn("#7D383B", (ROOT / "content.md").read_text(encoding="utf-8"))


    def test_build_is_deterministic_and_standalone(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "cv.tex"
            build(output=dest)
            first = dest.read_bytes()
            build(output=dest)
            self.assertEqual(first, dest.read_bytes())
            text = first.decode("utf-8")
            self.assertNotIn("%%CV_BODY%%", text)
            self.assertNotIn(r"\input{", text)
            self.assertNotIn(r"\include{", text)
            self.assertEqual(text.count(r"\begin{document}"), 1)
            self.assertEqual(text.count(r"\end{document}"), 1)

    def test_template_requires_exactly_one_placeholder(self):
        with tempfile.TemporaryDirectory() as tmp:
            layout = Path(tmp) / "layout.tex"
            layout.write_text("no placeholder", encoding="utf-8")
            with self.assertRaises(ValueError): build(template=layout, output=Path(tmp) / "out.tex")


if __name__ == "__main__":
    unittest.main()
