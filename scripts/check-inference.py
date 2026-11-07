import sys,json,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'worker'))
from worker import Inference,extract,windows
job=ROOT/'reports'/'inference-check';job.mkdir(parents=True,exist_ok=True)
engine=Inference(ROOT,job)
try:
 started=time.monotonic()
 result=engine.call({'kind':'translate','texts':['今日はいい天気ですね。','一緒に散歩しませんか。']})
 print('TRANSLATION',result,round(time.monotonic()-started,2),flush=True)
 audio,duration=extract(ROOT,{'id':'inference-fixture','sourceMedia':'reports/fixtures/julius-sample.wav'})
 print('VAD',windows(audio,duration),flush=True)
 for name in ['small','turbo']:
  started=time.monotonic();value=engine.call({'kind':'asr','audio':str(audio),'start':0,'end':duration,'model':name},timeout=300)
  print('ASR',name,value,round(time.monotonic()-started,2),flush=True)
  alignment=engine.call({'kind':'align','audio':str(audio),'start':0,'end':duration,'model':name,'text':'今日はいい天気だ。'},timeout=300)
  print('ALIGNMENT',name,alignment,flush=True)
  (job/f'{name}.json').write_text(json.dumps({'asr':value,'alignment':alignment},ensure_ascii=False,indent=2),'utf-8')
finally:engine.stop()
