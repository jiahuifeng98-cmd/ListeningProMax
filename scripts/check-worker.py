from pathlib import Path
import sys,unittest,tempfile,json
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'worker'))
from worker import content,locate_original,make_sentence,anchor_range,extract,Inference,align_all
import hashlib
class Regression(unittest.TestCase):
 def test_rejected_legacy_alignment_cache_is_removed(self):
  with tempfile.TemporaryDirectory(dir=root/'cache') as temp:
   folder=Path(temp);key=hashlib.sha256(json.dumps(['turbo',0,1.8,'今日。'],ensure_ascii=False).encode()).hexdigest()[:20]
   cache=folder/f'align-{key}.json';cache.write_text(json.dumps([{'text':'今日。','startMs':500,'endMs':500}]),'utf-8')
   class Engine:
    def call(self,*args,**kwargs):raise AssertionError('First run should inspect old cache')
   engine=Engine();engine.cache=folder
   result=align_all(engine,folder/'audio.wav',[make_sentence('今日。',0,1000)],2,'turbo',folder)
   self.assertTrue(any('待校准' in issue for issue in result[0]['issues']));self.assertFalse(cache.exists())
 def test_rejected_alignment_cache_does_not_poison_retry(self):
  with tempfile.TemporaryDirectory(dir=root/'cache') as temp:
   folder=Path(temp);key=hashlib.sha256(json.dumps(['turbo',0,1.8,'今日'],ensure_ascii=False).encode()).hexdigest()[:20]
   cache=folder/f'align-{key}.json';cache.write_text(json.dumps([{'text':'今日','startMs':500,'endMs':500}]),'utf-8')
   class Engine:
    calls=0
    def call(self,*args,**kwargs):
     self.calls+=1;return {'segments':[{'words':[{'word':'今日','start':0.1,'end':0.9}]}]}
   engine=Engine();engine.cache=folder;sentence=make_sentence('今日',0,1000)
   result=align_all(engine,folder/'audio.wav',[sentence],2,'turbo',folder)
   self.assertTrue(any('待校准' in issue for issue in result[0]['issues']));self.assertFalse(cache.exists());self.assertEqual(engine.calls,0)
   result=align_all(engine,folder/'audio.wav',[sentence],2,'turbo',folder)
   self.assertEqual(engine.calls,1);self.assertEqual(result[0]['startMs'],100);self.assertEqual(result[0]['endMs'],900)
 def test_content_preserves_symbols(self):self.assertEqual(content('日本語、です。\n'),content('日本語です'));self.assertNotEqual(content('温度+1'),content('温度1'))
 def test_mismatched_script(self):
  result=locate_original([make_sentence('大阪に行きます。')],[make_sentence('今日は晴れです。',1000,2000,[{'text':'今日は晴れです。','startMs':1000,'endMs':2000}])],3)
  self.assertIsNone(result[0]['startMs']);self.assertTrue(result[0]['issues']);self.assertEqual(result[0]['text'],'大阪に行きます。')
 def test_anchors_bound_span(self):
  items=[{**make_sentence('A',1000,2000),'anchor':True},make_sentence('B',3000,4000),{**make_sentence('C',5000,6000),'anchor':True}]
  self.assertEqual(anchor_range(items,items[0]['id'],10),(1,2,2,5))
 def test_corrupt_audio_exits(self):
  with tempfile.TemporaryDirectory(dir=root/'cache') as temp:
   base=Path(temp);(base/'broken.wav').write_bytes(b'not-audio')
   with self.assertRaisesRegex(RuntimeError,'无法读取音轨'):extract(base,{'id':'bad','sourceMedia':'broken.wav'})
 def test_crashed_inference_restarts(self):
  with tempfile.TemporaryDirectory(dir=root/'cache') as temp:
   engine=Inference(root,Path(temp))
   try:
    with self.assertRaisesRegex(RuntimeError,'未知推理类型'):engine.call({'kind':'invalid'})
    first=engine.proc.pid;engine.proc.kill();engine.proc.wait()
    with self.assertRaisesRegex(RuntimeError,'未知推理类型'):engine.call({'kind':'invalid'})
    self.assertNotEqual(first,engine.proc.pid)
   finally:engine.stop()
 def test_missing_model_exits(self):
  with tempfile.TemporaryDirectory(dir=root/'cache') as temp:
   engine=Inference(Path(temp),Path(temp))
   try:
    with self.assertRaises(RuntimeError):engine.call({'kind':'asr','model':'missing','audio':str(root/'reports/fixtures/julius-sample.wav'),'start':0,'end':2},timeout=60)
   finally:engine.stop()
if __name__=='__main__':unittest.main(verbosity=2)
