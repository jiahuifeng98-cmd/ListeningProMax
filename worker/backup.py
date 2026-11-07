"""Streaming course backup: bounded memory and no archive-path extraction."""
from pathlib import Path
import sys,json,zipfile,shutil,uuid

def main(req):
 root=Path(req['root']).resolve()
 if req['mode']=='export':
  target=Path(req['file']);temporary=target.with_suffix('.partial.zip')
  lesson=req['lesson'];manifest={'format':'ListeningProMax','version':1,'lesson':lesson,'favorites':req['favorites']}
  with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as z:
   for field in ['sourceMedia','mediaFile']:
    if lesson.get(field):
     source=(root/lesson[field]).resolve()
     if not source.is_relative_to(root/'data'/'media'):raise ValueError('Invalid media path')
     entry='media/'+field+source.suffix;z.write(source,entry);manifest[field]=entry
   z.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False))
  temporary.replace(target);return {'file':str(target)}
 with zipfile.ZipFile(req['file']) as z:
  info=z.getinfo('manifest.json')
  if info.file_size>20*1024*1024:raise ValueError('Backup metadata too large')
  data=json.loads(z.read(info));
  if data.get('format')!='ListeningProMax' or data.get('version')!=1:raise ValueError('Unsupported backup format')
  lesson=data['lesson'];old=lesson['id'];lesson['id']=str(uuid.uuid4());lesson['version']=1
  ids={s['id']:str(uuid.uuid4()) for s in lesson['sentences']}
  for s in lesson['sentences']:s['id']=ids[s['id']]
  lesson['selectedId']=ids.get(lesson.get('selectedId'))
  folder=root/'data'/'media'/lesson['id'];folder.mkdir(parents=True,exist_ok=True)
  for field in ['sourceMedia','mediaFile']:
   if data.get(field):
    info=z.getinfo(data[field]);target=folder/(field+Path(data[field]).suffix)
    if info.file_size>shutil.disk_usage(folder).free-100*1024*1024:raise ValueError('磁盘空间不足')
    with z.open(info) as src,open(target,'wb') as dst:shutil.copyfileobj(src,dst,1024*1024)
    lesson[field]=target.relative_to(root).as_posix()
   else:lesson.pop(field,None)
  favorites=[]
  for f in data.get('favorites',[]):
   for origin in f['origins']:
    if origin['lessonId']==old:
     origin['lessonId']=lesson['id']
     if origin.get('sentenceId'):origin['sentenceId']=ids.get(origin['sentenceId'],origin['sentenceId'])
     favorites.append({**f,'origin':origin})
  return {'lesson':lesson,'favorites':favorites}

if __name__=='__main__':
 try:print(json.dumps(main(json.load(sys.stdin)),ensure_ascii=False))
 except Exception as e:print(json.dumps({'error':str(e)},ensure_ascii=False));sys.exit(1)
