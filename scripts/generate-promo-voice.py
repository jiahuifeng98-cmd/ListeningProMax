"""Generate authored Mandarin narration; runtime/dependencies stay in project cache."""
from pathlib import Path
import sys, asyncio, json, hashlib
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'cache/promo-tts/lib'))
import edge_tts
OUT=ROOT/'assets/promo/voice'; OUT.mkdir(parents=True,exist_ok=True)
REPORT=ROOT/'reports/share-20261106'
LINES=[
 ('intro',.35,2.65,'日语听力，一句句听懂。'),
 ('listening',3.02,6.30,'点击句子，反复听清每个细节。'),
 ('modes',6.72,9.99,'四种模式，随手切换听力节奏。'),
 ('dictionary',10.43,13.68,'遇到生词，划选就查。'),
 ('colors',14.10,17.36,'彩色分级，重点单词一眼掌握。'),
 ('outro',17.75,19.78,'从听见，到听懂。'),
]
async def main():
    voices=await asyncio.wait_for(edge_tts.list_voices(),45)
    selected=next(v for v in voices if v['ShortName']=='zh-CN-XiaoxiaoNeural')
    assert selected['Gender']=='Female'
    records=[]
    for name,start,end,text in LINES:
        path=OUT/(name+'.mp3')
        signature=hashlib.sha256((text+'|zh-CN-XiaoxiaoNeural|+0%').encode()).hexdigest()
        manifest=path.with_suffix('.json')
        if not(path.exists() and manifest.exists() and json.loads(manifest.read_text('utf-8')).get('signature')==signature):
            for attempt in range(2):
                try:
                    await asyncio.wait_for(edge_tts.Communicate(text,'zh-CN-XiaoxiaoNeural',rate='+0%',pitch='+0Hz').save(str(path.with_suffix('.next.mp3'))),60)
                    path.with_suffix('.next.mp3').replace(path)
                    break
                except Exception:
                    if attempt:raise
                    await asyncio.sleep(2)
            manifest.write_text(json.dumps({'text':text,'signature':signature},ensure_ascii=False),'utf-8')
        record={'name':name,'text':text,'startSeconds':start,'endLimitSeconds':end,'file':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
        records.append(record);print(json.dumps(record,ensure_ascii=False),flush=True)
    (REPORT/'voiceover.json').write_text(json.dumps({'voice':'zh-CN-XiaoxiaoNeural','gender':'Female','language':'zh-CN','aiGenerated':True,'service':'Microsoft Edge online text to speech','tool':'edge-tts 7.3.1','sourceRate':'+0%','mixTempo':1.08,'subtitles':False,'lines':records},ensure_ascii=False,indent=2),'utf-8')
asyncio.run(main())
