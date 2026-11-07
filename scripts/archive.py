from pathlib import Path
import zipfile,hashlib,json,time
root=Path(__file__).resolve().parents[1];folder=root/'release/ListeningProMax'
records=[]
for file in folder.rglob('*'):
 if file.is_file() and file.relative_to(folder).parts[0] not in ('data','cache','logs','validation') and file.name!='SHA256SUMS.json' and not file.name.startswith('ACCEPTANCE'):
  with file.open('rb') as stream: digest=hashlib.file_digest(stream,'sha256').hexdigest()
  records.append({'path':file.relative_to(folder).as_posix(),'bytes':file.stat().st_size,'sha256':digest})
(folder/'SHA256SUMS.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),'utf-8')
target=root/'release/ListeningProMax-1.9.0-win-x64-offline.zip'
with zipfile.ZipFile(target.with_suffix('.partial.zip'),'w',zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as z:
 for i,item in enumerate(records):
  z.write(folder/item['path'],'ListeningProMax/'+item['path'])
  if i%500==0: print('PACK',i,len(records),flush=True)
 z.write(folder/'SHA256SUMS.json','ListeningProMax/SHA256SUMS.json')
target.with_suffix('.partial.zip').replace(target)
checksum=hashlib.file_digest(open(target,'rb'),'sha256').hexdigest()
target.with_suffix('.zip.sha256').write_text(checksum+'  '+target.name+'\n','utf-8')
print(json.dumps({'file':str(target),'bytes':target.stat().st_size,'sha256':checksum}),flush=True)
