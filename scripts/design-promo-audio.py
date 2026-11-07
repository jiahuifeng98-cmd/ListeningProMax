"""Mix licensed recorded UI foley, a funk bed and Mandarin narration.
Always start from source assets; --audio-only prepares the full renderer.
"""
from pathlib import Path
import argparse, hashlib, json, math, subprocess, wave
import av
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'reports/share-20261106'
WORK=ROOT/'cache/promo-sfx';WORK.mkdir(parents=True,exist_ok=True)
ASSETS=ROOT/'cache/promo-assets'
FFMPEG=ROOT/'runtime/python/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
VIDEO=REPORT/'ListeningProMax-宣传片.mp4'
RATE,SECONDS=48000,20
REVISION='20261107-funk-foley-voice'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def run(args,log):
    result=subprocess.run([str(FFMPEG),'-hide_banner','-y',*map(str,args)],capture_output=True,text=True,encoding='utf-8',errors='replace',cwd=ROOT)
    (REPORT/log).write_text(result.stderr,'utf-8')
    if result.returncode:raise RuntimeError(result.stderr[-3000:])
    return result.stderr
def write_wav(path,data):
    assert np.isfinite(data).all() and np.max(np.abs(data))<1
    with wave.open(str(path),'wb') as out:
        out.setnchannels(2);out.setsampwidth(2);out.setframerate(RATE)
        out.writeframes(np.rint(data*32767).astype('<i2').tobytes())
def read_wav(path):
    with wave.open(str(path),'rb') as f:
        assert (f.getnchannels(),f.getsampwidth(),f.getframerate())==(2,2,RATE)
        return np.frombuffer(f.readframes(f.getnframes()),'<i2').reshape(-1,2).astype(np.float64)/32768
def decode(path,filters='anull'):
    raw=subprocess.check_output([str(FFMPEG),'-v','error','-i',str(path),'-af',filters,'-f','f32le','-ac','2','-ar',str(RATE),'-'])
    return np.frombuffer(raw,'<f4').reshape(-1,2).astype(np.float64)
def taper(data,ms=2):
    data=data.copy();n=min(round(ms*RATE/1000),len(data)//2)
    data[:n]*=np.linspace(0,1,n)[:,None];data[-n:]*=np.linspace(1,0,n)[:,None]
    return data
def duck(envelope,first,last,db,attack=.06,release=.16):
    lo=max(0,first-round(attack*RATE));hi=min(len(envelope),last+round(release*RATE));gain=10**(db/20)
    dip=np.r_[np.linspace(1,gain,first-lo,endpoint=False),np.full(last-first,gain),np.linspace(gain,1,hi-last)]
    envelope[lo:hi]=np.minimum(envelope[lo:hi],dip)
parser=argparse.ArgumentParser();parser.add_argument('--audio-only',action='store_true');args=parser.parse_args()
sources=json.loads((REPORT/'media-sources.json').read_text('utf-8'))
source_records={r['file']:r for r in sources}
for name in ['Gimme-that-Groove.mp3','mouse-close.mp3','mouse-clear.mp3','keyboard.mp3','interface.mp3','sweep.mp3']:
    assert sha(ASSETS/name)==source_records[name]['sha256'],name
voice_record=json.loads((REPORT/'voiceover.json').read_text('utf-8'))
assert voice_record['gender']=='Female' and voice_record['mixTempo']==1.08 and voice_record['subtitles'] is False
stage=(ROOT/'assets/promo/stage.html').read_text('utf-8')
assert 'beat=60/130,transition=.18' in stage and 'cuts=[6,14,22,30,38]' in stage
music=source_records['Gimme-that-Groove.mp3']
run(['-ss','0.94','-i',ASSETS/music['file'],'-t',SECONDS,'-af','loudnorm=I=-22:TP=-3:LRA=7,afade=t=in:d=0.035,afade=t=out:st=19.40:d=0.60','-ac','2','-ar',RATE,'-c:a','pcm_s16le',WORK/'music-bed.wav'],'sound-bed.log')
bed=read_wav(WORK/'music-bed.wav');assert len(bed)==RATE*SECONDS
stem=np.zeros_like(bed);voice=np.zeros_like(bed);music_duck=np.ones(len(bed));fx_duck=np.ones(len(bed))
beat=60/130;cuts=[n*beat for n in [6,14,22,30,38]];starts=[0,*[t-.09 for t in cuts]]
events=[];clip_cache={}
def clip(name,crop_start,crop_end,tempo=1):
    key=(name,crop_start,crop_end,tempo)
    if key not in clip_cache:
        filt=f'atrim=start={crop_start}:end={crop_end},asetpts=PTS-STARTPTS,highpass=f=160,lowpass=f=10000,equalizer=f=3500:t=q:w=0.8:g=2,atempo={tempo}'
        raw=decode(ASSETS/name,filt)
        active=np.flatnonzero(np.max(np.abs(raw),axis=1)>.003)
        if len(active):raw=raw[max(0,active[0]-48):min(len(raw),active[-1]+round(.02*RATE))]
        raw=taper(raw,1);clip_cache[key]=raw/max(np.max(np.abs(raw)),1e-6)
    return clip_cache[key]
def add(name,asset,visual,crop_start,crop_end,gain,tempo=1,centered=False):
    data=clip(asset,crop_start,crop_end,tempo)*gain
    frame=math.ceil(visual*30-1e-8);anchor=visual if centered else frame/30
    peak=0
    if centered:
        block=480;energy=np.mean(data[:len(data)//block*block].reshape(-1,block,2)**2,axis=(1,2))
        peak=(int(np.argmax(energy))*block+block/2)/RATE
    first=round((anchor-peak)*RATE);last=first+len(data)
    assert 0<=first<last<=len(stem)
    stem[first:last]+=data;duck(music_duck,first,last,-1.8,.02,.08)
    events.append({'name':name,'kind':'recorded-sweep' if centered else 'recorded-ui','asset':asset,'sourceTitle':source_records[asset]['title'],'sourceCropSeconds':[crop_start,crop_end],'startSeconds':round(first/RATE,6),'durationSeconds':len(data)/RATE,'visualSeconds':visual,'visualFrame':frame,'anchorSeconds':anchor,'alignmentErrorMs':abs(anchor-visual)*1000,'peak':float(np.max(np.abs(data)))})
for i,t in enumerate(cuts):add('轻快转场 '+str(i+1),'sweep.mp3',t,.07,.68,.10,tempo=1.9,centered=True)
add('鼠标点选句子','mouse-close.mp3',starts[1]+1.3,0,.22,.29)
for i,(a,b) in enumerate([(.84,1.00),(1.45,1.63),(2.08,2.26)],1):
    add('数字键切换模式 '+str(i+1),'keyboard.mp3',starts[2]+.09+i*2*beat,a,b,.25)
add('划词按下','mouse-clear.mp3',starts[3]+.5,0,.075,.24)
add('划词释放','mouse-clear.mp3',starts[3]+1.3,.175,.29,.22)
add('词卡提示','interface.mp3',starts[3]+1,0,.36,.13)
add('彩色单词展开','sweep.mp3',starts[4]+.45,.07,.50,.07,tempo=1.9)
voice_intervals=[]
for line in voice_record['lines']:
    path=ROOT/line['file'];assert sha(path)==line['sha256']
    raw=decode(path,'highpass=f=80,lowpass=f=11000')
    active=np.flatnonzero(np.max(np.abs(raw),axis=1)>.002)
    first=max(0,int(active[0])-round(.055*RATE));last=min(len(raw),int(active[-1])+round(.11*RATE))
    raw=taper(raw[first:last],3)
    source=WORK/(line['name']+'-trim.wav');write_wav(source,raw)
    target=WORK/(line['name']+'-voice.wav')
    run(['-i',source,'-af','atempo=1.08,equalizer=f=2800:t=q:w=0.7:g=1.2,loudnorm=I=-18:TP=-3:LRA=6','-ac',2,'-ar',RATE,'-c:a','pcm_s16le',target],line['name']+'-voice.log')
    data=read_wav(target);begin=round(line['startSeconds']*RATE);end=begin+len(data)
    assert end/RATE<=line['endLimitSeconds'],f"Narration too long: {line['name']} ends at {end/RATE:.3f}"
    voice[begin:end]+=data;duck(music_duck,begin,end,-6,.10,.18);duck(fx_duck,begin,end,-1,.03,.08)
    voice_intervals.append({**line,'endSeconds':end/RATE,'durationSeconds':len(data)/RATE,'speed':1.08,'sourceTrimSeconds':[first/RATE,last/RATE],'voicePeak':float(np.max(np.abs(data)))})
events.sort(key=lambda e:e['startSeconds'])
mix=bed*music_duck[:,None]+stem*fx_duck[:,None]+voice
assert np.max(np.abs(mix))<.98,'Adjust premaster peaks'
write_wav(WORK/'effects.wav',stem);write_wav(WORK/'narration.wav',voice);write_wav(WORK/'premaster.wav',mix)
run(['-i',WORK/'premaster.wav','-af','loudnorm=I=-15.5:TP=-1.5:LRA=7','-ac',2,'-ar',RATE,'-c:a','pcm_s16le',WORK/'master.wav'],'sound-master.log')
master=read_wav(WORK/'master.wav');assert len(master)==RATE*SECONDS and np.max(np.abs(master))<.9
for v in voice_intervals:
    a=round(v['startSeconds']*RATE);b=round(v['endSeconds']*RATE);active=np.max(np.abs(voice[a:b]),axis=1)>.018
    vrms=np.sqrt(np.mean(voice[a:b][active]**2));mrms=np.sqrt(np.mean((bed[a:b]*music_duck[a:b,None])[active]**2))
    v['voiceOverMusicDB']=20*math.log10(vrms/max(mrms,1e-9));assert v['voiceOverMusicDB']>7
record={'passed':True,'revision':REVISION,'soundCount':len(events),'soundEffectsSource':'Recorded mouse/keyboard plus short interface/sweep clips from Mixkit, trimmed and lightly EQ processed','musicSource':music['source'],'musicTitle':music['title'],'musicArtist':music['author'],'musicSourceStartSeconds':.94,'musicLicenseUrl':music['licenseUrl'],'effectsLicenseUrl':'https://mixkit.co/license/modal/sfxFree/','durationSeconds':SECONDS,'sampleRate':RATE,'channels':2,'masterPeak':float(np.max(np.abs(master))),'events':events,'voiceover':{'voice':voice_record['voice'],'aiGenerated':True,'speed':1.08,'subtitles':False,'lines':voice_intervals},'stageSHA256':hashlib.sha256(stage.encode()).hexdigest(),'masterSHA256':sha(WORK/'master.wav'),'noRepeatedEffectStacking':True}
metadata='Music: Gimme that Groove! by Michael Ramir C. / Mixkit Stock Music Free License. Mouse, keyboard, interface and sweep SFX: Mixkit Sound Effects Free License. Mandarin AI female narration: zh-CN-XiaoxiaoNeural, 1.08x, no narration subtitles. Authored demo content.'
record['metadataComment']=metadata
def video_digest(path):
    h=hashlib.sha256();count=0
    with av.open(str(path)) as c:
        v=c.streams.video[0];h.update(v.codec_context.extradata)
        for p in c.demux(v):
            if p.size:h.update(bytes(p));count+=1
    return h.hexdigest(),count
if not args.audio_only:
    previous=video_digest(VIDEO);staged=WORK/'with-effects.mp4'
    run(['-i',VIDEO,'-i',WORK/'master.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-ar',RATE,'-t',SECONDS,'-movflags','+faststart','-metadata','comment='+metadata,staged],'sound-remux.log')
    assert video_digest(staged)==previous and previous[1]==600
    record.update(videoPacketsUnchanged=True,videoPacketCount=600,videoSHA256=sha(staged));staged.replace(VIDEO)
(REPORT/'sound-design.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'revision':REVISION,'soundCount':len(events),'voice':[{'text':v['text'],'start':v['startSeconds'],'end':v['endSeconds'],'voiceOverMusicDB':v['voiceOverMusicDB']} for v in voice_intervals],'masterPeak':record['masterPeak']},ensure_ascii=False))

