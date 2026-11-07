from pathlib import Path
import zipfile,json,hashlib,shutil
root=Path(__file__).resolve().parents[1]
wheel=next((root/'cache/wheels').glob('msvc_runtime-14.44.35112*win_amd64.whl'))
records=[]
with zipfile.ZipFile(wheel) as z:
 for info in z.infolist():
  if info.filename.endswith('.dll'):
   name=Path(info.filename).name;data=z.read(info)
   for folder in [root/'runtime/python']:
    target=folder/name
    if not target.exists():target.write_bytes(data)
   records.append({'name':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
  if any(t in info.filename.lower() for t in ['license','copyright']):
   target=root/'licenses/msvc-runtime'/Path(info.filename).name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(info))
(root/'assets/msvc-runtime.json').write_text(json.dumps({'source':'https://pypi.org/project/msvc-runtime/14.44.35112/','version':'14.44.35112','wheelSHA256':hashlib.file_digest(open(wheel,'rb'),'sha256').hexdigest(),'files':records},indent=2),'utf-8')
print('BUNDLED CRT',len(records),flush=True)
