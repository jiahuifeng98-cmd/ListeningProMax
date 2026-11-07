"""Guard cleanup: only the root development fixture database, never release data."""
import sqlite3,json
from pathlib import Path
root=Path(__file__).resolve().parents[1];file=root/'data/library.sqlite'
if file.exists():
 db=sqlite3.connect(file.as_uri()+'?mode=ro',uri=True)
 lessons=[json.loads(row[0]) for row in db.execute('select body from lessons')]
 assert all(l['title']=='smoke' or l['title'].startswith('playback-smoke-') for l in lessons),'Non-test lesson found; refuse dev cleanup'
 ids={l['id'] for l in lessons}
 assert all(all(o['lessonId'] in ids for o in json.loads(row[0])['origins']) for row in db.execute('select body from favorites')),'Non-test bookmark found'
 db.close()
print('Development data verified as generated fixtures only')
