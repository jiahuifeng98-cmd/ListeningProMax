from pathlib import Path
import json,zipfile,hashlib
root=Path(__file__).resolve().parents[1];d=root/'reports/share-20261106';build=root/'cache/share-build/ListeningProMax.exe';archive=root/'release/ListeningProMax-2026.11.06-分享包.zip'
for f in ['ui.json','guide.json','video.json','first-entry.json','moved-entry.json','launcher-tests.json']:
 assert json.loads((d/f).read_text('utf-8-sig'))['passed'],f
with zipfile.ZipFile(build) as z:
 names=z.namelist();allowed={'app','runtime','assets','worker','licenses','bootstrap.exe','THIRD_PARTY_NOTICES.md','requirements.lock.txt','bundle-manifest.tsv'}
 assert len(names)==len(set(names))
 assert all(n.split('/')[0] in allowed for n in names)
 assert not any(n.startswith(('data/','cache/','logs/','models/')) for n in names)
 assert not any(n.endswith(('library.sqlite','.sqlite-wal','.sqlite-shm')) for n in names)
 assert z.testzip() is None
 for f in (root/'out').rglob('*'):
  if f.is_file():assert z.read('app/resources/app/out/'+f.relative_to(root/'out').as_posix())==f.read_bytes()
 assert z.read('assets/vocabulary/level-index.json')==(root/'src/main/vocabulary-data.json').read_bytes()
 assert json.loads(z.read('assets/lightweight.json'))['version']=='1.9.0-share.20261106'
with zipfile.ZipFile(archive) as z:
 assert z.namelist()==['ListeningProMax/ListeningProMax.exe','ListeningProMax/使用说明.html','ListeningProMax/ListeningProMax-宣传片.mp4']
 for entry,p in [('ListeningProMax.exe',build),('使用说明.html',d/'使用说明.html'),('ListeningProMax-宣传片.mp4',d/'ListeningProMax-宣传片.mp4')]:
  with z.open('ListeningProMax/'+entry) as f:actual=hashlib.file_digest(f,'sha256').hexdigest()
  with p.open('rb') as f:expected=hashlib.file_digest(f,'sha256').hexdigest()
  assert actual==expected,entry
report={'passed':True,'exactlyThreeVisibleFiles':True,'latestBuildMatches':True,'personalDataIncluded':False,'modelsIncluded':False,'payloadFiles':len(names)}
(d/'verified.json').write_text(json.dumps(report,indent=2),'utf-8');print(json.dumps(report))
