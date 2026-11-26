#!/usr/bin/env python3
"""Build a flat, manifest-verified installation ZIP; never include the Git tree."""
import hashlib,json,re,stat,sys,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'source'
manifest=root/'SHA256_MANIFEST.json'
m=json.loads(manifest.read_text(encoding='utf-8'))
files={p.relative_to(root).as_posix():p for p in root.rglob('*') if p.is_file() and p!=manifest}
if set(files)!=set(m): raise SystemExit('Unexpected/missing source files; rebuild manifest only after review: '+str(set(files)^set(m)))
for k,p in files.items():
    if p.is_symlink() or any(q in {'.git','node_modules','trial-beta','trial-data','private-data','imports','backups','__pycache__'} for q in p.relative_to(root).parts) or re.search(r'\.(?:sqlite[^/]*|db|env|pem|key|local\.json)$',k,re.I): raise SystemExit('Forbidden source: '+k)
    if hashlib.sha256(p.read_bytes()).hexdigest()!=m[k]: raise SystemExit('Hash mismatch: '+k)
version=re.search(r"version:'([^']+)'",(root/'dashboard/update-check.mjs').read_text()).group(1)
out=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'dist'/f'Everlight_{version}.zip'
out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for k,p in sorted({**files,'SHA256_MANIFEST.json':manifest}.items()):
        info=zipfile.ZipInfo(k,(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(stat.S_IFREG|0o644)<<16
        z.writestr(info,p.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
print(f'{version}: {len(m)} verified files; {out}; sha256={hashlib.sha256(out.read_bytes()).hexdigest()}')
