"""Download exactly the pinned resources; never discover latest model versions."""
from pathlib import Path
import json,hashlib,urllib.request,shutil,zipfile
root=Path(__file__).resolve().parents[1]
for item in json.loads((root/'assets/manifest.json').read_text('utf-8')):
 if not item.get('url'):continue
 target=(root/item['path']).resolve()
 if not target.is_relative_to(root):raise ValueError('Resource escaped project')
 target.parent.mkdir(parents=True,exist_ok=True)
 if not target.exists():
  print('Downloading',item['path'],flush=True)
  temporary=Path(str(target)+'.part')
  with urllib.request.urlopen(item['url'],timeout=120) as src,open(temporary,'wb') as dst:shutil.copyfileobj(src,dst,1024*1024)
  temporary.replace(target)
 if hashlib.file_digest(open(target,'rb'),'sha256').hexdigest()!=item['sha256']:raise ValueError('Checksum mismatch: '+item['path'])
 if item['source']=='ggml-org/llama.cpp':
  folder=root/'runtime/llama';folder.mkdir(parents=True,exist_ok=True)
  with zipfile.ZipFile(target) as z:
   for info in z.infolist():
    if info.filename.endswith(('.dll','llama-cli.exe','llama-server.exe')):
     with z.open(info) as src,open(folder/Path(info.filename).name,'wb') as dst:shutil.copyfileobj(src,dst)
print('Pinned assets verified',flush=True)
