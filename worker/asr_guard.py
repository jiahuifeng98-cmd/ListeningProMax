"""Conservative post-ASR verification, never applied to supplied/edited text.

A stock outro compressed into a few milliseconds at a window tail is suspect,
not automatically false. Re-decode a short context before excluding its exact
word records. Keep raw output and the verification evidence for diagnostics.
"""
import re

GUARD_VERSION = 'outro-context-v1'

def letters(text):
    return re.sub(r'[\s。！？!?、,.「」『』]', '', text)

def suspects(result, window_duration):
    found=[]
    for segment in result.get('segments', []):
        words=segment.get('words', [])
        text=letters(''.join(w.get('word', w.get('text', '')) for w in words))
        if text not in ('ご視聴ありがとうございました','ご視聴ありがとうございます'):
            continue
        start=words[0]['start'];end=words[-1]['end']
        gratitude=[w for w in words if 'ありがとう' in w.get('word',w.get('text',''))]
        compressed=end-start<1 and any(w['end']-w['start']<=.20 for w in gratitude)
        if compressed and window_duration-end<=1 and start>=0:
            found.append({'start':start,'end':end,'words':words,'text':text})
    return found

def verify_outros(result, start, end, duration, recognize):
    """Return preserved word records and an audit. Failed verification keeps text."""
    excluded=set();audit=[]
    for candidate in suspects(result,end-start):
        # Include both preceding and following speech, unlike the failing tail.
        lower=max(0,start+candidate['start']-2)
        upper=min(duration,start+candidate['end']+2)
        record={**{k:v for k,v in candidate.items() if k!='words'},
                'absoluteStart':start+candidate['start'],'context':[lower,upper],
                'decision':'kept'}
        try:
            verification=recognize(lower,upper)
            record['verification']=verification
            text=letters(''.join(s.get('text','') or ''.join(w.get('word',w.get('text','')) for w in s.get('words',[])) for s in verification.get('segments',[])))
            # An empty/failed retry is not evidence for removing speech.
            if text and 'ご視聴' not in text:
                for w in candidate['words']:excluded.add(id(w))
                record['decision']='excluded-after-context-check'
        except Exception as e:
            record['error']=str(e)
        audit.append(record)
    words=[]
    for segment in result.get('segments',[]):
        for w in segment.get('words',[]):
            if id(w) not in excluded:
                words.append({'text':w.get('word',w.get('text','')),
                              'startMs':round((w['start']+start)*1000),
                              'endMs':round((w['end']+start)*1000)})
    return [w for w in words if w['text']],audit
