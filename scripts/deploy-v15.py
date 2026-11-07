"""Deploy code atomically; never rewrite hardlinked models or runtime resources."""
from pathlib import Path
import shutil,json,hashlib,sqlite3
root=Path(__file__).resolve().parents[1];dest=root/'release/ListeningProMax';report=root/'reports/v15'
report.mkdir(parents=True,exist_ok=True)
db=dest/'data/library.sqlite'
if db.exists():
    backup=dest/'data/backups/library-before-v15.sqlite';backup.parent.mkdir(exist_ok=True)
    if not backup.exists():
        with sqlite3.connect(db.as_uri()+'?mode=ro',uri=True) as source,sqlite3.connect(backup) as target:source.backup(target)
files=[]
def deploy(source,target):
    assert target.resolve().is_relative_to(dest.resolve())
    target.parent.mkdir(parents=True,exist_ok=True);temp=target.with_name(target.name+'.new');shutil.copyfile(source,temp);temp.replace(target)
    files.append({'path':target.relative_to(dest).as_posix(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
for source in (root/'out').rglob('*'):
    if source.is_file():deploy(source,dest/'app/resources/app/out'/source.relative_to(root/'out'))
for source in (root/'worker').glob('*.py'):deploy(source,dest/'worker'/source.name)
for name in ['README.md','ACCEPTANCE-v1.5.md']:
    if (root/name).exists():deploy(root/name,dest/name)
manifest=dest/'app/resources/app/package.json';temp=manifest.with_suffix('.new');temp.write_text(json.dumps({'name':'listening-promax','version':'1.5.0','main':'out/main.cjs'}),'utf-8');temp.replace(manifest)
stale=[]
for file in (dest/'app/resources/app/out/renderer/assets').glob('*'):
    if file.is_file() and not (root/'out/renderer/assets'/file.name).exists():stale.append(file)
if (dest/'SHA256SUMS.json').exists():stale.append(dest/'SHA256SUMS.json')
print('Generated files to remove:',*[str(f) for f in stale],sep='\n',flush=True)
for file in stale:
    assert file.resolve().is_relative_to(dest.resolve());file.unlink()
(report/'deployment.json').write_text(json.dumps({'version':'1.5.0','passed':True,'files':files,'removed':[str(f) for f in stale]},indent=2),'utf-8')
print('DEPLOYED',len(files),'files',flush=True)
