from pathlib import Path
import sys,tempfile,unittest,json
from unittest.mock import patch
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'worker'))
import worker
from text_processing import organize_text,characters
from free_translation import translate_free

class Regression(unittest.TestCase):
 def test_punctuated_text_idempotent(self):
  text='今日はいい天気です。\n明日も晴れです。'
  result=organize_text(text);self.assertEqual(characters(text),characters(result));self.assertEqual(result,organize_text(result))
 def test_wrapped_fragments_join_without_loss(self):
  text='これから音を\n聞いてください。\n音がよく聞こえないときは、手を挙げて\nください。'
  self.assertEqual(organize_text(text),'これから音を聞いてください。\n\n音がよく聞こえないときは、手を挙げてください。')
 def test_no_semantic_rewrite(self):
  text='温度+1、価格1,000円、名前は田中\nです'
  self.assertEqual(characters(text),characters(organize_text(text)))
 def test_asr_windows_never_merge_into_long_alignment(self):
  items=[worker.make_sentence('最初の話',1000,29000),worker.make_sentence('次の話',50000,78000)]
  result=worker.regroup_recognized(root,items,root/'cache')
  self.assertEqual(len(result),2);self.assertEqual(result[1]['startMs'],50000)
 def test_punctuation_only_change_reuses_alignment(self):
  with tempfile.TemporaryDirectory(dir=root/'cache') as tmp:
   folder=Path(tmp)
   class Fake:
    cache=folder;calls=0
    def call(self,*args,**kwargs):self.calls+=1;return {'segments':[{'words':[{'word':'今日','start':.8,'end':1.8}]}]}
   engine=Fake();items=[worker.make_sentence('今日',1000,2000)]
   worker.align_all(engine,'audio',items,3,'turbo',folder)
   items[0]['text']='今日。';worker.align_all(engine,'audio',items,3,'turbo',folder)
   self.assertEqual(engine.calls,1)
 def test_bad_cache_does_not_crash(self):
  with tempfile.TemporaryDirectory(dir=root/'cache') as tmp:
   file=Path(tmp)/'bad.json';file.write_text('{');self.assertIsNone(worker.read_json(file))
 def test_cross_job_and_source_cache(self):
  with tempfile.TemporaryDirectory(dir=root/'cache') as tmp:
   base=Path(tmp);(base/'audio').write_bytes(b'audio');lesson={'id':'L','sourceMedia':'audio'}
   a=worker.analysis_cache(base,lesson,'turbo',base/'job1');b=worker.analysis_cache(base,lesson,'turbo',base/'job2');self.assertEqual(a,b)
   self.assertNotEqual(a,worker.analysis_cache(base,lesson,'small',base/'job3'))
   (base/'audio').write_bytes(b'replaced');self.assertNotEqual(a,worker.analysis_cache(base,lesson,'turbo',base/'job4'))
 def test_repeated_asr_never_calls_inference(self):
  with tempfile.TemporaryDirectory(dir=root/'cache') as tmp:
   folder=Path(tmp)
   class Fake:
    cache=folder;calls=0
    def call(self,*args,**kwargs):
     self.calls+=1;return {'segments':[{'words':[{'word':'今日は晴れ。','start':1,'end':2}]}]}
    def stop(self):pass
   engine=Fake()
   with patch.object(worker,'windows',return_value=[(0,3,0,3)]) as vad:
    first,_=worker.transcribe(engine,'audio',3,'turbo',folder)
    second,_=worker.transcribe(engine,'audio',3,'turbo',folder)
    self.assertEqual(engine.calls,1);self.assertEqual(vad.call_count,1);self.assertEqual(first[0]['text'],second[0]['text'])
 def test_free_provider_response(self):
  with patch('free_translation.get_json',return_value=[[['今天。','今日。'],['明天。','明日。']]]):self.assertEqual(translate_free('今日。明日。'),'今天。明天。')
 def test_free_quota_error(self):
  with patch('free_translation.get_json',return_value={'responseStatus':403,'quotaFinished':True}):
   with self.assertRaises(RuntimeError):translate_free('今日。','mymemory')
 def test_successful_translation_survives_other_failure(self):
  with tempfile.TemporaryDirectory(dir=root/'cache') as tmp:
   events=[]
   def network(text,*args):
    if text=='失敗':raise TimeoutError('network')
    return '今天'
   with patch('free_translation.translate_free',side_effect=network),patch.object(worker,'emit',side_effect=lambda kind,**kwargs:events.append((kind,kwargs))):
    with self.assertRaises(RuntimeError):worker.translate(None,{'sentences':[{'id':'a','text':'今日'},{'id':'b','text':'失敗'}]},{'online':True,'onlineFallback':False},Path(tmp),Path(tmp))
   self.assertEqual(sum(k=='translation' for k,v in events),1)
 def test_translation_cache_and_duplicates(self):
  with tempfile.TemporaryDirectory(dir=root/'cache') as tmp:
   lesson={'sentences':[{'id':'a','text':'今日'},{'id':'b','text':'今日'}]}
   with patch('free_translation.translate_free',return_value='今天') as network,patch.object(worker,'emit'):
    worker.translate(None,lesson,{'online':True},Path(tmp),Path(tmp));worker.translate(None,lesson,{'online':True},Path(tmp),Path(tmp));self.assertEqual(network.call_count,1)
if __name__=='__main__':unittest.main(verbosity=2)
