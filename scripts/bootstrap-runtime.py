"""Copy only the installed Python runtime, never project/application code."""
from pathlib import Path
import shutil, sys
root = Path(__file__).resolve().parents[1]
source = Path(sys.base_prefix)
target = root / 'runtime' / 'python'
target.mkdir(parents=True, exist_ok=True)
for p in source.iterdir():
    if p.is_file() and (p.suffix in ('.exe', '.dll') or p.name == 'LICENSE.txt'):
        shutil.copy2(p, target / p.name)
shutil.copytree(source/'DLLs', target/'DLLs', dirs_exist_ok=True)
shutil.copytree(source/'Lib', target/'Lib', dirs_exist_ok=True,
                ignore=shutil.ignore_patterns('site-packages', '__pycache__', 'test', 'tests', 'idlelib', 'tkinter', 'turtledemo'))
packages = target/'Lib'/'site-packages'
packages.mkdir(exist_ok=True)
for p in (source/'Lib'/'site-packages').glob('pip*'):
    if p.is_dir(): shutil.copytree(p, packages/p.name, dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__'))
(target/f'python{sys.version_info.major}{sys.version_info.minor}._pth').write_text('python313.zip\n.\nDLLs\nLib\nLib/site-packages\nimport site\n')
print(target, flush=True)
