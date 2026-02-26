"""
E2E browser tests for Mega Tanks.
Requires: pip install pytest-playwright && playwright install chromium
Run (with server on 6666): pytest tests/e2e/test_mega_tanks_browser.py -v [--headed]
"""

import pytest

BASE_URL = "http://localhost:6666"

pytestmark = pytest.mark.skipif(
    True,  # Set to False after: pip install pytest-playwright && playwright install chromium
    reason="Requires pytest-playwright",
)


@pytest.fixture
def page(browser):
    """New page for each test."""
    return browser.new_page()


class TestTitleScreen:
    def test_page_title_is_mega_tanks(self, page):
        page.goto(BASE_URL)
        assert page.title() == "MEGA TANKS"

    def test_namco_line_absent(self, page):
        page.goto(BASE_URL)
        body = page.locator("body")
        assert "NAMCO" not in body.inner_text()

    def test_mega_tanks_logo_visible(self, page):
        page.goto(BASE_URL)
        assert page.locator(".title-line1").inner_text() == "MEGA"
        assert page.locator(".title-line2").inner_text() == "TANKS"

    def test_construction_button_exists(self, page):
        page.goto(BASE_URL)
        btn = page.get_by_role("button", name="CONSTRUCTION")
        assert btn.is_visible()

    def test_play_map_button_exists(self, page):
        page.goto(BASE_URL)
        btn = page.get_by_role("button", name="PLAY MAP")
        assert btn.is_visible()


class TestEditorScreen:
    def test_navigate_to_editor(self, page):
        page.goto(BASE_URL)
        page.get_by_role("button", name="CONSTRUCTION").click()
        assert page.locator("#editor-screen").is_visible()
        assert page.locator("#editor-canvas").is_visible()

    def test_canvas_no_frame(self, page):
        page.goto(BASE_URL)
        page.get_by_role("button", name="CONSTRUCTION").click()
        canvas = page.locator("#editor-canvas")
        styles = canvas.evaluate("el => ({ border: getComputedStyle(el).border, boxShadow: getComputedStyle(el).boxShadow })")
        # Should have no thick decorative border (10px or similar)
        assert "10px" not in styles.get("border", "")


class TestPlayScreen:
    def test_xc_fire_in_key_guide(self, page):
        page.goto(BASE_URL)
        page.get_by_role("button", name="CONSTRUCTION").click()
        # Need a map to play - check legend text
        legend = page.locator(".nes-legend").last
        assert "X/C" in legend.inner_text() or "FIRE" in legend.inner_text()
