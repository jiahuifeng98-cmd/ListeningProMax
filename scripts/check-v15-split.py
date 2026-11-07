from pathlib import Path
import sys,json,tempfile,subprocess,os,time
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(dir=root/'cache') as tmp:
    job=Path(tmp)
    def sentence(id,text):return dict(id=id,text=text,startMs=None,endMs=None,words=[],issues=[],anchor=False)
    lesson=dict(id='playback-smoke-v15-split',title='playback-smoke-v15-split',sourceMedia='reports/fixtures/julius-sample.wav',durationMs=2062,version=1,sentences=[sentence('left','今日は'),sentence('right','いい天気だ。')])
    request=dict(root=str(root),jobDir=str(job),lesson=lesson,settings={'model':'turbo'},kind='realign',fromId='left',pendingSplit=dict(id='left',kind='split',offset=3,originalText='今日はいい天気だ。',originalStartMs=0,originalEndMs=2062,originalAnchor=True))
    file=job/'request.json';file.write_text(json.dumps(request,ensure_ascii=False),'utf-8')
    start=time.monotonic();run=subprocess.run([str(root/'runtime/python/python.exe'),str(root/'worker/worker.py'),str(file)],cwd=root,env=os.environ,capture_output=True,text=True,encoding='utf-8',timeout=180)
    events=[json.loads(line) for line in run.stdout.splitlines() if line.startswith('{')]
    result=next((e['sentences'] for e in events if e.get('type')=='result'),None)
    report={'passed':False,'seconds':round(time.monotonic()-start,3),'events':events,'error':run.stderr[-3000:]}
    if result:
        assert ''.join(s['text'] for s in result)=='今日はいい天気だ。'
        assert result[0]['startMs']==0 and result[-1]['endMs']==2062
        assert result[0]['endMs']<=result[1]['startMs']
        assert all(s['words'] and s['endMs']>s['startMs'] for s in result)
        report['passed']=True
    (root/'reports/v15/split-audio.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps(report,ensure_ascii=False),flush=True)
    assert report['passed'],'Real-audio split did not succeed'
