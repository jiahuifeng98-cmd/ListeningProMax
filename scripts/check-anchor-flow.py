from pathlib import Path
import sys,wave,json,subprocess,time
root=Path(__file__).resolve().parents[1];job=root/'reports/anchor-flow';job.mkdir(exist_ok=True)
audio=job/'anchor.wav'
with wave.open(str(root/'reports/fixtures/julius-sample.wav')) as w:sample=w.readframes(w.getnframes())
with wave.open(str(audio),'wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0'*(30*32000))
with open(audio,'r+b') as f:
 for offset in [2,10,20]:f.seek(44+offset*32000);f.write(sample)
items=[{'id':'first','text':'今日はいい天気だ。','startMs':2000,'endMs':4100,'anchor':True,'words':[],'issues':[]},{'id':'middle','text':'今日はいい天気だ。','startMs':6000,'endMs':7700,'words':[],'issues':[]},{'id':'last','text':'今日はいい天気だ。','startMs':20000,'endMs':22100,'anchor':True,'words':[],'issues':[]}]
request={'root':str(root),'jobDir':str(job),'kind':'realign','fromId':'first','lesson':{'id':'anchor-flow','sourceMedia':audio.relative_to(root).as_posix(),'originalText':'今日はいい天気だ。'*3,'sentences':items,'reference':'独立資料','version':1},'settings':{'model':'turbo','online':False}}
file=job/'request.json';file.write_text(json.dumps(request,ensure_ascii=False),'utf-8');start=time.monotonic()
with open(job/'stderr.log','w',encoding='utf-8') as log:
 p=subprocess.Popen([sys.executable,str(root/'worker/worker.py'),str(file)],stdout=subprocess.PIPE,stderr=log,text=True,encoding='utf-8');events=[]
 for line in p.stdout:
  event=json.loads(line);events.append(event)
  if event['type']!='heartbeat':print(event['type'],event.get('stage',event.get('message','')),flush=True)
 p.wait()
assert p.returncode==0,events
result=next(e['sentences'] for e in events if e['type']=='result')
assert result[0]==items[0] and result[-1]==items[-1],result
assert 10000<=result[1]['startMs']<=10700 and 11000<=result[1]['endMs']<=12000,result[1]
(job/'summary.json').write_text(json.dumps({'passed':True,'seconds':time.monotonic()-start,'before':items,'after':result,'check':'manual anchors unchanged; middle sentence relocated by audio from 6s to 10s; no duration-based shifting'},ensure_ascii=False,indent=2),'utf-8');print('ANCHOR FLOW PASS',flush=True)
