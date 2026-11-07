"""Share identical immutable resource files with NTFS hard links; never data."""
from pathlib import Path
import os,hashlib,json
root=Path(__file__).resolve().parents[1];release=root/'release/ListeningProMax'
report={'files':0,'bytesSaved':0,'checks':'size and SHA256 before replacing a duplicate resource'}
for directory in ['models','runtime','assets/kuromoji']:
 for source in (root/directory).rglob('*'):
  if not source.is_file() or '__pycache__' in source.parts:continue
  target=release/source.relative_to(root)
  if not target.is_file() or source.samefile(target) or source.stat().st_size!=target.stat().st_size:continue
  with source.open('rb') as f:a=hashlib.file_digest(f,'sha256').hexdigest()
  with target.open('rb') as f:b=hashlib.file_digest(f,'sha256').hexdigest()
  if a!=b:continue
  # Link to a temporary sibling first, then atomically replace the duplicate.
  temp=target.with_name(target.name+'.dedup-tmp');os.link(source,temp);temp.replace(target)
  report['files']+=1;report['bytesSaved']+=source.stat().st_size
with (root/'reports/v11/deduplication.json').open('w',encoding='utf-8') as f:json.dump(report,f,indent=2)
print(json.dumps(report),flush=True)
