"""Run with the DISTRIBUTED Python, isolated PATH/proxies, and bundled resources only."""
from pathlib import Path
import os,sys,json,time,wave,shutil
root=Path(sys.argv[1]).resolve();project=Path(__file__).resolve().parents[1]
os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',PYTHONDONTWRITEBYTECODE='1',HTTP_PROXY='http://127.0.0.1:9',HTTPS_PROXY='http://127.0.0.1:9')
sys.path.insert(0,str(root/'worker'))
from worker import Inference,extract,windows
job=root/'cache/share-inference';job.mkdir(parents=True,exist_ok=True)
engine=Inference(root,job);report={'passed':False,'checks':[],'timings':{}}
try:
 source=root/'cache/share-inference/sample.wav';shutil.copyfile(project/'reports/fixtures/julius-sample.wav',source)
 t=time.monotonic();audio,duration=extract(root,{'id':'share-smoke-audio','sourceMedia':source.relative_to(root).as_posix()})
 report['checks'].append('bundled FFmpeg decoded public sample')
 assert windows(audio,duration);report['checks'].append('bundled CPU VAD found speech')
 for name in ['small','turbo']:
  t=time.monotonic();r=engine.call({'kind':'asr','audio':str(audio),'start':0,'end':duration,'model':name},timeout=300)
  assert r['segments'];report['timings'][name]=round(time.monotonic()-t,2);report['checks'].append(name+' offline CPU ASR')
  r=engine.call({'kind':'align','audio':str(audio),'start':0,'end':duration,'model':name,'text':'今日はいい天気だ。'},timeout=300)
  assert r['segments'];report['checks'].append(name+' local alignment')
 r=engine.call({'kind':'translate','texts':['今日はいい天気ですね。']},timeout=300);assert r;report['checks'].append('bundled M2M100 offline translation');report['translation']=r
 report['passed']=True
finally:
 engine.stop();(project/'reports/share-v19/inference.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(report,ensure_ascii=False),flush=True)
