"""Build small offline level index; keep only headword/reading/membership, not definitions."""
import csv, hashlib, html, io, json, re, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'cache/vocabulary-sources'
CACHE.mkdir(parents=True, exist_ok=True)
PIN = '1ad66734417aca9dbcca6b2d5ee440cb13ab3ba0'
BASE = 'https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/' + PIN

def fetch(url):
    file = CACHE / (hashlib.sha256(url.encode()).hexdigest() + '.txt')
    if not file.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'})
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read()
        file.write_bytes(data)
    return file.read_bytes().decode('utf-8-sig')

def plain(s):
    return html.unescape(re.sub('<[^>]+>', '', s)).strip()

sources, entries = [], {}
def add(word, reading, level):
    word, reading = word.strip(), reading.strip()
    if not word or not re.search(r'[ぁ-ヿ一-龯]', word):
        return
    # List annotations are not part of an actual surface form.
    word = re.sub(r'[（(][^）)]*[）)]', '', word).strip()
    reading = re.sub(r'[（(][^）)]*[）)]', '', reading).strip()
    reading = re.sub(r'[\s◎○〇①-⑳0-9]+', '', reading)
    for variant in re.split(r'[/／、,，;；]', word):
        variant = variant.strip()
        if variant:
            entries.setdefault((variant, reading), set()).add(level)

def jlpt(level):
    url = f'{BASE}/src/{level.lower()}.csv'
    text = fetch(url)
    return level, url, text, list(csv.DictReader(io.StringIO(text)))

for level, url, text, rows in ThreadPoolExecutor(max_workers=3).map(jlpt, ['N1','N2','N3','N4','N5']):
    for row in rows:
        add(row['expression'], row['reading'], level)
    sources.append({'level':level,'url':url,'sha256':hashlib.sha256(text.encode()).hexdigest(),'rows':len(rows)})
    print(level,len(rows),flush=True)

# The attributed, minimal snapshot avoids scraping live pages on every build.
# It contains only words/readings; not the source's translations or examples.
exam_source = ROOT / 'assets/vocabulary/exam-203-sources.json'
exam_data = json.loads(exam_source.read_text(encoding='utf-8'))
assert len(exam_data['pages']) == 15
assert sum(len(p['rows']) for p in exam_data['pages']) == 2235
for page in exam_data['pages']:
    url,chapter,rows = page['url'],page['chapter'],page['rows']
    for word,reading in rows:
        add(word,reading,'KY')
    sources.append({'level':'KY','chapter':chapter,'url':url,'snapshotSha256':hashlib.sha256(exam_source.read_bytes()).hexdigest(),'rows':len(rows)})
    print('KY',chapter,len(rows),flush=True)

result={'version':1,'sources':sources,'entries':[[word,reading,sorted(levels)] for (word,reading),levels in sorted(entries.items())]}
target=ROOT/'src/main/vocabulary-data.json'
target.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
license_path = ROOT/'licenses/open-anki-jlpt-decks.txt'
if not license_path.exists():
    license_path.write_text(fetch(BASE+'/LICENSE'),encoding='utf-8')
print('BUILT',len(entries),'entries',target.stat().st_size,'bytes',flush=True)
