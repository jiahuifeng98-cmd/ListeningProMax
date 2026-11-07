from pathlib import Path
import sys,time,json,tempfile
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'worker'))
import worker
items=[{'id':str(i),'text':text} for i,text in enumerate(['今日はいい天気ですね。','駅はどこにありますか。','明日は図書館で勉強します。'])]
report={}
with tempfile.TemporaryDirectory(dir=root/'cache') as tmp:
 for provider in ['bing']:
  for run in ['network','cached']:
   events=[];worker.emit=lambda kind,**kwargs:events.append({'type':kind,**kwargs})
   start=time.monotonic();worker.translate(None,{'sentences':items},{'online':True,'freeProvider':provider,'onlineFallback':False},Path(tmp),Path(tmp));elapsed=time.monotonic()-start
   values=[e for e in events if e['type']=='translation'];assert len(values)==len(items)
   report[provider+'-'+run]={'seconds':elapsed,'translations':values,'progress':[e['progress'] for e in events if e['type']=='progress']}
(root/'reports/v14/free-translation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print(json.dumps({key:round(v['seconds'],3) for key,v in report.items()}),flush=True)
