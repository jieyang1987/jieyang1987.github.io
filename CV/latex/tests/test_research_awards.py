import copy
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from sync_research_awards import form_entry, plan_research_awards, section_span
from build import render

CONTENT = '# CV\n\n## 个人荣誉\n\n2025年，个人奖项\n\n## 项目经历\n\n旧项目不改动。\n\n## 邀请报告\n\n1. 旧报告（2023年1月）\n'
AWARDS = [
    {'year': 2026, 'venue': '全球脑机接口大赛', 'distinction': '创新创业奖', 'awardee': '西湖灵犀', 'project': '植入式汉语脑机通信系统'},
    {'year': 2025, 'venue': '期刊 A', 'distinction': '当期封面', 'cover': 'cover.webp', 'paperTitle': 'A paper'},
    {'year': 2025, 'venue': '会议 B', 'distinction': 'Best Poster Award'},
]


class ResearchAwardsTests(unittest.TestCase):
    def test_single_list_after_personal_honors_without_subsections(self):
        merged, state, report = plan_research_awards(CONTENT, {'paperAwards': AWARDS})
        self.assertEqual(report['count'], 3)
        self.assertLess(merged.index('## 个人荣誉'), merged.index('## 研究成果荣誉'))
        self.assertLess(merged.index('## 研究成果荣誉'), merged.index('## 项目经历'))
        section = merged[slice(*section_span(merged))]
        self.assertNotIn('###', section)
        self.assertEqual(section.count('\n- '), 3)
        self.assertIn('获奖主体：西湖灵犀', section)
        self.assertIn('期刊 A · 当期封面', section)
        self.assertIn('会议 B · Best Poster Award', section)
        self.assertNotIn('获奖主体：杨杰', section)
        self.assertEqual(state['research_awards']['count'], 3)

    def test_author_role_is_not_guessed_or_exported(self):
        items = [{**AWARDS[1], 'authorRole': '通讯作者'}]
        source, _, _ = plan_research_awards(CONTENT, {'paperAwards': items})
        self.assertNotIn('通讯作者', source)
        self.assertNotIn('论文：《会议 B》', source)

    def test_sorted_by_year_with_stable_same_year_order(self):
        items = [AWARDS[2], AWARDS[1], AWARDS[0]]
        source, _, _ = plan_research_awards(CONTENT, {'paperAwards': items})
        self.assertLess(source.index('2026年'), source.index('会议 B · Best Poster Award'))
        self.assertLess(source.index('会议 B · Best Poster Award'), source.index('期刊 A · 当期封面'))

    def test_repeating_without_source_change_is_idempotent(self):
        first, state, _ = plan_research_awards(CONTENT, {'paperAwards': AWARDS})
        second, again, report = plan_research_awards(first, {'paperAwards': AWARDS}, state)
        self.assertEqual(first, second)
        self.assertEqual(state, again)
        self.assertFalse(report['content_changed'])
        self.assertFalse(report['state_changed'])

    def test_website_change_updates_only_website_owned_section(self):
        first, state, _ = plan_research_awards(CONTENT, {'paperAwards': AWARDS})
        new = copy.deepcopy(AWARDS)
        new[0]['project'] = '已更正的项目名称'
        updated, _, report = plan_research_awards(first, {'paperAwards': new}, state)
        self.assertTrue(report['content_changed'])
        self.assertIn('已更正的项目名称', updated)
        self.assertNotIn('植入式汉语脑机通信系统', updated)
        self.assertEqual(updated.split('## 研究成果荣誉')[0], first.split('## 研究成果荣誉')[0])
        self.assertEqual(updated.split('## 项目经历')[1], first.split('## 项目经历')[1])

    def test_manual_edits_are_not_silently_overwritten(self):
        first, state, _ = plan_research_awards(CONTENT, {'paperAwards': AWARDS})
        with self.assertRaisesRegex(ValueError, 'edited locally'):
            plan_research_awards(first.replace('Best Poster Award', '我手工补充的信息'), {'paperAwards': AWARDS}, state)

    def test_missing_team_recipient_or_cover_paper_fails_closed(self):
        for altered in ({**AWARDS[0], 'awardee': ''}, {**AWARDS[1], 'paperTitle': ''}):
            with self.assertRaises(ValueError): form_entry(altered)

    def test_missing_website_awards_fails_without_deleting_cv_history(self):
        source, state, _ = plan_research_awards(CONTENT, {'paperAwards': AWARDS})
        with self.assertRaises(ValueError): plan_research_awards(source, {'paperAwards': []}, state)
        self.assertIn('会议 B · Best Poster Award', source)

    def test_confirmed_poster_role_has_no_invented_paper_title(self):
        confirmed = {**AWARDS[2], 'authorRole': '通讯作者', 'cv': {'confirmedCorresponding': True}}
        text = form_entry(confirmed)
        self.assertIn('Best Poster Award**；通讯作者。', text)
        self.assertNotIn('论文：《', text)

    def test_teams_cannot_be_labeled_personal_corresponding_author(self):
        improper = {**AWARDS[0], 'authorRole': '通讯作者', 'cv': {'confirmedCorresponding': True}}
        with self.assertRaises(ValueError): form_entry(improper)

    def test_latex_year_column_is_separate_from_award_text(self):
        source, _, _ = plan_research_awards(CONTENT, {'paperAwards': AWARDS})
        latex = render(source)
        self.assertIn(r'\CVResearchAward{2026}{', latex)
        self.assertIn(r'\CVResearchAward{2025}{', latex)
        self.assertEqual(latex.count(r'\CVResearchAward{'), 3)
        self.assertEqual(latex.count(r'\CVSection{研究成果荣誉}'), 1)

    def test_real_website_has_ten_no_inferred_individual_awardees(self):
        import json
        root = ROOT.parents[1]
        home = json.loads((root / 'data/zh-home.json').read_text(encoding='utf-8'))
        source, _, report = plan_research_awards(CONTENT, home)
        self.assertEqual(report['count'], 10)
        assert source.count('获奖主体：') == 2
        assert source.count('当期封面') == 2
        assert source.count('Best Neuromorphic Paper') == 2
        self.assertNotIn('获奖主体：杨杰', source)
        self.assertEqual(source.count('；通讯作者。'), 7)  # Latest reviewed author list removes AICAS/"Binary" claim.


if __name__ == '__main__':
    unittest.main()
