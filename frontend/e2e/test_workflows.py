"""Browser regression tests with synthetic, intercepted API responses only."""
import json
import os
from pathlib import Path
import subprocess
import time
import unittest
import urllib.request
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

FRONTEND = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:4173"
FAMILY = dict(id=1, name="Synthetic family", person_prefix="demo00", person_next_number=7, people_count=6)
PEOPLE = [dict(id=i, family_id=1, person_no=f"demo00-{i:08}", name=name,
               generation=generation, gender=gender, remark="Synthetic test record", source=None,
               has_children=i in (1, 4, 5))
          for i, name, generation, gender in [(1, "Root", 1, "male"), (2, "Partner One", 1, "female"),
              (3, "Partner Two", 1, "female"), (4, "Child", 2, "male"),
              (5, "Grandchild", 3, "male"), (6, "Target", 4, "male")]]


class Workflows(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = subprocess.Popen(["node", "node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
                                      cwd=FRONTEND, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            if cls.server.poll() is not None:
                raise RuntimeError("Test preview server could not start on port 4173")
            try:
                urllib.request.urlopen(BASE, timeout=1).close()
                break
            except OSError:
                time.sleep(.1)
        else:
            cls.server.terminate()
            raise RuntimeError("Test preview server timed out")
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True, channel=os.getenv("BROWSER_CHANNEL") or None)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.terminate()
        cls.server.wait(timeout=10)

    def setUp(self):
        self.context = self.browser.new_context(viewport=dict(width=1440, height=900), accept_downloads=True)
        self.page = self.context.new_page()
        self.errors, self.unexpected = [], []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.context.route("**/api/**", self.respond)

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])
        self.assertEqual(self.unexpected, [])

    def respond(self, route):
        request = route.request
        url = urlparse(request.url)
        params = parse_qs(url.query)
        path = url.path
        result = None
        if request.method != "GET":
            self.unexpected.append((request.method, path))
        elif path == "/api/families":
            result = dict(families=[FAMILY], demoReadOnly=getattr(self, 'demo_read_only', False))
        elif path == "/api/families/1/export":
            result = dict(version=1, family=FAMILY, persons=PEOPLE, relations=[])
        elif path == "/api/persons/search":
            query = params.get("q", [""])[0].lower()
            people = [p for p in PEOPLE if query in p["name"].lower()]
            result = dict(results=people, total=len(people))
        elif path.startswith("/api/persons/"):
            person = PEOPLE[int(path.rsplit("/", 1)[1]) - 1]
            result = dict(person=person, relations=[], siblings=[])
        elif path == "/api/graph/tree":
            person_id = int(params.get("personId", [1])[0])
            child = {1: 4, 4: 5, 5: 6}.get(person_id)
            children = [PEOPLE[child - 1]] if child and params.get("offset", ["0"])[0] == "0" else []
            result = dict(person=PEOPLE[person_id - 1], children=children,
                          spouses=PEOPLE[1:3] if person_id == 1 else [], nextOffset=None)
        elif path == "/api/graph/tree-path":
            result = dict(found=True, path=[1, 4, 5, 6], spouseId=None)
        elif path == "/api/validation/anomalies":
            result = dict(anomalies=[])
        else:
            self.unexpected.append((request.method, path))
        route.fulfill(status=200 if result is not None else 500, content_type="application/json", body=json.dumps(result or {}))

    def tree(self):
        self.page.goto(BASE + "/families/1/tree")
        expect(self.page.locator(".tree-title .tree-status")).to_have_text("5")

    def more(self, label):
        self.page.get_by_role("button", name="更多", exact=True).click()
        self.page.get_by_role("menuitem", name=label, exact=True).click()

    def view_mode(self, label):
        self.page.locator('.tree-tools .tree-view-group').get_by_role('button').first.click()
        self.page.get_by_role('menuitem', name=label, exact=True).click()

    def test_find_unloaded_descendant_and_radial_path(self):
        self.tree()
        self.page.locator(".tree-tools input").fill("Target")
        self.page.get_by_role("option").filter(has_text="Target").click()
        self.page.get_by_role("button", name="查找定位", exact=True).click()
        expect(self.page.locator(".tree-node.search-match")).to_contain_text("Target")
        expect(self.page.locator(".tree-title .tree-status")).to_have_text("6")
        self.view_mode("径向全景")
        expect(self.page.locator(".radial-dot.search-match")).to_have_count(1)
        expect(self.page.locator(".radial-info-panel")).to_contain_text("Target")
        expect(self.page.locator(".tree-lines path.highlighted")).to_have_count(3)
        self.page.get_by_role("button", name="查看分支", exact=True).click()
        expect(self.page.locator(".tree-title .tree-status")).to_have_text("1")
        expect(self.page.locator(".radial-dot")).to_have_count(1)

    def test_fullscreen_shared_picker_and_view_menu(self):
        self.tree()
        self.more("全屏")
        header = self.page.locator(".tree-display-header")
        header.get_by_role("button", name="视图：树形", exact=False).click()
        item = self.page.get_by_role("menuitem", name="树形点图", exact=True)
        self.assertTrue(item.evaluate("el => document.fullscreenElement.contains(el)"))
        item.click()
        header.locator("input[role=combobox]").fill("Target")
        option = self.page.get_by_role("option").filter(has_text="Target")
        self.assertTrue(option.evaluate("el => document.fullscreenElement.contains(el)"))
        option.click()
        header.get_by_role("button", name="查找定位", exact=True).click()
        expect(self.page.locator(".radial-dot.search-match")).to_have_count(1)
        expect(self.page.locator(".tree-lines path.highlighted")).to_have_count(3)

    def test_fullscreen_detail_and_spouse_popup_remain_visible(self):
        self.tree()
        self.more("全屏")
        self.page.wait_for_function("document.fullscreenElement !== null")
        self.page.locator(".spouse-more").click()
        popup = self.page.locator(".el-popover:visible")
        expect(popup).to_contain_text("Partner Two")
        self.assertTrue(popup.evaluate("el => document.fullscreenElement.contains(el)"))
        popup.get_by_role("button", name="Partner Two", exact=True).click()
        drawer = self.page.locator(".el-drawer")
        expect(drawer).to_contain_text("Partner Two")
        self.assertTrue(drawer.evaluate("el => document.fullscreenElement.contains(el)"))
        self.page.wait_for_function("() => {const el=document.querySelector('.el-drawer');if(!el)return false;const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}")

    def test_export_svg_contains_names_and_geometry(self):
        self.tree()
        self.more("导出家族树")
        dialog = self.page.get_by_role("dialog")
        with self.page.expect_download() as downloaded:
            dialog.get_by_role("button", name="导出", exact=True).click()
        svg = Path(downloaded.value.path()).read_text(encoding="utf-8")
        self.assertIn("<svg", svg)
        self.assertIn("Root", svg)
        self.assertIn("Partner Two", svg)
        self.assertIn("<path", svg)

    def test_language_switch_and_mobile_radial_canvas(self):
        self.tree()
        self.page.get_by_role("button", name="EN", exact=True).click()
        self.view_mode("Radial")
        self.page.set_viewport_size(dict(width=390, height=844))
        expect(self.page.locator(".radial-dot")).to_have_count(3)
        expect(self.page.get_by_role("heading", name="Family tree", exact=True)).to_be_visible()
        self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), 391)
        viewport = self.page.locator(".tree-viewport").bounding_box()
        self.assertGreater(viewport["height"], 100)
        self.page.locator(".radial-dot").first.focus()
        expect(self.page.locator(".radial-info-panel")).to_contain_text("Root")

    def test_people_header_sort_and_gender_filter(self):
        self.page.goto(BASE + '/families/1/people')
        self.page.get_by_role('button', name='上溯 ↕', exact=True).click()
        expect(self.page).to_have_url(__import__('re').compile('sort=ancestor_generations_asc'))
        self.page.get_by_role('button', name='上溯 ↑', exact=True).click()
        expect(self.page).to_have_url(__import__('re').compile('sort=ancestor_generations_desc'))
        self.page.get_by_role('button', name='上溯 ↓', exact=True).click()
        expect(self.page.get_by_role('button', name='上溯 ↕', exact=True)).to_be_visible()
        self.page.locator('.gender-filter .el-radio-button').filter(has_text='女').click()
        self.page.get_by_role('button', name='查询', exact=True).click()
        expect(self.page).to_have_url(__import__('re').compile('gender=female'))
        generation = self.page.get_by_role('textbox', name='世代', exact=True)
        generation.fill('19')
        self.page.get_by_role('button', name='查询', exact=True).click()
        expect(generation).to_have_value('第 19 世')
        expect(self.page).to_have_url(__import__('re').compile('generation=19'))
        generation.fill('')
        self.page.get_by_role('button', name='查询', exact=True).click()
        expect(generation).to_have_value('')

    def test_demo_hides_write_controls_and_prevents_edit_url(self):
        self.demo_read_only = True
        self.page.goto(BASE + '/')
        expect(self.page.get_by_text('只读演示', exact=True)).to_be_visible()
        for name in ('新增家谱', '导入家谱', '编辑资料', '删除'):
            expect(self.page.get_by_role('button', name=name, exact=True)).to_have_count(0)
        self.page.goto(BASE + '/families/1/people')
        expect(self.page.get_by_role('button', name='添加人物', exact=True)).to_have_count(0)
        expect(self.page.get_by_role('button', name='删除', exact=True)).to_have_count(0)
        self.page.goto(BASE + '/families/1/person/1?edit=1')
        expect(self.page.get_by_text('只读演示', exact=True)).to_be_visible()
        for name in ('编辑资料', '删除人物', '添加关系', '保存'):
            expect(self.page.get_by_role('button', name=name, exact=True)).to_have_count(0)
        self.page.goto(BASE + '/families/1/settings')
        expect(self.page.get_by_role('button', name='保存设置', exact=True)).to_have_count(0)
        expect(self.page.locator('.settings-form input').first).to_be_disabled()
        with self.page.expect_download():
            self.page.get_by_role('button', name='导出 JSON 备份', exact=True).click()

    def test_tree_toolbar_groups_wrap_together(self):
        self.tree()
        for language in ("EN", "中文"):
            self.page.get_by_role("button", name=language, exact=True).click()
            for width in (1920, 1600, 1440, 1200, 1000, 700, 390):
                with self.subTest(language=language, width=width):
                    self.page.set_viewport_size(dict(width=width, height=900))
                    tools = self.page.locator(".tree-page-heading .tree-tools")
                    person = tools.locator(".tree-person-group").bounding_box()
                    canvas = tools.locator(".tree-canvas-group").bounding_box()
                    view = tools.locator(".tree-view-group").bounding_box()
                    self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), width + 1)
                    if width in (1920, 1600):
                        title = self.page.locator(".tree-page-heading .tree-title").bounding_box()
                        self.assertAlmostEqual(title["y"] + title["height"] / 2,
                                               person["y"] + person["height"] / 2, delta=2)
                        self.assertAlmostEqual(canvas["y"] + canvas["height"] / 2,
                                               view["y"] + view["height"] / 2, delta=2)
                        self.assertAlmostEqual(person["y"] + person["height"] / 2,
                                               view["y"] + view["height"] / 2, delta=2)
                    if width in (1200, 1000, 700):
                        self.assertGreaterEqual(canvas["y"], person["y"] + person["height"])
                        self.assertAlmostEqual(canvas["y"] + canvas["height"] / 2,
                                               view["y"] + view["height"] / 2, delta=2)

    def test_tree_dots_preserve_direction_details_and_export(self):
        self.tree()
        self.view_mode("树形点图")
        dots = self.page.locator(".radial-dot")
        expect(dots).to_have_count(3)
        root = self.page.get_by_role("button", name="Root ·", exact=False)
        child = self.page.get_by_role("button", name="Child · 男", exact=True)
        self.assertGreater(root.bounding_box()["y"], child.bounding_box()["y"])
        root.focus()
        expect(self.page.locator(".radial-info-panel")).to_contain_text("Partner Two")
        expect(self.page.locator(".radial-info-panel")).to_contain_text("Synthetic test record")
        root.click()
        expect(root).to_have_attribute("aria-pressed", "true")
        child.hover()
        expect(self.page.locator(".radial-info-heading")).to_contain_text("Root")
        expect(self.page.locator(".el-drawer")).not_to_be_visible()
        child.click()
        expect(self.page.locator(".radial-info-heading")).to_contain_text("Child")
        self.page.get_by_role("button", name="关闭人物信息", exact=True).click()
        root.hover()
        expect(self.page.locator(".radial-info-heading")).to_contain_text("Root")
        expect(root).to_have_attribute("aria-pressed", "false")
        expect(dots).to_have_count(3)
        (FRONTEND / "test-results").mkdir(exist_ok=True)
        self.page.screenshot(path=str(FRONTEND / "test-results/tree-dots-desktop.png"))
        self.more("导出家族树")
        dialog = self.page.get_by_role("dialog")
        with self.page.expect_download() as downloaded:
            dialog.get_by_role("button", name="导出", exact=True).click()
        svg = Path(downloaded.value.path()).read_text(encoding="utf-8")
        self.assertIn("<circle", svg)
        self.assertIn("Root", svg)
        self.assertIn("Partner Two", svg)
        self.assertNotIn('width="140"', svg)
        self.page.keyboard.press("Escape")
        self.page.get_by_role("button", name="EN", exact=True).click()
        expect(self.page.get_by_role("button", name="View: Tree dots", exact=False)).to_be_visible()
        self.page.set_viewport_size(dict(width=390, height=844))
        self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), 391)
        expect(dots).to_have_count(3)
        heading = self.page.get_by_role("heading", name="Family tree", exact=True).bounding_box()
        switch = self.page.get_by_role("button", name="View: Tree dots", exact=False).bounding_box()
        self.assertGreaterEqual(switch["y"], heading["y"] + heading["height"])
        self.page.screenshot(path=str(FRONTEND / "test-results/tree-dots-mobile.png"))
        self.view_mode("Tree")
        expect(self.page.locator(".tree-node")).to_have_count(3)

    def test_confirmation_can_cancel_without_write_on_narrow_screen(self):
        self.page.set_viewport_size(dict(width=700, height=844))
        self.page.goto(BASE + "/families/1/people")
        self.page.get_by_role("button", name="删除", exact=True).first.click()
        dialog = self.page.get_by_role("dialog")
        expect(dialog).to_contain_text("Root")
        box = self.page.locator(".el-message-box").bounding_box()
        self.assertLess(box["width"], 600)
        self.assertAlmostEqual(box["x"] + box["width"] / 2, 350, delta=8)
        dialog.get_by_role("button", name="取消", exact=True).click()
        expect(dialog).not_to_be_visible()

    def test_backup_download_shows_styled_success_message(self):
        self.page.goto(BASE + "/families/1/settings")
        with self.page.expect_download():
            self.page.get_by_role("button", name="导出 JSON 备份", exact=True).click()
        message = self.page.locator(".el-message--success")
        expect(message).to_contain_text("已导出家谱")
        expect(message).to_be_visible()
        self.assertEqual(message.evaluate("el => getComputedStyle(el).position"), "fixed")
        self.assertNotEqual(message.evaluate("el => getComputedStyle(el).backgroundColor"), "rgba(0, 0, 0, 0)")

    def test_settings_form_spacing_in_both_languages_and_screen_sizes(self):
        self.page.goto(BASE + "/families/1/settings")
        for language in ("EN", "中文"):
            self.page.get_by_role("button", name=language, exact=True).click()
            for width in (1440, 390):
                with self.subTest(language=language, width=width):
                    self.page.set_viewport_size(dict(width=width, height=900))
                    fields = self.page.locator(".settings-grid .el-form-item")
                    expect(fields).to_have_count(3)
                    previous = None
                    for index, field in enumerate(fields.all()):
                        label = field.locator(".el-form-item__label").bounding_box()
                        control = field.locator(".el-input, .el-textarea").bounding_box()
                        self.assertGreaterEqual(control["y"] - label["y"] - label["height"], 6)
                        if previous and (width == 390 or index == 2):
                            self.assertGreaterEqual(label["y"] - previous["y"] - previous["height"], 12)
                        elif previous:
                            self.assertAlmostEqual(control["y"], previous["y"], delta=1)
                            self.assertGreaterEqual(control["x"] - previous["x"] - previous["width"], 12)
                        previous = control
                    self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), width + 1)


if __name__ == "__main__":
    unittest.main()
