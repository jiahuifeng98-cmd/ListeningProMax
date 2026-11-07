from pathlib import Path
import json,zipfile,shutil,urllib.request,hashlib,importlib.metadata
root=Path(__file__).resolve().parents[1];out=root/'licenses';out.mkdir(exist_ok=True)
urls={
 'jitendex-zh-LICENSE':'https://raw.githubusercontent.com/greyindex/jitendex-yomitan-zh/main/LICENSE',
 'jitendex-zh-NOTICE.md':'https://raw.githubusercontent.com/greyindex/jitendex-yomitan-zh/main/NOTICE.md',
 'kanjium-README.md':'https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/README.md',
 'llama.cpp-LICENSE':'https://raw.githubusercontent.com/ggml-org/llama.cpp/b6000/LICENSE',
 'whisper-LICENSE':'https://raw.githubusercontent.com/openai/whisper/main/LICENSE',
 'm2m100-LICENSE':'https://raw.githubusercontent.com/facebookresearch/fairseq/main/LICENSE',
 'JMdict-license.html':'https://www.edrdg.org/edrdg/licence.html',
 'CC-BY-SA-4.0.txt':'https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/LICENSE.txt',
}
for name,url in urls.items():
 try:
  target=out/name
  if not target.exists():
   with urllib.request.urlopen(url,timeout=60) as r:target.write_bytes(r.read())
  print('LICENSE',name,flush=True)
 except Exception as e:print('FAILED',name,str(e),flush=True)
for zip_path in (root/'assets/dictionaries').glob('*.zip'):
 folder=out/zip_path.stem;folder.mkdir(exist_ok=True)
 with zipfile.ZipFile(zip_path) as z:
  for info in z.infolist():
   if info.filename=='index.json' or any(x in info.filename.lower() for x in ('license','notice','attribution','copyright')):
    if info.file_size<10_000_000:(folder/Path(info.filename).name).write_bytes(z.read(info))
packages=[]
for dist in importlib.metadata.distributions(path=[str(root/'runtime/python/Lib/site-packages')]):
 name=dist.metadata['Name'];packages.append({'name':name,'version':dist.version,'license':dist.metadata.get('License-Expression') or dist.metadata.get('License'),'home':dist.metadata.get('Home-page')})
 folder=out/'python'/name;folder.mkdir(parents=True,exist_ok=True)
 for file in dist.files or []:
  if any(term in str(file).lower() for term in ('license','copying','notice')):
   source=dist.locate_file(file)
   if source.is_file() and source.stat().st_size<3_000_000:shutil.copy2(source,folder/source.name)
(out/'python-packages.json').write_text(json.dumps(packages,ensure_ascii=False,indent=2),'utf-8')
for package in (root/'node_modules/.pnpm').glob('*/node_modules/*/package.json'):
 try:
  meta=json.loads(package.read_text('utf-8'));name=meta['name'].replace('/','_');folder=out/'javascript'/name;folder.mkdir(parents=True,exist_ok=True)
  (folder/'metadata.json').write_text(json.dumps({k:meta.get(k) for k in ['name','version','license','repository']},ensure_ascii=False,indent=2),'utf-8')
  for file in package.parent.iterdir():
   if file.is_file() and any(t in file.name.lower() for t in ('license','copying','notice')):shutil.copy2(file,folder/file.name)
 except Exception as e:print('SKIP',str(package),str(e))
print('LICENSE INVENTORY READY',flush=True)
