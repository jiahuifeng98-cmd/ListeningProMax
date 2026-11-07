from pathlib import Path
import sys,json,io,unittest,tempfile,urllib.error
from unittest.mock import patch,Mock
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'worker'))
import free_translation as ft
import worker

class Response(io.BytesIO):
    url='https://www.bing.com/translator?mkt=zh-CN'
PAGE=b'IG:"example";var params_AbusePreventionHelper = [123,"session",3600000];<div data-iid="translator.1">'
def translated(text='车站在哪里？'):
    return Response(json.dumps([{'translations':[{'text':text,'to':'zh-Hans'}]}]).encode())

class TranslationTests(unittest.TestCase):
    def setUp(self):ft._session=None;ft._failure=None
    def test_session_redirect_and_reuse(self):
        opener=Mock();opener.open.side_effect=[Response(PAGE),translated(),translated()]
        with patch.object(ft.urllib.request,'build_opener',return_value=opener):
            self.assertEqual(ft.translate_free('駅はどこですか。'),'车站在哪里？');ft.translate_free('駅はどこですか。')
        self.assertEqual(opener.open.call_count,3)
        request=opener.open.call_args_list[1].args[0];self.assertTrue(request.full_url.startswith('https://www.bing.com/ttranslatev3?'))
        self.assertIn('to=zh-Hans',request.data.decode());self.assertNotIn('google',request.full_url)
    def test_blocks_preserve_unicode_and_limit(self):
        text=('これは長い文章です。😀'*250);parts=list(ft.blocks(text));self.assertEqual(''.join(parts),text)
        self.assertTrue(all(len(p.encode('utf-16-le'))//2<=900 for p in parts))
    def test_invalid_page_has_bounded_failure(self):
        opener=Mock();opener.open.return_value=Response(b'captcha')
        with patch.object(ft.urllib.request,'build_opener',return_value=opener):
            for _ in range(3):
                with self.assertRaisesRegex(RuntimeError,'人工验证'):ft.translate_free('こんにちは。')
        self.assertEqual(opener.open.call_count,1)
    def test_rate_limit_is_error_not_translation(self):
        opener=Mock();opener.open.side_effect=[Response(PAGE),urllib.error.HTTPError('url',429,'limited',{},None)]
        with patch.object(ft.urllib.request,'build_opener',return_value=opener):
            with self.assertRaisesRegex(RuntimeError,'频繁'):ft.translate_free('こんにちは。')
    def test_invalid_json_is_not_saved_as_translation(self):
        opener=Mock();opener.open.side_effect=[Response(PAGE),Response(b'<html>unavailable</html>')]
        with patch.object(ft.urllib.request,'build_opener',return_value=opener):
            with self.assertRaisesRegex(RuntimeError,'有效译文'):ft.translate_free('こんにちは。')
    def test_unexpected_language_is_rejected(self):
        opener=Mock();opener.open.side_effect=[Response(PAGE),Response(b'[{"translations":[{"text":"hello","to":"en"}]}]')]
        with patch.object(ft.urllib.request,'build_opener',return_value=opener):
            with self.assertRaisesRegex(RuntimeError,'简体中文'):ft.translate_free('こんにちは。')
    def test_legacy_provider_cannot_contact_google(self):
        with self.assertRaises(ValueError):ft.translate_free('こんにちは。','google')
    def test_partial_success_cached_and_retry_only_missing(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'cache') as tmp:
            root=Path(tmp);events=[];lesson={'sentences':[{'id':'a','text':'成功'},{'id':'b','text':'失败'},{'id':'c','text':'已有','translation':'保留'}]}
            def first(text,provider):
                self.assertEqual(provider,'bing')
                if text=='失败':raise RuntimeError('timeout')
                return '译文'
            with patch.object(ft,'translate_free',side_effect=first),patch.object(worker,'emit',side_effect=lambda kind,**kw:events.append({'type':kind,**kw})):
                with self.assertRaisesRegex(RuntimeError,'1 条'):worker.translate(None,lesson,{'online':True,'freeProvider':'google','onlineFallback':False},root,root)
            self.assertEqual(len([e for e in events if e['type']=='translation']),1)
            with patch.object(ft,'translate_free',return_value='补齐') as network,patch.object(worker,'emit'):
                worker.translate(None,lesson,{'online':True,'onlineFallback':False},root,root)
                network.assert_called_once_with('失败','bing')
    def test_local_fallback_and_offline_do_not_lose_success(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'cache') as tmp:
            root=Path(tmp);engine=Mock();engine.call.return_value=['本地译文'];events=[];lesson={'sentences':[{'id':'a','text':'今日は晴れです。'}]}
            with patch.object(ft,'translate_free',side_effect=RuntimeError('unavailable')),patch.object(worker,'emit',side_effect=lambda kind,**kw:events.append({'type':kind,**kw})):
                worker.translate(engine,lesson,{'online':True,'onlineFallback':True},root,root)
            self.assertEqual([e['source'] for e in events if e['type']=='translation'],['M2M100 · 本地'])
            with patch.object(ft,'translate_free') as network,patch.object(worker,'emit'):
                worker.translate(None,lesson,{'online':False},root,root);network.assert_not_called()

if __name__=='__main__':unittest.main(verbosity=2)
