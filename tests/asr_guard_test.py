import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'worker'))
from asr_guard import verify_outros
def result(start=3.5,end=3.64,text='ご視聴ありがとうございました。'):
    return {'segments':[{'text':text,'words':[{'word':'ご視聴','start':start,'end':end},{'word':'ありがとうございました。','start':end,'end':end}]}]}
class GuardTests(unittest.TestCase):
    def guard(self,r,retry):
        return verify_outros(r,10,14,30,retry)
    def test_context_disagrees_removes_only_candidate(self):
        r=result();r['segments'].insert(0,{'text':'相談してください','words':[{'word':'相談してください','start':0,'end':3}]})
        words,audit=self.guard(r,lambda *_:{'segments':[{'text':'難しいようならメニュー変更ですね。'}]})
        self.assertEqual(words,[{'text':'相談してください','startMs':10000,'endMs':13000}])
        self.assertEqual(audit[0]['decision'],'excluded-after-context-check')
    def test_real_outro_confirmation_preserved(self):
        words,audit=self.guard(result(),lambda *_:result(0,2))
        self.assertEqual(len(words),2);self.assertEqual(audit[0]['decision'],'kept')
    def test_natural_duration_not_retried(self):
        words,audit=self.guard(result(0,2),lambda *_:self.fail('should not retry'))
        self.assertEqual(len(words),2);self.assertFalse(audit)
    def test_middle_not_retried(self):
        words,audit=self.guard(result(1,1.14),lambda *_:self.fail('should not retry'))
        self.assertEqual(len(words),2);self.assertFalse(audit)
    def test_empty_retry_keeps_text(self):
        words,_=self.guard(result(),lambda *_:{'segments':[]})
        self.assertEqual(len(words),2)
    def test_timeout_keeps_text(self):
        def fail(*_):raise TimeoutError('bounded timeout')
        words,audit=self.guard(result(),fail)
        self.assertEqual(len(words),2);self.assertIn('error',audit[0])
if __name__=='__main__':unittest.main()
