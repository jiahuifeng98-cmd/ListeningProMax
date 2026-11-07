from pathlib import Path
import urllib.request, json, hashlib, concurrent.futures, time, zipfile, shutil
ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT/'assets'/'manifest.json'
MANIFEST.parent.mkdir(exist_ok=True)
HEADERS = {'User-Agent':'ListeningProMax-build/1.0'}
def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=90) as r: return json.load(r)
def fetch(url, dest, source='', revision=''):
    dest=Path(dest); dest.parent.mkdir(parents=True,exist_ok=True)
    if not dest.exists():
        for retry in range(4):
            try:
                print('DOWNLOAD',dest.relative_to(ROOT),flush=True)
                part=Path(str(dest)+'.part'); offset=part.stat().st_size if part.exists() else 0
                headers={**HEADERS,**({'Range':f'bytes={offset}-'} if offset else {})}
                with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=120) as r:
                    mode='ab' if offset and r.status==206 else 'wb'
                    with open(part,mode) as f: shutil.copyfileobj(r,f,1024*1024)
                Path(str(dest)+'.part').replace(dest); break
            except Exception:
                if retry==3: raise
                time.sleep(2**retry)
    digest=hashlib.sha256()
    with open(dest,'rb') as f:
        for block in iter(lambda:f.read(4*1024*1024),b''): digest.update(block)
    return {'path':dest.relative_to(ROOT).as_posix(),'url':url,'source':source,'revision':revision,'bytes':dest.stat().st_size,'sha256':digest.hexdigest()}
def model(repo,name,predicate=None):
    info=get_json('https://huggingface.co/api/models/'+repo); revision=info['sha']; records=[]
    for item in info['siblings']:
        file=item['rfilename']
        if predicate and not predicate(file): continue
        if not predicate and (file.startswith('.') or file.endswith(('.h5','.msgpack','.safetensors','.pt','.onnx'))): continue
        records.append(fetch(f'https://huggingface.co/{repo}/resolve/{revision}/{file}',ROOT/'models'/name/file,repo,revision))
    return records
def github_dictionary(repo,predicate,label):
    releases=get_json(f'https://api.github.com/repos/{repo}/releases?per_page=10')
    for release in releases:
        choices=[a for a in release['assets'] if predicate(a['name'])]
        if choices: return [fetch(a['browser_download_url'],ROOT/'assets'/'dictionaries'/a['name'],label,release['tag_name']) for a in choices[:1]]
    raise RuntimeError('Dictionary release missing: '+repo)
def llama():
    release=get_json('https://api.github.com/repos/ggml-org/llama.cpp/releases/latest')
    asset=next(a for a in release['assets'] if 'bin-win-cpu-x64.zip' in a['name'])
    record=fetch(asset['browser_download_url'],ROOT/'cache'/asset['name'],'ggml-org/llama.cpp',release['tag_name'])
    dest=ROOT/'runtime'/'llama'; dest.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(ROOT/record['path']) as z:
        for item in z.infolist():
            if item.filename.endswith(('.dll','llama-cli.exe','llama-server.exe')):
                target=dest/Path(item.filename).name
                with z.open(item) as src,open(target,'wb') as out: shutil.copyfileobj(src,out)
    return [record]
jobs=[
    lambda:model('Systran/faster-whisper-small','small'),
    lambda:model('mobiuslabsgmbh/faster-whisper-large-v3-turbo','turbo'),
    lambda:model('jncraton/m2m100_418M-ct2-int8','translation'),
    lambda:github_dictionary('greyindex/jitendex-yomitan-zh',lambda n:'full-review-dedup' in n and n.endswith('.zip'),'Jitendex 中文社区译本'),
    lambda:github_dictionary('yomidevs/jmdict-yomitan',lambda n:n.startswith('JMdict_english') and n.endswith('.zip'),'JMdict EDRDG'),
]
if __name__=='__main__':
    records=json.loads(MANIFEST.read_text('utf-8')) if MANIFEST.exists() else []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for future in concurrent.futures.as_completed([pool.submit(job) for job in jobs]):
            try:
                for record in future.result():
                    records=[r for r in records if r['path']!=record['path']]+[record]
                MANIFEST.write_text(json.dumps(records,ensure_ascii=False,indent=2),'utf-8')
                print('ASSET GROUP READY',len(records),flush=True)
            except Exception as e: print('ASSET ERROR',repr(e),flush=True)
