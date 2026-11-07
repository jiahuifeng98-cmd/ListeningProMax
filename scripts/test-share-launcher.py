"""Exercise extraction failures with tiny fixtures, without touching a real desktop."""
from pathlib import Path
import io,zipfile,hashlib,struct,subprocess,json,os,time
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'cache/share-launcher-tests'/str(time.time_ns());BASE.mkdir(parents=True,exist_ok=True)
stub=(ROOT/'cache/share-build/bootstrap.exe').read_bytes()
required=['app/ListeningProMax.App.exe','app/resources/app/out/main.cjs','runtime/python/python.exe','models/turbo/model.bin','models/small/model.bin','models/translation/model.bin','assets/dictionaries.sqlite','bootstrap.exe']
def package(name,extra=None,bad_hash=False,corrupt=False):
 folder=BASE/name;folder.mkdir(exist_ok=True);files={p:b'fixture' for p in required}
 if extra:files.update(extra)
 manifest=''.join(f"{('0'*64 if bad_hash else hashlib.sha256(v).hexdigest())}\t{len(v)}\t{k}\n" for k,v in files.items())
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
  z.writestr('bundle-manifest.tsv',manifest)
  for k,v in files.items():z.writestr(k,v)
 payload=out.getvalue();footer=struct.pack('<qqq32s16s',len(stub),len(payload),len(manifest.encode())+sum(map(len,files.values())),hashlib.sha256(payload).digest(),b'LPM19BUNDLE00001')
 if corrupt:payload=payload[:40]+bytes([payload[40]^1])+payload[41:]
 exe=folder/'ListeningProMax.exe';exe.write_bytes(stub+payload+footer);return exe
def run(exe,arg='--prepare-only'):
 result=subprocess.run([str(exe),arg],timeout=60);return result.returncode
checks=[]
exe=package('中文 空格路径');assert run(exe)==0;assert run(exe,'--verify-only')==0;checks.append('Chinese and space path: extract and verify all hashes')
marker=exe.parent/'.ListeningProMax/ready.txt';stamp=marker.stat().st_mtime_ns;assert run(exe)==0 and marker.stat().st_mtime_ns==stamp;checks.append('second launch reuses prepared resources')
exe2=package('corrupt',corrupt=True);assert run(exe2)==1 and not (exe2.parent/'.ListeningProMax/ready.txt').exists();checks.append('corrupt embedded payload rejected without ready marker')
exe3=package('traversal',extra={'../outside.txt':b'no'});assert run(exe3)==1 and not (exe3.parent/'outside.txt').exists();checks.append('path traversal rejected')
exe4=package('user-data',extra={'data/library.sqlite':b'no'});assert run(exe4)==1 and not (exe4.parent/'.ListeningProMax/data/library.sqlite').exists();checks.append('payload cannot overwrite personal data')
exe5=package('hash-mismatch',bad_hash=True);assert run(exe5)==1;checks.append('per-file hash mismatch rejected')
exe6=package('interrupted');partial=exe6.parent/'.ListeningProMax/app';partial.mkdir(parents=True);(partial/'ListeningProMax.App.exe.unpacking').write_bytes(b'partial');assert run(exe6)==0;checks.append('incomplete first preparation recovers')
marker.write_text('different');assert run(exe)==1;checks.append('different installed bundle rejected without overwriting data')
report={'passed':True,'checks':checks};(ROOT/'reports/share-20261106/launcher-tests.json').write_text(json.dumps(report,indent=2),'utf-8');print(json.dumps(report),flush=True)
