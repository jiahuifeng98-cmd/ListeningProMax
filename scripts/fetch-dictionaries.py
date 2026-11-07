from pathlib import Path
import importlib.util,json,concurrent.futures
spec=importlib.util.spec_from_file_location('assets',Path(__file__).with_name('fetch-assets.py'));a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
jobs=[
 ('https://github.com/yomidevs/wiktionary-to-yomitan/releases/download/v2025-04-08-10-54-36-00-00/kty-ja-en.zip','wiktionary-ja-en.zip','Wiktionary / Kaikki','v2025-04-08'),
 ('https://raw.githubusercontent.com/FooSoft/yomichan/dictionaries/kanjium_pitch_accents.zip','kanjium-pitch.zip','Kanjium / Uros Ozvatic','legacy'),
]
records=json.loads(a.MANIFEST.read_text('utf-8'))
for url,name,source,revision in jobs:
 try:
  record=a.fetch(url,a.ROOT/'assets/dictionaries'/name,source,revision);records=[r for r in records if r['path']!=record['path']]+[record]
  a.MANIFEST.write_text(json.dumps(records,ensure_ascii=False,indent=2),'utf-8');print('READY',name,flush=True)
 except Exception as e:print('ERROR',name,repr(e),flush=True)
