from copy import deepcopy
from datetime import date
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from author_name_style import normalize_author_names,normalize_citation_authors
from build import inline
from sync_publications import plan_publications
from test_sync_publications import CONTENT,CONFIG,paper


class AuthorStyleTests(unittest.TestCase):
    def test_confirmed_full_names_use_initials(self):
        self.assertEqual(normalize_author_names('Yun-Hsuan Chen, Chi-Ying Tsui, Di Wu, Siyuan Li'),'Y-H. Chen, C-Y. Tsui, D. Wu, S. Li')

    def test_no_guessing_or_reordering_of_ambiguous_initials(self):
        text='Y. Chen, Y-H. Chen, C. Tsui, K. Cheng, K-T. Cheng'
        self.assertEqual(normalize_author_names(text),text)
        self.assertEqual(normalize_author_names('Kwang-Ting Tim Cheng, Tim Kwang-Ting Cheng'),'K-T. T. Cheng, T. K-T. Cheng')

    def test_roles_and_markup_survive_unchanged(self):
        text=r'**Yun-Hsuan Chen\***, <strong>Jie Yang</strong>, Chi-Ying Tsui<sup>\#</sup>'
        self.assertEqual(normalize_author_names(text),r'**Y-H. Chen\***, <strong>J. Yang</strong>, C-Y. Tsui<sup>\#</sup>')
        self.assertEqual(normalize_author_names('Jie Yang'),'J. Yang')

    def test_compound_family_names_are_not_truncated(self):
        self.assertEqual(normalize_author_names('Orly Yadid-Pecht, Douglas McDonald'),'O. Yadid-Pecht, D. McDonald')

    def test_only_author_prefix_is_touched(self):
        citation='Yun-Hsuan Chen, "A method by Yun-Hsuan Chen", *Venue*, 2024.'
        self.assertEqual(normalize_citation_authors(citation),'Y-H. Chen, "A method by Yun-Hsuan Chen", *Venue*, 2024.')

    def test_substring_names_are_not_rewritten(self):
        self.assertEqual(normalize_author_names('XJie Yang, Yun-Hsuan Chenfield'),'XJie Yang, Yun-Hsuan Chenfield')

    def test_legacy_only_reference_also_uses_style_and_stays_idempotent(self):
        content=CONTENT.replace('A. Chen, **J. Yang**, "Old conference topic"','Yun-Hsuan Chen, **Jie Yang**, "Old conference topic"')
        first,state,report=plan_publications(content,[],CONFIG,as_of=date(2026,10,6))
        self.assertIn('Y-H. Chen, **J. Yang**, "Old conference topic"',first)
        self.assertEqual(len(report['updated']),1)
        second,state2,report2=plan_publications(first,[],CONFIG,state,as_of=date(2026,10,6))
        self.assertEqual(first,second)
        self.assertFalse(report2['content_changed'])

    def test_preserved_legacy_base_uses_style_without_changing_stars(self):
        content=CONTENT.replace('A. Chen, **J. Yang\\***','Yun-Hsuan Chen, **J. Yang\\***')
        source=paper('Old journal topic',2024)
        source['authors']='Y-H. Chen, <strong>J. Yang*</strong>, M. Sawan*'
        first,state,_=plan_publications(content,[source],CONFIG,as_of=date(2026,10,6))
        self.assertIn(r'Y-H. Chen, **J. Yang\***, M. Sawan\*',first)
        second,state2,report2=plan_publications(first,[source],CONFIG,state,as_of=date(2026,10,6))
        self.assertEqual(first,second)
        self.assertEqual(state,state2)
        self.assertFalse(report2['updated'])


if __name__=='__main__':unittest.main()
