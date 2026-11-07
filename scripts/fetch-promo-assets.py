"""Download public, licensed media into this project only; record source/hash."""
from pathlib import Path
import urllib.request,json,hashlib,sys
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'cache/promo-assets';DEST.mkdir(parents=True,exist_ok=True)
REPORT=ROOT/'reports/share-20261106';REPORT.mkdir(parents=True,exist_ok=True)
items=[
 ('Gimme-that-Groove.mp3','https://assets.mixkit.co/music/872/872.mp3','Michael Ramir C.','Mixkit Stock Music Free License','https://mixkit.co/free-stock-music/funk/'),
 ('mouse-close.mp3','https://assets.mixkit.co/active_storage/sfx/1113/1113-preview.mp3','Mixkit','Mixkit Sound Effects Free License','https://mixkit.co/free-sound-effects/click/'),
 ('mouse-clear.mp3','https://assets.mixkit.co/active_storage/sfx/2997/2997-preview.mp3','Mixkit','Mixkit Sound Effects Free License','https://mixkit.co/free-sound-effects/click/'),
 ('keyboard.mp3','https://assets.mixkit.co/active_storage/sfx/2531/2531-preview.mp3','Mixkit','Mixkit Sound Effects Free License','https://mixkit.co/free-sound-effects/click/'),
 ('interface.mp3','https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3','Mixkit','Mixkit Sound Effects Free License','https://mixkit.co/free-sound-effects/click/'),
 ('sweep.mp3','https://assets.mixkit.co/active_storage/sfx/166/166-preview.mp3','Mixkit','Mixkit Sound Effects Free License','https://mixkit.co/free-sound-effects/transition/'),
 ('NotoSansSC.ttf','https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf','The Noto Project Authors','SIL OFL 1.1','https://github.com/google/fonts/tree/main/ofl/notosanssc'),
 ('OFL.txt','https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt','The Noto Project Authors','SIL OFL 1.1','https://github.com/google/fonts/tree/main/ofl/notosanssc'),
]
record_file=REPORT/'media-sources.json'
records=json.loads(record_file.read_text('utf-8')) if record_file.exists() else []
for name,url,author,license,source in items:
 if '--music-only' in sys.argv and name!='Gimme-that-Groove.mp3':continue
 target=DEST/name
 if not target.exists():
  request=urllib.request.Request(url,headers={'User-Agent':'ListeningProMax-media-production/1.0'})
  with urllib.request.urlopen(request,timeout=60) as response:content=response.read()
  temp=target.with_suffix('.download');temp.write_bytes(content);temp.replace(target)
 records=[r for r in records if r['file']!=name]
 records.append(dict(file=name,url=url,source=source,author=author,license=license,bytes=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
 if name=='Gimme-that-Groove.mp3':
  records[-1].update(title='Gimme that Groove!',licenseUrl='https://mixkit.co/license/modal/musicFree/',usage='Music embedded in an edited promotional video; no standalone redistribution',selection='Positive, melodic funk; selected for a lighter groove under narration, not claimed as a chart hit')
 elif name in ['mouse-close.mp3','mouse-clear.mp3','keyboard.mp3','interface.mp3','sweep.mp3']:
  records[-1].update(title={'mouse-close.mp3':'Mouse click close','mouse-clear.mp3':'Clear mouse clicks','keyboard.mp3':'Typing on a laptop keyboard','interface.mp3':'Opening software interface','sweep.mp3':'Fast small sweep transition'}[name],licenseUrl='https://mixkit.co/license/modal/sfxFree/',usage='Cropped/processed effects embedded in finished video only; not redistributed standalone')
 print(name,target.stat().st_size,flush=True)
(REPORT/'media-sources.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),'utf-8')
