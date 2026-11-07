"""Small cancellable helper; loads no inference models."""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from free_translation import translate_free
try:
    text=sys.stdin.read(300)
    print(json.dumps({'text':translate_free(text),'source':'必应 · 中文翻译参考'},ensure_ascii=False),flush=True)
except Exception as error:
    print(json.dumps({'error':str(error)},ensure_ascii=False),flush=True)
    sys.exit(1)
