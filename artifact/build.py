#!/usr/bin/env python3
"""Inline index.html + styles.css + app.js + icon.svg into one page for publishing as a claude.ai Artifact.

Usage: python3 artifact/build.py   →  writes artifact/truckbook.html
The Artifact tool wraps the page in its own <!doctype html><head><body> skeleton, so this
file holds only the page content: <title>, styles, markup and the script.
"""
import base64, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
index = (root / 'index.html').read_text()
css = (root / 'styles.css').read_text()
js = (root / 'app.js').read_text()
icon = 'data:image/svg+xml;base64,' + base64.b64encode((root / 'icon.svg').read_bytes()).decode()

assert '</script' not in js.lower(), 'app.js must not contain a closing script tag'
body = re.search(r'<body>(.*?)<script src="app.js"></script>', index, re.S).group(1)
body = body.replace('src="icon.svg"', f'src="{icon}"')
fonts = re.search(r'<link rel="stylesheet" href="(https://fonts\.googleapis\.com[^"]+)">', index).group(1)

page = f'''<title>TruckBook</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}">
<style>
{css}
</style>
{body.strip()}
<script>
{js}
</script>
'''
out = root / 'artifact' / 'truckbook.html'
out.write_text(page)
print(f'wrote {out} ({len(page) // 1024} KiB)')
