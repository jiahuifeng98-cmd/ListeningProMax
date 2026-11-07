"""Check the delivered AAC mix, recorded effects, narration timing and no captions."""
from pathlib import Path
import hashlib,json,subprocess,wave
import av,numpy as np
ROOT=Path(__file__).resolve().parents[1];REPORT=ROOT/'reports/share-20261106';WORK=ROOT/'cache/promo-sfx'
FF=ROOT/'runtime/python/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
video=REPORT/'ListeningProMax-宣传片.mp4'
design=json.loads((REPORT/'sound-design.json').read_text('utf-8'))
assert design['videoSHA256']==hashlib.sha256(video.read_bytes()).hexdigest()
with av.open(str(video)) as container:
    assert len(container.streams)==2 and len(container.streams.subtitles)==0
with wave.open(str(WORK/'master.wav'),'rb') as f:
    master=np.frombuffer(f.readframes(f.getnframes()),'<i2').reshape(-1,2).astype(np.float64)/32768
raw=subprocess.check_output([str(FF),'-v','error','-i',str(video),'-f','f32le','-ac','2','-ar','48000','-'])
decoded=np.frombuffer(raw,'<f4').reshape(-1,2).astype(np.float64)[:len(master)]
assert decoded.shape==master.shape
def corr(a,b):return float(np.corrcoef(a.flatten(),b.flatten())[0,1])
correlation=corr(master,decoded);assert correlation>.985
events=[]
for cue in design['events']:
    assert cue['alignmentErrorMs']<=1000/30+.01
    a=round(cue['startSeconds']*48000);b=min(len(master),a+round(cue['durationSeconds']*48000))
    c=corr(master[a:b],decoded[a:b]);assert c>.97
    events.append({'name':cue['name'],'source':cue['sourceTitle'],'alignmentMs':cue['alignmentErrorMs'],'encodedCorrelation':c})
lines=[];previous=0
for line in design['voiceover']['lines']:
    assert line['startSeconds']>previous and line['endSeconds']<=line['endLimitSeconds']
    assert line['speed']==1.08 and line['voiceOverMusicDB']>8
    a=round(line['startSeconds']*48000);b=round(line['endSeconds']*48000)
    c=corr(master[a:b],decoded[a:b]);assert c>.985
    lines.append({'text':line['text'],'startSeconds':line['startSeconds'],'endSeconds':line['endSeconds'],'speed':1.08,'encodedCorrelation':c,'voiceOverMusicDB':line['voiceOverMusicDB']})
    previous=line['endSeconds']
assert len(lines)==6 and len(events)==13 and design['voiceover']['subtitles'] is False
stage=(ROOT/'assets/promo/stage.html').read_text('utf-8')
assert not any(line['text'] in stage for line in design['voiceover']['lines']), 'Narration captions unexpectedly present'
report={'passed':True,'revision':design['revision'],'masterToAACCorrelation':correlation,'noSubtitleStream':True,'noNarrationOverlay':True,'fixedVoiceSpeed':1.08,'voice':design['voiceover']['voice'],'events':events,'narration':lines,'videoSHA256':design['videoSHA256']}
(REPORT/'sound-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'passed':True,'masterToAACCorrelation':correlation,'voiceLines':len(lines),'events':len(events),'noSubtitles':True},ensure_ascii=False))
