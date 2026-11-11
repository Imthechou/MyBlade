#!/usr/bin/env python3
"""Produce a static GitHub Pages build from the unmodified runtime sources.

The local Node server dynamically serves /__styles.css; Pages needs that file
materialized at build time, with a project-relative URL.
"""
from pathlib import Path
from shutil import copytree, rmtree, copy2
import subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
game=ROOT/"game"
if not (game/"index.html").exists():
    subprocess.run([sys.executable,str(ROOT/"scripts/prepare_game.py")],check=True)
site=ROOT/"_site"
if site.exists():rmtree(site)
site.mkdir()
for folder in ("src","assets","css"):
    copytree(game/folder,site/folder)
for filename in ("index.html","legacy.html"):
    if (game/filename).is_file():copy2(game/filename,site/filename)
order=[
 "css/tokens.css","css/base.css","css/components.css",
 "css/pages/shell.css","css/pages/forge.css","css/pages/appraise.css",
 "css/pages/arena.css","css/pages/workshop.css","css/pages/v19.css",
 "css/numeric.css",
]
bundle="\n".join((game/f).read_text(encoding="utf-8") for f in order)
(site/"__styles.css").write_text(bundle,encoding="utf-8")
for html in site.glob("*.html"):
    s=html.read_text(encoding="utf-8")
    s=s.replace('href="/__styles.css"','href="./__styles.css"')
    html.write_text(s,encoding="utf-8")
(site/".nojekyll").touch()
print("STATIC_SITE",len(list(site.rglob("*"))),"CSS_BYTES",len(bundle.encode()),"HTMLS",[p.name for p in site.glob("*.html")])
