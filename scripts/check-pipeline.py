from pathlib import Path
import sys,json,subprocess,time,wave
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'worker'))
from worker import organize
job=ROOT/'reports/pipeline';job.mkdir(parents=True,exist_ok=True)
try:
 print('PUNCTUATION',organize(ROOT,'今日はいい天気だ\n散歩に行きましょう',job),flush=True)
except Exception as e:print('PUNCTUATION ERROR',repr(e),flush=True)
request={'root':str(ROOT),'jobDir':str(job),'kind':'analyze','lesson':{'id':'pipeline-fixture','sourceMedia':'reports/fixtures/julius-sample.wav','originalText':'','sentences':[],'reference':'','version':1},'settings':{'model':'turbo','online':False}}
(job/'request.json').write_text(json.dumps(request,ensure_ascii=False),'utf-8')
start=time.monotonic()
with open(job/'stderr.log','w',encoding='utf-8') as log:
 p=subprocess.Popen([sys.executable,str(ROOT/'worker/worker.py'),str(job/'request.json')],stdout=subprocess.PIPE,stderr=log,text=True,encoding='utf-8')
 events=[]
 for line in p.stdout:
  e=json.loads(line);events.append(e)
  if e['type']!='heartbeat':print(e,flush=True)
 p.wait()
(job/'events.json').write_text(json.dumps({'seconds':time.monotonic()-start,'exitCode':p.returncode,'events':events},ensure_ascii=False,indent=2),'utf-8')
sys.exit(p.returncode)
