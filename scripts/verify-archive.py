"""Validate CRC, SHA256 and portable contents without extracting elsewhere."""
from pathlib import Path
import json,zipfile,hashlib
root=Path(__file__).resolve().parents[1];file=root/'release/ListeningProMax-1.9.0-win-x64-offline.zip'
with zipfile.ZipFile(file) as z:
 manifest=json.loads(z.read('ListeningProMax/SHA256SUMS.json'))
 names=z.namelist()
 assert len(names)==len(set(names))==len(manifest)+1,'Unexpected or duplicate archive members'
 for required in ['ListeningProMax.exe','app/ListeningProMax.App.exe','app/resources/app/out/main.cjs','runtime/python/python.exe','models/turbo/model.bin','models/small/model.bin','models/translation/model.bin','assets/dictionaries.sqlite','worker/worker.py','使用说明.txt']:
  assert 'ListeningProMax/'+required in names,required
 for i,item in enumerate(manifest):
  name='ListeningProMax/'+item['path']
  with z.open(name) as f:
   digest=hashlib.file_digest(f,'sha256').hexdigest()
  if digest!=item['sha256']:raise ValueError('Checksum mismatch: '+name)
  if i%500==0:print('VERIFY',i,len(manifest),flush=True)
 assert not any(n.startswith(('ListeningProMax/data/','ListeningProMax/cache/','ListeningProMax/logs/')) for n in z.namelist())
 assert 'ListeningProMax/runtime/python/Lib/site-packages/transformers/data/__init__.py' in z.namelist()
 report={'passed':True,'files':len(manifest),'uncompressedBytes':sum(i.file_size for i in z.infolist()),'bytes':file.stat().st_size,'sha256':hashlib.file_digest(open(file,'rb'),'sha256').hexdigest(),'checks':['ZIP CRC while reading every member','SHA256 every release file','no user data/cache/logs','Python package data retained','required portable resources present','no duplicate or unlisted members']}
 (root/'reports/archive.json').write_text(json.dumps(report,indent=2),'utf-8');print(json.dumps(report),flush=True)
