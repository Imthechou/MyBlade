#!/usr/bin/env python3
"""Restore most recent game ZIP into editable game/ (standard library only)."""
import sys, zipfile, tempfile, shutil, json, stat
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
GAME=ROOT/"game"
if (GAME/"index.html").exists():
    print("EXISTING_GAME",sum(p.is_file() for p in GAME.rglob("*")))
    sys.exit(0)
archives=sorted(ROOT.glob("*.zip"), key=lambda p:(int("优化版" in p.name),p.stat().st_mtime),reverse=True)
if not archives: raise RuntimeError("No game/ or archive in root")
archive=archives[0]
with zipfile.ZipFile(archive) as z:
    files=[x for x in z.infolist() if not x.is_dir()]
    print("ARCHIVE",archive.name,"FILES",len(files),"BYTES",sum(x.file_size for x in files))
    for entry in files[:45]: print("ZIP_ENTRY",entry.filename,entry.file_size)
    if len(files)>12000 or sum(x.file_size for x in files)>600_000_000:raise RuntimeError("Archive size guard")
    for x in files:
        p=Path(x.filename.replace("\\","/"))
        if p.is_absolute() or ".." in p.parts or not p.parts or ":" in p.parts[0] or stat.S_ISLNK(x.external_attr>>16):raise RuntimeError("Unsafe entry: "+x.filename)
    with tempfile.TemporaryDirectory() as tmp:
        root=Path(tmp); z.extractall(root)
        indexes=[p for p in root.rglob("index.html") if not set(p.parts)&{"node_modules",".git","__MACOSX"}]
        if not indexes:raise RuntimeError("No index.html in archive")
        def score(p):
            d=p.parent
            return (sum((d/n).exists() for n in ("src","assets","css","models")),-len(p.relative_to(root).parts))
        chosen=max(indexes,key=score).parent
        print("SELECTED_ROOT",chosen.relative_to(root))
        shutil.copytree(chosen,GAME,ignore=shutil.ignore_patterns(".git","node_modules","__MACOSX","*.log"))
print("RESTORED",json.dumps({"files":sum(p.is_file() for p in GAME.rglob("*")),"index":str(GAME/"index.html")}))
