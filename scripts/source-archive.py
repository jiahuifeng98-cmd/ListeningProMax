from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1];out=root/'release/ListeningProMax-1.9.0-source.zip'
files=[]
for directory in ['src','worker','scripts','tests','assets/branding']:
 files.extend(p for p in (root/directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
files.extend(p for p in root.iterdir() if p.is_file() and p.suffix in ['.json','.yaml','.toml','.ts','.md','.txt','.mjs'])
files.extend([root/'.npmrc',root/'assets/manifest.json',root/'assets/msvc-runtime.json'])
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for file in files:
  if file.exists():z.write(file,'ListeningProMax/'+file.relative_to(root).as_posix())
print(out,flush=True)
