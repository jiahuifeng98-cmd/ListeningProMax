"""Bounded, cached morphology pass over already aligned words."""
from pathlib import Path
import os,json,hashlib,subprocess

def segment_aligned(root,items,job,duration_ms=0):
    from worker import atomic_json,read_json,content
    signature=hashlib.sha256(('jlpt-v3\n'+json.dumps(items,ensure_ascii=False,sort_keys=True)).encode()).hexdigest()
    cache=root/'data/segmentation'/f'{signature}.json'
    saved=read_json(cache)
    if isinstance(saved,list):return saved
    request=job/'segmentation-input.json';output=job/'segmentation-output.json'
    atomic_json(request,{'sentences':items,'durationMs':duration_ms})
    node=os.environ.get('LPM_NODE') or str(root/('app/ListeningProMax.App.exe' if (root/'app').exists() else 'node_modules/electron/dist/electron.exe'))
    script=os.environ.get('LPM_SEGMENTER') or str(root/('app/resources/app/out/segmenter.cjs' if (root/'app').exists() else 'out/segmenter.cjs'))
    env={**os.environ,'ELECTRON_RUN_AS_NODE':'1'}
    result=subprocess.run([node,script,str(request),str(output),str(root)],env=env,cwd=root,capture_output=True,timeout=90,creationflags=0x08000000)
    if result.returncode:raise RuntimeError('断句未完成，原文稿已保留：'+result.stderr.decode('utf-8','replace')[-350:])
    value=read_json(output)
    if not isinstance(value,list) or content(''.join(s['text'] for s in value))!=content(''.join(s['text'] for s in items)):raise RuntimeError('断句字词校验失败，保留原稿')
    atomic_json(cache,value);return value
