from pathlib import Path
import sys,subprocess,os,time,json,ctypes
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'cache/benchmark-deps'))
import psutil
folder=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'release/ListeningProMax';env=dict(os.environ);env.pop('ELECTRON_RUN_AS_NODE',None)
before={p.pid for p in psutil.process_iter()};start=time.monotonic()
subprocess.run([str(folder/'ListeningProMax.exe')],cwd=folder,env=env,timeout=15,check=True)
target=None;window=None
user32=ctypes.windll.user32
callback_type=ctypes.WINFUNCTYPE(ctypes.c_bool,ctypes.c_void_p,ctypes.c_void_p)
for _ in range(100):
 for p in psutil.process_iter(['exe','cmdline']):
  if p.pid not in before and (p.info['exe'] or '').lower()==str(folder/'app/ListeningProMax.App.exe').lower() and not any('--type=' in a for a in p.info['cmdline'] or []):target=p
 if target:
  def visit(hwnd,_):
   global window
   pid=ctypes.c_ulong();user32.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
   if pid.value==target.pid and user32.IsWindowVisible(hwnd):window=hwnd
   return True
  user32.EnumWindows(callback_type(visit),0)
  if window:break
 time.sleep(.1)
if not target or not window:raise RuntimeError('Launcher did not display application window')
try:
 variables=target.environ()
 for key in ['LPM_ROOT','TEMP','TMP','APPDATA','LOCALAPPDATA']:assert Path(variables[key]).is_relative_to(folder),(key,variables[key])
 report={'passed':True,'visibleWindowMs':round((time.monotonic()-start)*1000),'paths':{key:variables[key] for key in ['LPM_ROOT','TEMP','TMP','APPDATA','LOCALAPPDATA']}}
 report_file=root/('reports/share-launcher.json' if len(sys.argv)>1 else 'reports/launcher.json')
 report_file.write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print(json.dumps(report,ensure_ascii=False),flush=True)
finally:
 user32.PostMessageW(ctypes.c_void_p(window),0x0010,0,0)
 try:target.wait(timeout=15)
 except psutil.TimeoutExpired:target.terminate()
