from pathlib import Path
import importlib.util,concurrent.futures,zipfile,shutil,json,urllib.request,re
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('assets',Path(__file__).with_name('fetch-assets.py'));a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
jobs=[
 lambda:a.fetch('https://github.com/greyindex/jitendex-yomitan-zh/releases/download/v2026.08.11-zh.4/jitendex-yomitan-zh-full-review-dedup-20260927.zip',ROOT/'assets/dictionaries/jitendex-zh.zip','greyindex/jitendex-yomitan-zh','v2026.08.11-zh.4'),
 lambda:a.fetch('https://github.com/yomidevs/jmdict-yomitan/releases/download/2026-10-12/JMdict_english.zip',ROOT/'assets/dictionaries/jmdict-en.zip','yomidevs/jmdict-yomitan','2026-10-12'),
]
if __name__=='__main__':
 records=json.loads(a.MANIFEST.read_text('utf-8'))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for future in concurrent.futures.as_completed([pool.submit(job) for job in jobs]):
   try:
    result=future.result();result=result if isinstance(result,list) else [result]
    for record in result:records=[r for r in records if r['path']!=record['path']]+[record]
    a.MANIFEST.write_text(json.dumps(records,ensure_ascii=False,indent=2),'utf-8')
    print('READY',result[0]['path'],flush=True)
   except Exception as e:print('ERROR',repr(e),flush=True)
