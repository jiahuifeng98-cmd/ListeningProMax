from pathlib import Path
import sys,time,json
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'cache/benchmark-deps'))
import psutil
pid=int(sys.argv[1]);target=Path(sys.argv[2]);peak=0;python_peak=0;crt=set();samples=0
try:
 parent=psutil.Process(pid)
 while parent.is_running():
  try:
   processes=[parent]+parent.children(recursive=True);total=0;infer=0
   for p in processes:
    try:
     rss=p.memory_info().rss;total+=rss
     if p.name().lower() in ['python.exe','llama-server.exe']:
      infer+=rss
      if samples%10==0:
       crt.update(m.path for m in p.memory_maps() if Path(m.path).name.lower().startswith(('msvcp140','vcruntime140','concrt140','vcomp140')))
    except (psutil.Error,OSError):pass
   peak=max(peak,total);python_peak=max(python_peak,infer);samples+=1
   if samples%20==0:target.write_text(json.dumps({'peakAppTreeBytes':peak,'peakInferenceTreeBytes':python_peak,'samples':samples,'crtPaths':sorted(crt)},ensure_ascii=False,indent=2),'utf-8')
   time.sleep(.3)
  except psutil.Error:break
except psutil.Error:pass
target.write_text(json.dumps({'peakAppTreeBytes':peak,'peakInferenceTreeBytes':python_peak,'samples':samples,'crtPaths':sorted(crt)},ensure_ascii=False,indent=2),'utf-8')
