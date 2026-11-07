"""Read-only regression of the user's course against the pre-update snapshot."""
from pathlib import Path
import json,sqlite3
root=Path(__file__).resolve().parents[1]
old=json.loads((root/'reports/v12/input.json').read_text('utf-8'))
c=sqlite3.connect((root/'release/ListeningProMax/data/library.sqlite').as_uri()+'?mode=ro',uri=True)
new=json.loads(c.execute('select body from lessons where id=?',(old['id'],)).fetchone()[0]);c.close()
wordlist=lambda l:[(w['text'],w['startMs'],w['endMs']) for s in l['sentences'] for w in s['words']]
assert wordlist(old)==wordlist(new),'Existing word records changed'
assert old['originalText']==new['originalText']
assert old['positionMs']==new['positionMs'],(old['positionMs'],new['positionMs'])
assert old['rate']==new['rate'] and old['loop']==new['loop']
boundaries=[t for s in new['sentences'] for t in (s['startMs'],s['endMs']) if t is not None]
words=wordlist(old);known=set(t for _,a,b in words for t in (a,b))
oldbounds=set(t for s in old['sentences'] for t in (s['startMs'],s['endMs']) if t is not None)
assert all(t in known|oldbounds for t in boundaries)
report={'passed':True,'version':new['version'],'wordCount':len(words),'allWordTextAndTimesIdentical':True,'newSentenceBoundariesUseExistingAbsoluteTimes':True,'originalTextPreserved':True,'positionMs':new['positionMs'],'rate':new['rate'],'loop':new['loop'],'zeroDurationWordsRetained':sum(a==b for _,a,b in words),'note':'Word-time identity prevents added cumulative drift; it does not measure acoustic boundary accuracy.'}
(root/'reports/v12/invariants.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8');print(json.dumps(report))
