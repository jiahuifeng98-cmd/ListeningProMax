from pathlib import Path
import json,os,sys
root=Path(__file__).resolve().parents[1];seen=set();logical=0;unique=0;directories={}
for base,dirs,files in os.walk(root):
 for name in files:
  file=Path(base)/name
  try:stat=file.stat()
  except OSError:continue
  logical+=stat.st_size;directory=file.relative_to(root).parts[0];directories[directory]=directories.get(directory,0)+stat.st_size
  key=(stat.st_dev,stat.st_ino)
  if key not in seen:seen.add(key);unique+=stat.st_size
report={'logicalBytes':logical,'uniqueFileBytes':unique,'logicalGiB':round(logical/2**30,3),'uniqueFileGiB':round(unique/2**30,3),'directoryBytes':directories,'note':'Logical size counts hard-linked files twice. Unique file bytes count each file ID once; filesystem allocation/metadata overhead is not included.'}
(root/(sys.argv[1] if len(sys.argv)>1 else 'reports/v15/storage.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print(json.dumps({k:v for k,v in report.items() if k!='directoryBytes'}),flush=True)
