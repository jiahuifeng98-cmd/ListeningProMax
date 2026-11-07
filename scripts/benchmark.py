"""Public human transcripts; NOT a manually timed boundary evaluation."""
import sys,json,time,unicodedata,threading,wave,io,subprocess,itertools
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'cache/benchmark-deps'),str(ROOT/'worker')]
import pyarrow.parquet as pq
import psutil
from rapidfuzz.distance import Levenshtein
from worker import Inference
job=ROOT/'reports/benchmark';job.mkdir(parents=True,exist_ok=True)
engine=Inference(ROOT,job);running=True;peak=0
def memory():
 global peak
 while running:
  try:peak=max(peak,sum(p.memory_info().rss for p in [psutil.Process()]+psutil.Process().children(recursive=True)))
  except psutil.Error:pass
  time.sleep(.25)
threading.Thread(target=memory,daemon=True).start()
def norm(s):return ''.join(c for c in unicodedata.normalize('NFKC',s) if not c.isspace() and not unicodedata.category(c).startswith('P'))
limit=int(sys.argv[1]) if len(sys.argv)>1 else 300
rows=itertools.islice((row for batch in pq.ParquetFile(ROOT/'reports/fixtures/fleurs-ja-test.parquet').iter_batches(batch_size=1) for row in batch.to_pylist()),limit)
results=[];started=time.monotonic()
try:
 for i,row in enumerate(rows):
  saved=job/f'{i:04}.json'
  if saved.exists():results.append(json.loads(saved.read_text('utf-8')));continue
  import imageio_ffmpeg
  source=job/'source.wav';source.write_bytes(row['audio']['bytes']);audio=job/'current.wav'
  subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-y','-i',str(source),'-ar','16000','-ac','1','-c:a','pcm_s16le',str(audio)],check=True,creationflags=0x08000000)
  with wave.open(str(audio)) as w:duration=w.getnframes()/w.getframerate();assert w.getframerate()==16000 and w.getnchannels()==1
  tick=time.monotonic()
  value=engine.call({'kind':'asr','audio':str(audio),'start':0,'end':duration,'model':'turbo'},timeout=300)
  hypothesis=''.join(s['text'] for s in value['segments']);reference=row.get('raw_transcription') or row['transcription']
  result={'index':i,'id':row.get('id'),'reference':reference,'hypothesis':hypothesis,'durationSeconds':duration,'elapsedSeconds':time.monotonic()-tick,'edits':Levenshtein.distance(norm(reference),norm(hypothesis)),'characters':len(norm(reference))}
  saved.write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8');results.append(result)
  print(f'{i+1}/{limit} CER={sum(r["edits"] for r in results)/sum(r["characters"] for r in results):.4f}',flush=True)
finally:
 running=False;engine.stop()
 summary={'dataset':'google/fleurs ja_jp test, first rows','samples':len(results),'cer':sum(r['edits'] for r in results)/max(1,sum(r['characters'] for r in results)),'audioSeconds':sum(r['durationSeconds'] for r in results),'inferenceSeconds':sum(r['elapsedSeconds'] for r in results),'processTreePeakBytes':peak,'normalization':'NFKC, whitespace and punctuation removed; no reading normalization','boundaryAccuracy':'Not measured: corpus has no human sentence boundary labels','model':'turbo CPU INT8, 4 threads'}
 (job/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),'utf-8');print(json.dumps(summary),flush=True)
