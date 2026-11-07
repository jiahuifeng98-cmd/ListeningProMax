"""Bounded local ASR readability check of the final mix, not an app accuracy test."""
from pathlib import Path
import json,subprocess,sys,time,re
ROOT=Path(__file__).resolve().parents[1];REPORT=ROOT/'reports/share-20261106'
if '--recognize' not in sys.argv:
    result=subprocess.run([sys.executable,__file__,'--recognize'],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=150)
    (REPORT/'narration-asr.log').write_text(result.stdout+result.stderr,'utf-8')
    print(result.stdout)
    if result.returncode:raise RuntimeError(result.stderr[-2000:])
else:
    from faster_whisper import WhisperModel
    import numpy as np
    start=time.monotonic()
    model=WhisperModel(str(ROOT/'models/turbo'),device='cpu',compute_type='int8',cpu_threads=4,num_workers=1,local_files_only=True)
    ff=ROOT/'runtime/python/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
    raw=subprocess.check_output([str(ff),'-v','error','-i',str(REPORT/'ListeningProMax-宣传片.mp4'),'-f','f32le','-ar','16000','-ac','1','-'])
    audio=np.frombuffer(raw,'<f4').copy()
    segs,info=model.transcribe(audio,language='zh',beam_size=5,condition_on_previous_text=False,vad_filter=False)
    segments=[{'start':s.start,'end':s.end,'text':s.text} for s in segs]
    expected=''.join(x['text'] for x in json.loads((REPORT/'voiceover.json').read_text('utf-8'))['lines'])
    actual=''.join(s['text'] for s in segments)
    report={'scope':'Unprompted local ASR of the 20-second final mix; supplementary readability evidence only','model':'local large-v3-turbo INT8','seconds':time.monotonic()-start,'expected':expected,'recognized':actual,'segments':segments}
    (REPORT/'narration-asr.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps(report,ensure_ascii=False))
