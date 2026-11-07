"""Audit the staged public source without printing any suspected secret value."""
from pathlib import Path
import subprocess,json,re,hashlib
ROOT=Path(__file__).resolve().parents[1];REPORT=ROOT/'reports/github-upload';REPORT.mkdir(parents=True,exist_ok=True)
data=subprocess.check_output(['git','ls-files','--cached','-z'],cwd=ROOT)
files=[n.decode('utf-8') for n in data.split(b'\0') if n]
denied_prefixes=('cache/','data/','release/','runtime/','models/','node_modules/','out/','reports/','1/','assets/dictionaries/','assets/kuromoji/')
patterns={
 'github-token':re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})'),
 'private-key':re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
 'aws-access-key':re.compile(rb'AKIA[0-9A-Z]{16}'),
 'openai-token':re.compile(rb'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{36,}'),
 'url-credentials':re.compile(rb'https?://[^\s/:"<>]+:[^\s/@"<>]+@'),
}
issues=[];records=[]
for name in files:
    if name.startswith(denied_prefixes) or name.endswith(('.sqlite','.db','.exe','.dll','.zip','.pfx','.pem')) or '.sqlite-' in name:
        issues.append({'path':name,'kind':'excluded-resource'})
    if name=='tests/fixtures/jlpt-n2-dialogue.json':issues.append({'path':name,'kind':'private-fixture'})
    path=ROOT/name;content=path.read_bytes()
    if len(content)>10*1024**2:issues.append({'path':name,'kind':'large-file'})
    for kind,pattern in patterns.items():
        if pattern.search(content):issues.append({'path':name,'kind':kind})
    records.append({'path':name,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()})
report={'passed':not issues,'files':len(files),'totalBytes':sum(r['bytes'] for r in records),'issues':issues,'largestFiles':sorted(records,key=lambda r:r['bytes'],reverse=True)[:10],'inventory':records}
(REPORT/'source-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='inventory'},ensure_ascii=False))
if issues:raise SystemExit(1)
