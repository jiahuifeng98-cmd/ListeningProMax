import {_electron as electron} from 'playwright';
import {Worker} from 'node:worker_threads';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const project=process.cwd(),root=path.join(project,'cache/v18-background-'+Date.now()),report={passed:false,checks:[]};
fs.mkdirSync(path.join(root,'cache/tmp'),{recursive:true});fs.symlinkSync(path.join(project,'runtime'),path.join(root,'runtime'),'junction');
fs.cpSync('worker',path.join(root,'worker'),{recursive:true,filter:p=>!p.includes('__pycache__')});
const w=new Worker(path.join(project,'out/db-worker.cjs'),{workerData:{root}});
await new Promise((resolve,reject)=>{w.on('message',m=>{if(m.ready)resolve();});w.on('error',reject);});
let seq=0;const db=(method,args={})=>new Promise((resolve,reject)=>{const id=++seq;const listener=m=>{if(m.id!==id)return;w.off('message',listener);m.error?reject(Error(m.error)):resolve(m.result);};w.on('message',listener);w.postMessage({id,method,args});});
const base={id:'pending',title:'playback-smoke-background',createdAt:'now',updatedAt:'now',version:1,durationMs:10000,sourceMedia:'data/media/pending/source.wav',originalText:'',reference:'',positionMs:0,rate:1,loop:'off',hidden:false,referenceCollapsed:true,sentences:[{id:'s',text:'今日は。晴れです。',startMs:1000,endMs:6000,words:[],issues:[],translation:'原译文'}]};
await db('create',base);await db('settings',{online:false});
// A result from an older worker snapshot must not discard a translation saved meanwhile.
await db('translation',{id:'pending',sentenceId:'s',text:base.sentences[0].text,translation:'最新译文',source:'cache'});
await db('timeline',{id:'pending',version:1,sentences:base.sentences});
assert.equal((await db('lesson',{id:'pending'})).sentences[0].translation,'最新译文');
report.checks.push('timeline replacement retains concurrent translation for identical sentence text');
await w.terminate();
const cache=path.join(root,'data/translation-cache');fs.mkdirSync(cache,{recursive:true});
for(const [text,translation] of [['今日は。','今天。'],['晴れです。','晴天。']])fs.writeFileSync(path.join(cache,crypto.createHash('sha256').update('local\0'+text).digest('hex')+'.json'),JSON.stringify({text,translation,source:'回归缓存'}));
fs.copyFileSync(path.join(root,'worker/worker.py'),path.join(root,'worker/actual_worker.py'));
fs.writeFileSync(path.join(root,'worker/worker.py'),`import json,sys,runpy
from pathlib import Path
r=json.loads(Path(sys.argv[1]).read_text('utf-8'))
if r['kind']=='realign':
 marker=Path(r['root'])/'fail-once'
 if not marker.exists():
  marker.write_text('failed')
  print(json.dumps({'type':'error','message':'测试：首次局部对齐失败'}),flush=True)
  sys.exit(1)
 sentences=r['lesson']['sentences']
 for i,s in enumerate(sentences):
  s['startMs']=1000+i*2500
  s['endMs']=3000+i*2500
 print(json.dumps({'type':'result','sentences':sentences},ensure_ascii=False),flush=True)
else:
 runpy.run_path(str(Path(__file__).with_name('actual_worker.py')),run_name='__main__')
`);
const env={...process.env,LPM_ROOT:root,TEMP:path.join(root,'cache/tmp'),TMP:path.join(root,'cache/tmp'),PYTHONUTF8:'1'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:path.join(project,'node_modules/electron/dist/electron.exe'),args:[project],cwd:project,env});const page=await app.firstWindow();
const api=(method,args={})=>page.evaluate(({method,args})=>window.api.call(method,args),{method,args});
const wait=async fn=>{for(let n=0;n<100;n++){if(await fn())return;await page.waitForTimeout(100);}throw Error('Timed out');};
try{
 await page.getByRole('heading',{name:base.title,exact:true}).waitFor();
 const before=await api('lesson',{id:'pending'});
 await api('edit',{id:'pending',version:before.version,translate:true,edit:{kind:'split',id:'s',offset:4}});
 await wait(async()=>(await api('library')).tasks.some(t=>t.state==='error'));
 assert.equal((await api('lesson',{id:'pending'})).sentences.length,1);
 assert.equal((await api('library')).tasks.filter(t=>t.kind==='translate').length,0);
 report.checks.push('failed deferred split preserves original sentence and does not translate uncommitted draft');
 const failed=(await api('library')).tasks.find(t=>t.state==='error');await api('retry',{id:failed.id});
 await wait(async()=>{const l=await api('lesson',{id:'pending'});return l.sentences.length===2&&l.sentences[0].translation==='今天。'&&l.sentences[1].translation==='晴天。';});
 assert((await api('library')).tasks.some(t=>t.kind==='realign'&&t.state==='done'));
 report.checks.push('retry of deferred split retains auto-translate request; committed sentences receive real cached translations');
 report.passed=true;
}finally{await app.close();fs.writeFileSync('reports/v18/background.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
