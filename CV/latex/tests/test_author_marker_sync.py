from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from sync_author_markers import cv_role, normalize_cv_style, plan, website_authors
from sync_publications import load_publications, normalize


class AuthorMarkerSyncTests(unittest.TestCase):
    def test_name_bold_role_not_bold_and_no_added_space(self):
        self.assertEqual(normalize_cv_style(r'**J. Yang\***, M. Sawan\*'),
                         r'**J. Yang**\*, M. Sawan\*')
        self.assertEqual(normalize_cv_style(r'**J. Yang\*,**'), r'**J. Yang**\*,')
        self.assertEqual(cv_role('A. Chen, J. Yang*#, M. Sawan*'), '*#')

    def test_website_owner_role_and_other_authors(self):
        self.assertEqual(website_authors('A. Chen, <strong>J. Yang*</strong>, M. Sawan*', ''),
                         'A. Chen, <strong>J. Yang</strong>, M. Sawan<sup>*</sup>')
        self.assertEqual(website_authors('A. Chen, <strong>J. Yang*</strong>, M. Sawan*', '*#'),
                         'A. Chen, <strong>J. Yang</strong><sup>*#</sup>, M. Sawan<sup>*</sup>')
        self.assertEqual(website_authors('A. Chen, <strong>J. Yang</strong><sup>*</sup>', '*'),
                         'A. Chen, <strong>J. Yang</strong><sup>*</sup>')
        self.assertIsNone(website_authors('S. Cong, C. Zhe, Y. Jie, W. Nanjian', ''))

    def test_repository_is_synchronized_without_guessing_unmatched(self):
        source, styled, changes, unresolved, roles = plan()
        self.assertEqual(source, styled)
        self.assertFalse(changes)
        self.assertEqual(len(roles), 148)
        self.assertEqual(unresolved, [])
        self.assertNotIn("mobilegpuimplementation", " ".join(title for _, title in roles))
        self.assertEqual(roles[('journals', normalize('A Resource-Efficient Algorithm-Hardware Co-Design Towards Semi-Supervised Neurological Symptoms Prediction'))], '')
        self.assertEqual(roles[('conferences', normalize('Binary is All You Need: Ultra-Efficient Arrhythmia Detection with a Binary-Only Compressive System'))], '')
        compact = [p for p in load_publications(ROOT.parents[1]) if p['title'] == 'A compact PE memory for vision chips']
        self.assertEqual(len(compact), 1)
        self.assertIn('<strong>J. Yang</strong>', compact[0]['authors'])
        self.assertNotIn('Y. Jie', compact[0]['authors'])
        cover = [p for p in load_publications(ROOT.parents[1]) if p.get('doi') == '10.3724/cjos.2025.044']
        self.assertEqual(len(cover), 1)
        self.assertEqual(cover[0]['title'], '面向边缘智能的神经形态计算芯片与部署')
        self.assertEqual(cover[0]['titleEn'], 'Neuromorphic computing chips and deployment for edge intelligence')
        self.assertIn('"面向边缘智能的神经形态计算芯片与部署"', source)
        self.assertIn('《面向边缘智能的神经形态计算芯片与部署》', source)


if __name__ == '__main__':
    unittest.main()
