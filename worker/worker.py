"""Isolated, resumable local inference. stdout is exclusively NDJSON events."""
import os, sys, json, time, threading, subprocess, hashlib, re, uuid, wave, contextlib, difflib, socket, urllib.request, unicodedata
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))

def emit(kind, **values):
    print(json.dumps({'type':kind, **values}, ensure_ascii=False), flush=True)

def atomic_json(file, value):
    file=Path(file); file.parent.mkdir(parents=True,exist_ok=True)
    temp=file.with_suffix(file.suffix+'.tmp'); temp.write_text(json.dumps(value,ensure_ascii=False),'utf-8'); temp.replace(file)

def content(text): return ''.join(c for c in text if not c.isspace() and not unicodedata.category(c).startswith(('P','Z')))
def sentences(text): return [s for s in re.findall(r'[^。！？!?\n]+[。！？!?]*|[^\n]+',text) if s.strip()]
def uid(): return str(uuid.uuid4())
def progress(value, stage): emit('progress',progress=max(0,min(1,value)),stage=stage)
def make_sentence(text,start=None,end=None,words=None,issues=None,id=None):
    return dict(id=id or uid(),text=text,startMs=start,endMs=end,words=words or [],issues=issues or [])

class Inference:
    """One reusable subprocess; a timed-out native inference can be terminated."""
    def __init__(self, root, job): self.root=root; self.job=job; self.cache=job; self.proc=None
    def stop(self):
        if self.proc and self.proc.poll() is None:
            self.proc.kill(); self.proc.wait(timeout=20)
        if self.proc:
            for stream in (self.proc.stdin,self.proc.stdout):
                if stream:stream.close()
        self.proc=None
        if getattr(self,'log',None):self.log.close();self.log=None
    def call(self, request, timeout=300):
        if not self.proc or self.proc.poll() is not None:
            self.stop()
            self.log=open(self.job/'inference.log','ab')
            self.proc=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--inference',str(self.root)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.log,text=True,encoding='utf-8',creationflags=0x08000000)
        import queue
        result=queue.Queue()
        self.proc.stdin.write(json.dumps(request,ensure_ascii=False)+'\n');self.proc.stdin.flush()
        proc=self.proc
        def read():
            try: result.put(proc.stdout.readline())
            except Exception: result.put('')
        threading.Thread(target=read,daemon=True).start()
        try: line=result.get(timeout=timeout)
        except queue.Empty:
            self.stop(); raise TimeoutError('当前片段推理超时')
        if not line: self.stop();raise RuntimeError('推理进程异常退出，请检查任务日志')
        response=json.loads(line)
        if 'error' in response: raise RuntimeError(response['error'])
        return response['result']

def inference_server(root):
    model=None; model_name=None; translator=None; tokenizer=None
    for line in sys.stdin:
        try:
            request=json.loads(line)
            with contextlib.redirect_stdout(sys.stderr):
                kind=request['kind']
                if kind in ('asr','align'):
                    import numpy as np
                    import stable_whisper
                    name=request.get('model','turbo')
                    if model is None or model_name!=name:
                        model=None;translator=None;tokenizer=None
                        model=stable_whisper.load_faster_whisper(str(root/'models'/name),device='cpu',compute_type='int8',cpu_threads=max(1,min(4,(os.cpu_count() or 4)-1)),local_files_only=True)
                        model_name=name
                    with wave.open(request['audio'],'rb') as w:
                        rate=w.getframerate();w.setpos(min(w.getnframes(),round(request['start']*rate))); audio=np.frombuffer(w.readframes(round((request['end']-request['start'])*rate)),dtype=np.int16).astype(np.float32)/32768
                    if kind=='asr':
                        output=model.transcribe(audio,language='ja',word_timestamps=True,vad=False,regroup=False,suppress_silence=False,verbose=None,condition_on_previous_text=False,beam_size=5)
                    else:
                        if not hasattr(model,'align'): raise RuntimeError('当前 stable-ts 缺少 faster-whisper 对齐支持')
                        output=model.align(audio,request['text'],language='ja',verbose=None,suppress_silence=True,vad=False,original_split=request.get('originalSplit',False))
                    value=output.to_dict() if output else {'segments':[]}
                elif kind=='translate':
                    import ctranslate2
                    os.environ['USE_TORCH']='0'
                    os.environ['USE_TF']='0'
                    from transformers import M2M100Tokenizer
                    from transformers.models.m2m_100 import tokenization_m2m_100
                    import sentencepiece
                    # SentencePiece's native filename loader is not Unicode-safe
                    # in this Windows wheel. Python opens the file, then passes bytes.
                    tokenization_m2m_100.load_spm=lambda file,kwargs:sentencepiece.SentencePieceProcessor(model_proto=Path(file).read_bytes(),**kwargs)
                    if translator is None:
                        print('translation: loading model',file=sys.stderr,flush=True)
                        model=None;model_name=None
                        folder=str(root/'models'/'translation')
                        translator=ctranslate2.Translator(folder,device='cpu',compute_type='int8',inter_threads=1,intra_threads=4)
                        print('translation: loading tokenizer',file=sys.stderr,flush=True)
                        tokenizer=M2M100Tokenizer.from_pretrained(folder,local_files_only=True);tokenizer.src_lang='ja'
                    print('translation: tokenizing',file=sys.stderr,flush=True)
                    source=[tokenizer.convert_ids_to_tokens(tokenizer.encode(t)) for t in request['texts']]
                    print('translation: decoding',file=sys.stderr,flush=True)
                    output=translator.translate_batch(source,target_prefix=[['__zh__'] for _ in source],beam_size=3,max_decoding_length=384)
                    print('translation: complete',file=sys.stderr,flush=True)
                    value=[tokenizer.decode(tokenizer.convert_tokens_to_ids(o.hypotheses[0][1:]),skip_special_tokens=True) for o in output]
                else: raise RuntimeError('未知推理类型')
            print(json.dumps({'result':value},ensure_ascii=False),flush=True)
        except Exception as e:
            import traceback;traceback.print_exc(file=sys.stderr)
            print(json.dumps({'error':str(e)},ensure_ascii=False),flush=True)

def extract(root,lesson):
    folder=root/'data'/'media'/lesson['id'];folder.mkdir(parents=True,exist_ok=True)
    generation=hashlib.sha256(lesson['sourceMedia'].encode()).hexdigest()[:12]
    playback=folder/f'playback-{generation}.flac';analysis=folder/f'analysis-{generation}.wav'
    import imageio_ffmpeg
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    source=root/lesson['sourceMedia']
    # Original browser-supported audio already has an exact media clock. Keep it
    # instead of materializing another large stereo PCM WAV. Video/other codecs
    # use lossless FLAC, retaining signal quality without a giant PCM copy.
    playable=source.suffix.lower() in ('.mp3','.m4a','.wav','.flac','.ogg','.opus')
    if playable:playback=source
    outputs=[(analysis,16000,1)] if playable else [(playback,48000,2),(analysis,16000,1)]
    for output,rate,channels in outputs:
        if output.exists():continue
        temp=output.with_name(output.stem+'.partial'+output.suffix)
        codec='flac' if output.suffix=='.flac' else 'pcm_s16le'
        proc=subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(source),'-vn','-map','0:a:0','-ar',str(rate),'-ac',str(channels),'-c:a',codec,str(temp)],capture_output=True,timeout=600,creationflags=0x08000000)
        if proc.returncode:raise RuntimeError('无法读取音轨：'+proc.stderr.decode('utf-8','replace')[-600:])
        temp.replace(output)
    with wave.open(str(analysis),'rb') as w:duration=w.getnframes()/w.getframerate()
    emit('media',mediaFile=playback.relative_to(root).as_posix(),durationMs=round(duration*1000))
    waveform=folder/f'waveform-{generation}.json'
    if not waveform.exists():
        import numpy as np
        peaks=[]
        with wave.open(str(analysis),'rb') as w:
            while data:=w.readframes(1600): peaks.append(round(float(np.abs(np.frombuffer(data,dtype=np.int16).astype(np.float32)).max())/32768,3))
        atomic_json(waveform,peaks)
    return analysis,duration

def windows(audio,duration):
    """Local VAD boundaries retain absolute sample coordinates and overlap."""
    import numpy as np
    from silero_vad import load_silero_vad, get_speech_timestamps
    import torch
    vad=load_silero_vad(onnx=True);regions=[]
    with wave.open(str(audio),'rb') as w:
        for offset in range(0,int(duration)+1,300):
            w.setpos(min(w.getnframes(),offset*16000));data=np.frombuffer(w.readframes(300*16000),dtype=np.int16).astype(np.float32)/32768
            if len(data)<512:continue
            regions.extend([(offset+r['start']/16000,offset+r['end']/16000) for r in get_speech_timestamps(torch.from_numpy(data),vad,sampling_rate=16000,min_silence_duration_ms=450,speech_pad_ms=160)])
    if not regions:return []
    groups=[]; start,end=regions[0]
    for a,b in regions[1:]:
        if b-start<=28 and a-end<2:end=b
        else:groups.append((start,end));start,end=a,b
    groups.append((start,end))
    result=[]
    for a,b in groups:
        while b-a>28:result.append((max(0,a-.35),min(duration,a+28.35),a,a+28));a+=28
        result.append((max(0,a-.35),min(duration,b+.35),a,b))
    return result

def words_from(result,offset):
    words=[]
    for segment in result.get('segments',[]):
        for word in segment.get('words',[]):
            text=word.get('word',word.get('text',''));a=round((word['start']+offset)*1000);b=round((word['end']+offset)*1000)
            if text:words.append(dict(text=text,startMs=a,endMs=b))
    return words

def transcribe(engine,audio,duration,model,job,bounds=None):
    from asr_guard import GUARD_VERSION, verify_outros
    cache_dir=getattr(engine,'cache',job)
    window_file=cache_dir/'windows-v1.json'
    chunks=read_json(window_file)
    if chunks is None:chunks=windows(audio,duration);atomic_json(window_file,chunks)
    all_words=[];failures=[]
    if bounds:
        lower,upper=bounds
        chunks=[(max(a,lower),min(b,upper),max(c,lower),min(d,upper)) for a,b,c,d in chunks if b>lower and a<upper]
    if not chunks:return [],['未检测到可识别语音']
    def run(start,end,depth=0):
        key=hashlib.sha256(f'{model}:{start}:{end}'.encode()).hexdigest()[:20];cache=cache_dir/f'asr-{key}.json'
        guarded=cache_dir/f'asr-{key}-{GUARD_VERSION}.json'
        saved=read_json(guarded)
        if isinstance(saved,list):return saved
        try:
            raw=read_json(cache_dir/f'raw-asr-{key}.json')
            if raw and isinstance(raw.get('result'),dict):
                result=raw['result']
            else:
                legacy=read_json(cache)
                if isinstance(legacy,list):
                    # No probabilities/raw provenance: preserve old results.
                    return legacy
                result=engine.call(dict(kind='asr',audio=str(audio),start=start,end=end,model=model),timeout=max(240,(end-start)*20))
                atomic_json(cache_dir/f'raw-asr-{key}.json',{'startSeconds':start,'endSeconds':end,'model':model,'result':result})
                atomic_json(cache,words_from(result,start))
            def verify(lower,upper):
                progress(.12,'复听异常识别片段（仅局部）')
                return engine.call(dict(kind='asr',audio=str(audio),start=lower,end=upper,model=model),timeout=120)
            value,audit=verify_outros(result,start,end,duration,verify)
            if audit:atomic_json(cache_dir/f'asr-audit-{key}-{GUARD_VERSION}.json',audit)
            # Leave failed/empty verification retryable rather than caching it forever.
            if not any(a.get('error') or not a.get('verification',{}).get('segments') for a in audit):
                atomic_json(guarded,value)
            return value
        except Exception:
            engine.stop()
            if depth<1 and end-start>6:
                mid=(start+end)/2
                return run(start,mid,depth+1)+run(mid,end,depth+1)
            raise
    for i,(start,end,core_start,core_end) in enumerate(chunks):
        # Only discard overlap shared with a neighbouring window. VAD padding is
        # not an ownership boundary: Whisper can place the initial word there.
        core_start=(chunks[i-1][3]+core_start)/2 if i and chunks[i-1][1]>start else start
        core_end=(core_end+chunks[i+1][2])/2 if i+1<len(chunks) and chunks[i+1][0]<end else end
        progress(.12+.42*i/len(chunks),f'识别语音 {i+1}/{len(chunks)}')
        try:
            words=run(start,end)
            for word in words:
                midpoint=(word['startMs']+word['endMs'])/2000
                if midpoint<core_start or midpoint>core_end:continue
                if all_words and word['text']==all_words[-1]['text'] and abs(word['startMs']-all_words[-1]['startMs'])<500:continue
                all_words.append(word)
        except Exception as e:failures.append({'startMs':round(start*1000),'endMs':round(end*1000),'error':str(e)})
    result=[];group=[]
    for word in all_words:
        if group and (word['startMs']-group[-1]['endMs']>1400 or word['endMs']-group[0]['startMs']>28000):
            result.append(make_sentence(''.join(w['text'] for w in group),group[0]['startMs'],group[-1]['endMs'],group));group=[]
        group.append(word)
        if re.search('[。！？!?]$',word['text']):result.append(make_sentence(''.join(w['text'] for w in group),group[0]['startMs'],group[-1]['endMs'],group));group=[]
    if group:result.append(make_sentence(''.join(w['text'] for w in group),group[0]['startMs'],group[-1]['endMs'],group))
    result.sort(key=lambda s:s['startMs'])
    atomic_json(job/'recognized.json',result)
    atomic_json(job/'failed-regions.json',failures)
    return result,failures

def locate_original(original,recognized,duration):
    """Monotonic text anchors; unmatched text never receives invented times."""
    source='';positions=[]
    for s in recognized:
        for w in s['words']:
            for c in content(w['text']):source+=c;positions.append((w['startMs'],w['endMs']))
    target=''.join(content(s['text']) for s in original)
    matcher=difflib.SequenceMatcher(None,target,source,autojunk=False);mapping={}
    for a,b,n in matcher.get_matching_blocks():
        for k in range(n):mapping[a+k]=b+k
    output=[];offset=0
    for s in original:
        size=len(content(s['text']));hits=[mapping[x] for x in range(offset,offset+size) if x in mapping];offset+=size
        if size and len(hits)/size>=.7:
            a=positions[min(hits)][0];b=positions[max(hits)][1]
            if b-a<=max(30000,size*600):output.append({**s,'startMs':a,'endMs':b,'issues':[]});continue
        output.append({**s,'startMs':None,'endMs':None,'words':[],'issues':['原文与音频未可靠匹配，请校正文字或手动设置时间']})
    return output

def align_all(engine,audio,items,duration,model,job,from_id=None):
    output=json.loads(json.dumps(items));start_index=next((i for i,s in enumerate(output) if s['id']==from_id),0);stop=len(output)
    if from_id:
        for i in range(start_index+1,len(output)):
            if output[i].get('anchor'):stop=i;break
    previous=0
    for i,s in enumerate(output):
        if i<start_index or i>=stop or s.get('anchor'):
            previous=s.get('endMs') or previous;continue
        progress(.6+.36*(i-start_index)/max(1,stop-start_index),f'精确对齐 {i+1}/{len(output)}')
        if s['startMs'] is None:
            s['issues']=list(set(s.get('issues',[])+['需要可靠音频区间，未强制分配时间']));continue
        start=max(previous/1000-(0 if i and output[i-1].get('anchor') else .15),s['startMs']/1000-.8,0)
        end=min(duration,s['endMs']/1000+.8)
        next_anchor=next((n for n in output[i+1:] if n.get('anchor')),None)
        if next_anchor:end=min(end,next_anchor['startMs']/1000)
        if end<=start: s['issues']=['手工锚点之间没有足够时间'];continue
        key=hashlib.sha256(json.dumps([model,start,end,content(s['text'])],ensure_ascii=False).encode()).hexdigest()[:20];cache=getattr(engine,'cache',job)/f'align-{key}.json'
        cache_source=cache
        try:
            saved=read_json(cache)
            if saved is None:
                for text_variant in [s['text'],s['text'].rstrip('。！？!?')]:
                    legacy=hashlib.sha256(json.dumps([model,start,end,text_variant],ensure_ascii=False).encode()).hexdigest()[:20]
                    candidate=read_json(cache.parent/f'align-{legacy}.json')
                    if candidate and content(''.join(w['text'] for w in candidate))==content(s['text']):saved=candidate;cache_source=cache.parent/f'align-{legacy}.json';break
            if isinstance(saved,list) and saved and content(''.join(w['text'] for w in saved))==content(s['text']):words=saved
            else:
                result=engine.call(dict(kind='align',audio=str(audio),start=start,end=end,model=model,text=s['text']),timeout=max(240,(end-start)*20))
                atomic_json(cache.parent/f'raw-align-{key}.json',{'startSeconds':start,'endSeconds':end,'model':model,'result':result})
                words=words_from(result,start)
            if not words or content(''.join(w['text'] for w in words))!=content(s['text']):raise RuntimeError('对齐结果未覆盖全部文字')
            a,b=words[0]['startMs'],words[-1]['endMs']
            if a<max(0,previous-150) or b<=a or b>round(duration*1000):raise RuntimeError('时间边界异常')
            atomic_json(cache,words)
            preserved=[issue for issue in s.get('issues',[]) if '标点' in issue]
            if any(w['endMs']-w['startMs']<=1 for w in words):preserved.append('词级边界需复核（存在零时长词）')
            s.update(startMs=a,endMs=b,words=words,issues=preserved);previous=b
        except Exception as e:
            # A rejected cached boundary must not trap every subsequent retry.
            # Raw inference evidence and successful windows remain untouched.
            try:cache.unlink(missing_ok=True)
            except OSError:pass
            if cache_source!=cache:
                try:cache_source.unlink(missing_ok=True)
                except OSError:pass
            s['issues']=[f'待校准：{e}']
    return output

def read_json(file):
    try:return json.loads(Path(file).read_text('utf-8'))
    except (OSError,ValueError):return None

def analysis_cache(root,lesson,model,job):
    source=root/lesson['sourceMedia'];stat=source.stat()
    signature=hashlib.sha256(json.dumps([lesson['sourceMedia'],stat.st_size,stat.st_mtime_ns,model,'beam5-vad1-align1']).encode()).hexdigest()[:24]
    folder=root/'data'/'analysis'/lesson['id']/signature;folder.mkdir(parents=True,exist_ok=True)
    # Migrate v1 completed windows once. Never reuse another audio or model.
    if not (folder/'migrated.json').exists():
        import shutil
        for old in (root/'data/jobs').glob('*/request.json'):
            request=read_json(old) or {};prior=request.get('lesson',{})
            if prior.get('sourceMedia')!=lesson['sourceMedia'] or request.get('settings',{}).get('model','turbo')!=model:continue
            # Source copies are immutable UUID-named files. Replaced files invalidate reuse.
            if stat.st_mtime>old.stat().st_mtime:continue
            for file in old.parent.glob('*.json'):
                if file.name.startswith(('asr-','align-','raw-asr-','raw-align-')) and not (folder/file.name).exists():
                    shutil.copyfile(file,folder/file.name)
        atomic_json(folder/'migrated.json',{'version':1})
    return folder

def organize(root,text,job):
    from text_processing import organize_text
    # No generative model is needed to join line-wrapped, already punctuated text.
    key=hashlib.sha256(text.encode()).hexdigest()
    cache=root/'data'/'text-cache'/f'{key}.json'
    saved=read_json(cache)
    if saved and saved.get('original')==text and content(saved.get('text',''))==content(text):return saved['text']
    progress(.5,'整理已有标点与换行')
    result=organize_text(text)
    atomic_json(cache,{'original':text,'text':result})
    # Formatting an already formatted paragraph is an immediate cache hit too.
    atomic_json(root/'data'/'text-cache'/f'{hashlib.sha256(result.encode()).hexdigest()}.json',{'original':result,'text':result})
    return result


def regroup_recognized(root,items,job):
    # ASR already supplies punctuation and pause/window boundaries. Rejoining the
    # entire recording can turn an unpunctuated window into a multi-minute align
    # request. Keep its proven segmentation, words and absolute anchors intact.
    output=json.loads(json.dumps(items))
    for s in output:
        if s['text'].strip() and not re.search(r'[。！？!?][」』）)]?$',s['text'].strip()):
            s['issues'].append('句末标点按语音分段补全，请复核')
    return output

def anchor_range(items,from_id,duration):
    first=next((i for i,s in enumerate(items) if s['id']==from_id),0)
    if from_id and items[first].get('anchor'):first+=1
    last=next((i for i in range(first,len(items)) if items[i].get('anchor')),len(items))
    lower=(items[first-1].get('endMs') or 0)/1000 if first else 0
    upper=items[last]['startMs']/1000 if last<len(items) else duration
    return first,last,lower,upper

def organize_original(root,items,job):
    original='\n'.join(s['text'] for s in items)
    formatted=organize(root,original,job)
    if content(formatted)!=content(original):raise RuntimeError('原文字词校验失败')
    starts=[];offset=0
    for s in items:starts.append((offset,s['id']));offset+=len(content(s['text']))
    output=[];offset=0;used=set()
    for text in sentences(formatted):
        if not content(text):continue
        prior=next((id for start,id in reversed(starts) if start<=offset),None)
        id=prior if prior not in used else uid();used.add(id)
        output.append(make_sentence(text,id=id));offset+=len(content(text))
    return output

def translate(engine,lesson,settings,root,job):
    from concurrent.futures import ThreadPoolExecutor,as_completed
    from free_translation import translate_free
    pending=[s for s in lesson['sentences'] if not s.get('translation')];total=len(pending);done=0;failed=[]
    provider='bing';online=bool(settings.get('online'))
    cache_dir=root/'data'/'translation-cache';cache_dir.mkdir(parents=True,exist_ok=True)
    groups={}
    for s in pending:groups.setdefault(s['text'],[]).append(s)
    def cached(text,source):
        return cache_dir/(hashlib.sha256((source+'\0'+text).encode()).hexdigest()+'.json')
    def deliver(text,value,source):
        nonlocal done
        for s in groups[text]:emit('translation',sentenceId=s['id'],text=text,translation=value,source=source);done+=1
        progress(done/max(1,total),f'翻译句子 {done}/{total}')
    todo=[]
    for text in groups:
        source=provider if online else 'local';saved=read_json(cached(text,source))
        if saved and saved.get('text')==text:deliver(text,saved['translation'],saved['source'])
        else:todo.append(text)
    local=[]
    if online:
        failures_in_row=0
        with ThreadPoolExecutor(max_workers=3) as pool:
            for offset in range(0,len(todo),3):
                if failures_in_row>=3:
                    if settings.get('onlineFallback',True):local.extend(todo[offset:])
                    else:failed.extend(['免费服务暂不可用']*len(todo[offset:]))
                    break
                futures={pool.submit(translate_free,text,provider):text for text in todo[offset:offset+3]}
                for future in as_completed(futures):
                    text=futures[future]
                    try:
                        value=future.result();source='微软必应 · 免费联网'
                        atomic_json(cached(text,provider),{'text':text,'translation':value,'source':source});deliver(text,value,source);failures_in_row=0
                    except Exception as e:
                        failures_in_row+=1
                        if settings.get('onlineFallback',True):local.append(text)
                        else:failed.append(str(e))
    else:local=todo
    for i in range(0,len(local),4):
        batch=local[i:i+4];progress(done/max(1,total),f'本地翻译 {done}/{total}'+('（免费服务暂不可用）' if online else ''))
        values=engine.call({'kind':'translate','texts':batch},timeout=240)
        if not isinstance(values,list) or len(values)!=len(batch) or not all(isinstance(v,str) and v.strip() for v in values):raise RuntimeError('翻译返回格式无效，可重试未完成句子')
        for text,value in zip(batch,values):
            source='M2M100 · 本地';atomic_json(cached(text,'local'),{'text':text,'translation':value,'source':source});deliver(text,value,source)
    if failed:raise RuntimeError(f'{len(failed)} 条免费翻译未完成，已保留成功译文。可重试或启用本地回退。'+failed[0][:160])
    emit('result',translated=done)


def align_split(engine,audio,lesson,pending,model):
    """Align only the original sentence; commit both halves together or neither."""
    items=json.loads(json.dumps(lesson['sentences']))
    index=next(i for i,s in enumerate(items) if s['id']==pending['id'])
    left,right=items[index:index+2]
    if left['text']+right['text']!=pending['originalText']:raise RuntimeError('拆分文字已变化，请重新选择位置')
    lower=pending['originalStartMs']/1000;upper=pending['originalEndMs']/1000
    progress(.2,'校准拆分句子的词级边界')
    result=engine.call(dict(kind='align',audio=str(audio),start=lower,end=upper,model=model,text=left['text']+'\n'+right['text'],originalSplit=True),timeout=max(60,(upper-lower)*20))
    atomic_json(engine.job/'raw-split-alignment.json',result)
    words=words_from(result,lower)
    if content(''.join(w['text'] for w in words))!=content(pending['originalText']):raise RuntimeError('拆分对齐未覆盖原句，原句已保留')
    target=len(content(left['text']));consumed=0;cut=None
    for i,w in enumerate(words):
        consumed+=len(content(w['text']))
        if consumed==target and i+1<len(words):cut=i+1;break
    if cut is None:raise RuntimeError('光标位置没有可靠词级边界，请换到完整词语之间拆分；原句已保留')
    a,b=words[:cut],words[cut:]
    if not a or not b or a[0]['startMs']>=a[-1]['endMs'] or b[0]['startMs']>=b[-1]['endMs'] or a[-1]['endMs']>b[0]['startMs']:raise RuntimeError('拆分边界无效，原句已保留')
    for sentence,part in [(left,a),(right,b)]:
        issues=['词级边界需复核（存在零时长词）'] if any(w['endMs']<=w['startMs'] for w in part) else []
        sentence.update(words=part,startMs=part[0]['startMs'],endMs=part[-1]['endMs'],issues=issues,anchor=False)
    if pending.get('originalAnchor'):
        left.update(startMs=pending['originalStartMs'],anchor=True)
        right.update(endMs=pending['originalEndMs'],anchor=True)
    if left['startMs']<pending['originalStartMs'] or right['endMs']>pending['originalEndMs']:raise RuntimeError('拆分结果超出原句区间，原句已保留')
    return items

def main(request):
    root=Path(request['root']);job=Path(request['jobDir']);lesson=request['lesson'];settings=request['settings'];kind=request['kind'];engine=Inference(root,job)
    try:
        if kind=='organize':emit('result',reference=organize(root,lesson['reference'],job));return
        if kind=='translate':translate(engine,lesson,settings,root,job);return
        if kind=='segment':
            from segmentation import segment_aligned
            progress(.15,'按日语词形与句尾整理断句')
            if not lesson['sentences']:raise RuntimeError('请先生成文稿')
            result=segment_aligned(root,lesson['sentences'],job,lesson.get('durationMs',0))
            atomic_json(job/'result.json',result);emit('result',sentences=result);return
        if not lesson.get('sourceMedia'):raise RuntimeError('请先关联音频文件')
        progress(.02,'提取音轨与波形');audio,duration=extract(root,lesson)
        if request.get('mediaOnly'):
            emit('result');return
        if request.get('keepSubtitleTimes'):
            items=lesson['sentences']
            for s in items:
                if s['endMs']>duration*1000:s['issues']=['字幕时间超出音频，请重新校准'];s['startMs']=s['endMs']=None
            emit('result',sentences=items);return
        model=settings.get('model','turbo')
        engine.cache=analysis_cache(root,lesson,model,job)
        pending=request.get('pendingSplit')
        if pending and pending.get('originalStartMs') is not None and pending.get('originalEndMs') is not None:
            result=align_split(engine,audio,lesson,pending,model)
            atomic_json(job/'result.json',result);emit('result',sentences=result);return
        if kind=='realign' and not lesson['sentences']:kind='analyze'
        if kind=='analyze':
            recognized,failures=transcribe(engine,audio,duration,model,job)
            if not recognized:raise RuntimeError('未检测到可识别的日语语音')
            original_items=lesson['sentences']
            if lesson.get('originalText') and original_items and not any(s.get('startMs') is not None for s in original_items):
                try:original_items=organize_original(root,original_items,job)
                except Exception as e:
                    for s in original_items:s['issues'].append('标点整理待复核：'+str(e))
            items=locate_original(original_items,recognized,duration) if lesson.get('originalText') and original_items else recognized
            if not lesson.get('originalText'):
                try:items=regroup_recognized(root,items,job)
                except Exception as e:
                    for s in items:s['issues'].append('标点整理待复核：'+str(e))
        else:
            items=json.loads(json.dumps(lesson['sentences']))
            if request.get('fromId'):ranges=[anchor_range(items,request['fromId'],duration)]
            else:
                ranges=[];first=0;lower=0
                for i,s in enumerate(items):
                    if s.get('anchor'):
                        ranges.append((first,i,lower,s['startMs']/1000));first=i+1;lower=s['endMs']/1000
                ranges.append((first,len(items),lower,duration))
            failures=[]
            for first,last,lower,upper in ranges:
                if first<last and upper>lower:
                    recognized,failed=transcribe(engine,audio,duration,model,job,(lower,upper));failures.extend(failed)
                    items[first:last]=locate_original(items[first:last],recognized,duration)
        if not items:raise RuntimeError('没有可处理的句子，请生成文稿后再校准')
        if kind=='analyze' and not lesson['sentences']:
            emit('draft',sentences=items)
        result=align_all(engine,audio,items,duration,model,job,request.get('fromId'))
        if kind=='analyze' and not lesson.get('originalText'):
            from segmentation import segment_aligned
            engine.stop()  # Release the ASR model before loading morphology data.
            progress(.97,'整理完整句子')
            result=segment_aligned(root,result,job,round(duration*1000))
        atomic_json(job/'result.json',result)
        affected=result
        if request.get('fromId'):
            first,last,_,_=anchor_range(result,request['fromId'],duration);affected=result[first:last]
        if kind=='realign' and (failures or any(any(any(term in issue for term in ['待校准','未可靠匹配','需要可靠音频','没有足够时间']) for issue in s.get('issues',[])) for s in affected if not s.get('anchor'))):
            raise RuntimeError('部分句子未能可靠对齐，已保留原时间轴；候选结果保存在任务目录，可纠正文稿或锚点后重试。')
        emit('result',sentences=result)
        if failures:emit('error',message=f'{len(failures)} 个音频片段尚未识别，已保留成功结果。重试可继续；详情见 failed-regions.json。')
    finally:engine.stop()

if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='--inference':inference_server(Path(sys.argv[2]))
    else:
        from process_job import own_children
        own_children()
        def heartbeats():
            while True:time.sleep(3);emit('heartbeat')
        threading.Thread(target=heartbeats,daemon=True).start()
        try:main(json.loads(Path(sys.argv[1]).read_text('utf-8')))
        except Exception as e:
            import traceback;traceback.print_exc(file=sys.stderr);emit('error',message=str(e));sys.exit(1)
