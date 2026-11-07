from pathlib import Path
import urllib.request,hashlib,json
root=Path(__file__).resolve().parents[1];dest=root/'reports/fixtures/fleurs-ja-test.parquet';dest.parent.mkdir(parents=True,exist_ok=True)
url='https://huggingface.co/datasets/google/fleurs/resolve/refs%2Fconvert%2Fparquet/ja_jp/test/0000.parquet'
if not dest.exists():
 print('Downloading FLEURS Japanese test corpus (541 MB)',flush=True)
 with urllib.request.urlopen(url,timeout=120) as src,open(str(dest)+'.part','wb') as f:
  while block:=src.read(4*1024*1024):f.write(block)
 Path(str(dest)+'.part').replace(dest)
h=hashlib.file_digest(open(dest,'rb'),'sha256').hexdigest()
if h!='e954b67e934b9a31d7a74a070a75225379660d50c8d1aacdb755852c57f23e6b':raise RuntimeError('Corpus checksum mismatch')
(dest.parent/'fleurs-source.json').write_text(json.dumps({'source':'https://huggingface.co/datasets/google/fleurs','url':url,'license':'CC BY 4.0','sha256':h,'purpose':'ASR benchmark; NOT human sentence boundary annotations'},indent=2),'utf-8')
print('CORPUS READY',flush=True)
