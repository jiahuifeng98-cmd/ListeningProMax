"""Two-hour sparse fixture tests absolute offsets, not natural two-hour accuracy."""
from pathlib import Path
import sys,wave,time,json,threading
root=Path(__file__).resolve().parents[1];sys.path[:0]=[str(root/'worker'),str(root/'cache/benchmark-deps')]
from worker import Inference,transcribe,align_all
import psutil
job=root/'reports/long-audio';job.mkdir(exist_ok=True);audio=job/'two-hour-sparse.wav'
with wave.open(str(root/'reports/fixtures/julius-sample.wav')) as w:
 assert w.getframerate()==16000 and w.getnchannels()==1
 sample=w.readframes(w.getnframes())
offsets=[10,3600,7180]
if not audio.exists():
 with wave.open(str(audio),'wb') as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000)
  for sec in range(7200):w.writeframesraw(b'\0'*32000)
 with open(audio,'r+b') as f:
  for offset in offsets:f.seek(44+offset*32000);f.write(sample)
peak=0;running=True
def monitor():
 global peak
 while running:
  try:peak=max(peak,sum(p.memory_info().rss for p in [psutil.Process()]+psutil.Process().children(recursive=True)))
  except psutil.Error:pass
  time.sleep(.25)
threading.Thread(target=monitor,daemon=True).start();engine=Inference(root,job);start=time.monotonic()
try:
 result,failures=transcribe(engine,audio,7200,'turbo',job)
 assert not failures,failures
 assert len(result)==3,result
 result=align_all(engine,audio,result,7200,'turbo',job)
 relative=[{'offsetSeconds':offset,'startRelativeMs':s['startMs']-offset*1000,'endRelativeMs':s['endMs']-offset*1000,'text':s['text']} for offset,s in zip(offsets,result)]
 delta=max(r['startRelativeMs'] for r in relative)-min(r['startRelativeMs'] for r in relative)
 assert delta<200,relative
 report={'passed':True,'fixture':'2 hours silence with identical real Japanese speech inserted at 10,3600,7180 seconds; NOT natural long-form audio','seconds':time.monotonic()-start,'processTreePeakBytes':peak,'relativeBoundaries':relative,'startBoundarySpreadMs':delta}
 (job/'summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print(json.dumps(report,ensure_ascii=False),flush=True)
finally:running=False;engine.stop()
