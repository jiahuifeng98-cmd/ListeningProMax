from pathlib import Path
import sys,subprocess,json,time
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'cache/benchmark-deps'))
import psutil
code="import sys,subprocess,time;sys.path.insert(0,sys.argv[1]);from process_job import own_children;own_children();p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)']);print(p.pid,flush=True);time.sleep(60)"
p=subprocess.Popen([sys.executable,'-c',code,str(root/'worker')],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 line=p.stdout.readline()
 if not line:raise RuntimeError(p.stderr.read())
 child=int(line);assert psutil.pid_exists(child);p.kill();p.wait()
 for _ in range(30):
  if not psutil.pid_exists(child):break
  time.sleep(.1)
 assert not psutil.pid_exists(child),'Orphan inference process survived task crash'
 (root/'reports/process-job.json').write_text(json.dumps({'passed':True,'check':'killing task parent automatically terminates descendant via Windows Job Object'},indent=2),'utf-8');print('JOB PASS',flush=True)
finally:
 if p.poll() is None:p.kill();p.wait()
