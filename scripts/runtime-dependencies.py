from pathlib import Path
import sys,json,shutil
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'cache/benchmark-deps'))
import psutil
maps=set()
for process in psutil.process_iter(['exe']):
 try:
  if (process.info['exe'] or '').lower().startswith(str(root/'runtime/python').lower()):
   maps.update(m.path for m in process.memory_maps() if m.path.lower().endswith('.dll'))
 except (psutil.Error,OSError):pass
external=sorted(m for m in maps if not m.lower().startswith(str(root).lower()))
(root/'reports/loaded-dlls.json').write_text(json.dumps(external,ensure_ascii=False,indent=2),'utf-8')
for file in external:
 name=Path(file).name.lower()
 if name.startswith(('msvcp140','vcruntime140','vcomp140','concrt140')):print('EXTERNAL CRT',file,flush=True)
