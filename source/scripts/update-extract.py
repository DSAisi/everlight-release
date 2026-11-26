import os,stat,sys,zipfile,shutil
from pathlib import Path
archive,dest=sys.argv[1:]; base=Path(dest)
dirs={'adapters','automation','contracts','converter','core','d14','dashboard','gateway','migration','protocol','scripts','test','universal','vector','verification','说明书'}
roots={'.gitignore','AGENTS.md','README_先读.md','SHA256_MANIFEST.json','TEST_FEEDBACK.md','package.json','provider.example.json','一键导入.md','发行与更新.md','研发待办.md','首次导入指南.md','做梦与宿主接入.md','梦境同步接入_Beta10.md'}
with zipfile.ZipFile(archive) as z:
 seen=set(); total=0
 if len(z.infolist())>10000: raise ValueError('too many entries')
 for item in z.infolist():
  name=item.filename.rstrip('/'); parts=name.split('/')
  if not name or '\\' in name or ':' in name or any(p in ('','.','..') or p.endswith((' ','.')) for p in parts): raise ValueError('invalid path')
  if name.casefold() in seen: raise ValueError('duplicate path')
  seen.add(name.casefold())
  if (len(parts)==1 and name not in roots and not (item.is_dir() and name in dirs)) or (len(parts)>1 and parts[0] not in dirs): raise ValueError('unexpected release entry '+name)
  if any(p.lower() in ('node_modules','.git','trial-beta','private-data','backups','imports','__pycache__') or p.lower().endswith(('.sqlite','.sqlite-wal','.sqlite-shm','.env','.pem','.key','.local.json')) for p in parts): raise ValueError('private/runtime file forbidden')
  mode=(item.external_attr>>16)&0xffff
  if stat.S_IFMT(mode) not in (0,stat.S_IFREG,stat.S_IFDIR): raise ValueError('special archive entry')
  total+=item.file_size
  if total>1024*1024*1024 or item.file_size>256*1024*1024: raise ValueError('size limit')
  target=base.joinpath(*parts)
  if item.is_dir(): target.mkdir(parents=True,exist_ok=True); continue
  target.parent.mkdir(parents=True,exist_ok=True)
  with z.open(item) as src,target.open('xb') as out: shutil.copyfileobj(src,out)
  os.chmod(target,0o600|(mode&0o100))
