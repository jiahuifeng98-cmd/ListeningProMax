"""Evaluate manually reviewed sentence boundaries. Never synthesize ground truth."""
from pathlib import Path
import sys,json,math
if len(sys.argv)!=4:raise SystemExit('Usage: evaluate-boundaries.py manual.json predicted.json report.json')
truth=json.loads(Path(sys.argv[1]).read_text('utf-8-sig'));predicted=json.loads(Path(sys.argv[2]).read_text('utf-8-sig'))
if not truth.get('reviewer') or truth.get('annotationType')!='human-reviewed':raise ValueError('Requires an identified human reviewer and human-reviewed annotations')
lookup={s['id']:s for s in predicted['sentences']};errors=[];missing=[]
for actual in truth['sentences']:
 guess=lookup.get(actual['id'])
 if not guess or guess.get('startMs') is None or guess.get('endMs') is None:missing.append(actual['id']);continue
 duration=truth['durationMs'];region='first' if actual['startMs']<duration/3 else 'middle' if actual['startMs']<duration*2/3 else 'last'
 errors.append({'id':actual['id'],'startErrorMs':abs(guess['startMs']-actual['startMs']),'endErrorMs':abs(guess['endMs']-actual['endMs']),'region':region})
def stats(rows):
 values=sorted(e[k] for e in rows for k in ['startErrorMs','endErrorMs'])
 return {'sentences':len(rows),'p95Ms':values[max(0,math.ceil(len(values)*.95)-1)] if values else None,'maxMs':max(values) if values else None}
report={'reviewer':truth['reviewer'],'overall':stats(errors),'regions':{r:stats([e for e in errors if e['region']==r]) for r in ['first','middle','last']},'missing':missing,'errors':errors}
Path(sys.argv[3]).write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print(json.dumps(report['overall']))
