# -*- coding: utf-8 -*-
"""逐页截图学镜概念稿，验证所有页面浅色效果"""
import sys
from playwright.sync_api import sync_playwright

url = "file:///C:/Users/19900/Projects/mathmirror/landing/ui-mockup-b.html"
outdir = r"C:\Users\19900\Projects\mathmirror\landing\_shots"
names = ["home", "chat", "resources", "assignments", "feedback", "privacy"]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(url, wait_until="networkidle")
    page.wait_for_timeout(800)

    for i, name in enumerate(names):
        page.evaluate("go(%d)" % i)
        page.wait_for_timeout(500)
        out = "%s/page-%s.png" % (outdir, name)
        page.screenshot(path=out)
        print("saved:", out)

    browser.close()
print("全部页面截图完成")
