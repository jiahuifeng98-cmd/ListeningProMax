"""Build a clean distribution without copying user data or large staging trees."""
from pathlib import Path
import os,sys,json,zipfile,hashlib,subprocess,struct,time,shutil
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'release/ListeningProMax'
BUILD=ROOT/'cache/share-build'
EDITION='2026.11.06'
REPORT=ROOT/'reports/share-20261106'
BUILD.mkdir(parents=True,exist_ok=True);REPORT.mkdir(parents=True,exist_ok=True)
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def included(p):
 rel=p.relative_to(SOURCE);parts=rel.parts
 if parts[0] not in {'app','runtime','assets','licenses','THIRD_PARTY_NOTICES.md','requirements.lock.txt'}:return False
 if parts[:4]==('app','resources','app','out'):return False
 if '__pycache__' in parts or p.suffix in {'.pyc','.pyo','.lib','.pdb','.exp','.obj'}:return False
 if parts[:2]==('app','locales') and p.name not in {'en-US.pak','zh-CN.pak','zh-TW.pak','ja.pak'}:return False
 if parts[:2]==('runtime','python'):
  if any(x in {'tests','test','include','headers','__pycache__'} for x in parts[2:]):return False
 return True
def build():
 compiler=Path(os.environ['WINDIR'])/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 stub=BUILD/'bootstrap.exe'
 subprocess.run([str(compiler),'/nologo','/target:winexe','/platform:x64','/main:ShareLauncher.Entry','/optimize+',
  '/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.IO.Compression.dll','/reference:Microsoft.CSharp.dll',
  '/win32manifest:'+str(ROOT/'scripts/share.manifest'),'/win32icon:'+str(ROOT/'assets/branding/listening-promax.ico'),'/out:'+str(stub),str(ROOT/'scripts/ShareLauncher.cs')],check=True)
 candidates=[]
 for name in ['app','runtime','assets','licenses']:
  candidates.extend(p for p in (SOURCE/name).rglob('*') if p.is_file())
 candidates.extend(SOURCE/name for name in ['THIRD_PARTY_NOTICES.md','requirements.lock.txt'])
 files=sorted((p for p in candidates if included(p)),key=lambda p:p.relative_to(SOURCE).as_posix())
 entries=[(p,p.relative_to(SOURCE).as_posix()) for p in files]+[(stub,'bootstrap.exe')]
 entries.extend((p,'app/resources/app/out/'+p.relative_to(ROOT/'out').as_posix()) for p in (ROOT/'out').rglob('*') if p.is_file())
 entries.extend((p,'worker/'+p.name) for p in (ROOT/'worker').glob('*.py'))
 profile=BUILD/'lightweight.json';profile.write_text(json.dumps({'edition':'lightweight','version':'1.9.0-share.20261106'}),'utf-8');entries.append((profile,'assets/lightweight.json'))
 records=[]
 for i,(p,name) in enumerate(entries):
  records.append({'path':name,'bytes':p.stat().st_size,'sha256':digest(p)})
  if i%1000==0:print('HASH',i,len(entries),flush=True)
 manifest=''.join(f"{r['sha256']}\t{r['bytes']}\t{r['path']}\n" for r in records)
 expanded=sum(r['bytes'] for r in records)+len(manifest.encode())
 target=BUILD/'ListeningProMax.exe';temp=target.with_suffix('.partial')
 # Write ZIP in place after the PE stub. ZIP offsets stay relative to the slice.
 class Slice:
  def __init__(self,f):self.f=f;self.base=f.tell()
  def tell(self):return self.f.tell()-self.base
  def seek(self,n,whence=0):return self.f.seek(n+self.base if whence==0 else n,whence)-self.base
  def write(self,b):return self.f.write(b)
  def flush(self):self.f.flush()
 started=time.monotonic()
 with temp.open('w+b') as output:
  output.write(stub.read_bytes());offset=output.tell();s=Slice(output)
  with zipfile.ZipFile(s,'w',zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
   z.writestr('bundle-manifest.tsv',manifest)
   for i,(p,name) in enumerate(entries):
    z.write(p,name)
    if i%1000==0 or p.stat().st_size>100_000_000:print('PACK',i,len(entries),name,flush=True)
  length=output.tell()-offset;output.seek(offset);h=hashlib.sha256()
  while chunk:=output.read(1024*1024):h.update(chunk)
  output.seek(0,2);output.write(struct.pack('<qqq32s16s',offset,length,expanded,h.digest(),b'LPM19BUNDLE00001'))
 temp.replace(target)
 original=sum(p.stat().st_size for p in candidates)
 report={'exe':str(target),'compressedBytes':target.stat().st_size,'expandedBytes':expanded,'files':len(records),'removedRuntimeBytes':original-sum(p.stat().st_size for p in files),'seconds':round(time.monotonic()-started,2),'sha256':digest(target),'personalDataIncluded':False,'modelsIncluded':[],'optionalModels':['turbo','small','translation'],'bundledRuntime':True,'bundledDictionaries':True}
 (REPORT/'manifest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),'utf-8');(REPORT/'build.json').write_text(json.dumps(report,indent=2),'utf-8');print(json.dumps(report),flush=True)
def archive():
 exe=BUILD/'ListeningProMax.exe';manual=REPORT/'使用说明.html';video=REPORT/'ListeningProMax-宣传片.mp4'
 assert exe.exists() and manual.exists() and video.exists()
 target=ROOT/f'release/ListeningProMax-{EDITION}-分享包.zip'
 with zipfile.ZipFile(target.with_suffix('.partial.zip'),'w',zipfile.ZIP_STORED,allowZip64=True) as z:
  z.write(exe,'ListeningProMax/ListeningProMax.exe');z.write(manual,'ListeningProMax/使用说明.html');z.write(video,'ListeningProMax/ListeningProMax-宣传片.mp4')
 target.with_suffix('.partial.zip').replace(target)
 with zipfile.ZipFile(target) as z:
  assert z.namelist()==['ListeningProMax/ListeningProMax.exe','ListeningProMax/使用说明.html','ListeningProMax/ListeningProMax-宣传片.mp4'];assert z.testzip() is None
 report={'path':str(target),'bytes':target.stat().st_size,'sha256':digest(target),'contents':['ListeningProMax.exe','使用说明.html','ListeningProMax-宣传片.mp4']}
 (REPORT/'archive.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print(json.dumps(report,ensure_ascii=False),flush=True)
if __name__=='__main__':archive() if '--archive' in sys.argv else build()
