from pathlib import Path
import json,sqlite3,hashlib,ast
root=Path(__file__).resolve().parents[1];release=root/'release/ListeningProMax'
files={}
for name in ['worker.py','text_processing.py','free_translation.py','process_job.py']:
 source=root/'worker'/name;target=release/'worker'/name
 ast.parse(source.read_text('utf-8'));assert source.read_bytes()==target.read_bytes(),name
 files['worker/'+name]=hashlib.sha256(target.read_bytes()).hexdigest()
for source in (root/'out').rglob('*'):
 if source.is_file():
  target=release/'app/resources/app/out'/source.relative_to(root/'out');assert source.read_bytes()==target.read_bytes(),str(target)
  files[target.relative_to(release).as_posix()]=hashlib.sha256(target.read_bytes()).hexdigest()
for unwanted in ['models/punctuation','runtime/llama']:
 assert not (release/unwanted).exists(),unwanted
db=sqlite3.connect((release/'data/library.sqlite').as_uri()+'?mode=ro',uri=True)
lesson=json.loads(db.execute('select body from lessons').fetchone()[0]);db.close()
recovery=json.loads((root/'reports/v11/recovery.json').read_text('utf-8'))
state={k:lesson.get(k) for k in recovery['playbackStateBefore']}
assert state==recovery['playbackStateBefore'],(state,recovery['playbackStateBefore'])
assert len(lesson['sentences'])==214
assert (release/lesson['mediaFile']).is_file()
result={'passed':True,'version':'1.1.0','sourceAndDeployedFilesMatch':files,'userPlaybackStatePreserved':state,'sentences':214,'removedResources':['Qwen','llama.cpp'],'releaseArchiveRetained':False}
(root/'reports/v11/delivery.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8');print('DELIVERY VERIFIED: source, deployed code, recovered course and playback state')
