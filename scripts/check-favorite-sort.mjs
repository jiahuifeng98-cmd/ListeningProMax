// Real SQLite worker + Electron UI regression, with generated data only.
import { _electron as electron } from 'playwright';
import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const project=process.cwd(), root=path.join(project,'cache','favorite-sort-'+Date.now());
const reportDir=path.join(project,'reports/favorite-sort');
fs.mkdirSync(path.join(root,'cache/tmp'),{recursive:true});
fs.mkdirSync(reportDir,{recursive:true});
const report={passed:false,root,checks:[]};
const packaged=process.argv.includes('--release');
const code=packaged?path.join(project,'release/ListeningProMax/app/resources/app/out'):path.join(project,'out');
const check=name=>{report.checks.push(name);console.log('PASS',name);};
let worker,app,page;
async function startWorker(){
  worker=new Worker(path.join(code,'db-worker.cjs'),{workerData:{root}});
  worker.setMaxListeners(20);
  await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.ready)resolve();});worker.on('error',reject);});
}
let seq=0;
const db=(method,args={})=>new Promise((resolve,reject)=>{
  const id=++seq,timer=setTimeout(()=>{worker.off('message',listener);reject(Error('DB timeout: '+method));},10000);
  const listener=m=>{if(m.id!==id)return;clearTimeout(timer);worker.off('message',listener);m.error?reject(Error(m.error)):resolve(m.result);};
  worker.on('message',listener);worker.postMessage({id,method,args});
});
const origin={lessonId:'course',sentenceId:'s0',positionMs:0};
const word=(text)=>({kind:'word',text,reading:'かな',meaning:'测试释义',origin});
const course=id=>({id,title:'playback-smoke-'+id,createdAt:'now',updatedAt:'now',version:1,durationMs:0,originalText:'',reference:'',positionMs:0,rate:1,loop:'off',hidden:false,referenceCollapsed:true,sentences:Array.from({length:3},(_,i)=>({id:'s'+i,text:'今日はいい天気ですね。',startMs:null,endMs:null,words:[],issues:[]}))});
const api=(method,args={})=>page.evaluate(({method,args})=>window.api.call(method,args),{method,args});
const nav=()=>page.getByRole('button',{name:'我的收藏',exact:true}).click();
const texts=()=>page.locator('.favorite h3').allTextContents();
async function expectTexts(expected){
  for(let i=0;i<50;i++){
    const actual=await texts();
    if(JSON.stringify(actual)===JSON.stringify(expected))return;
    await new Promise(r=>setTimeout(r,100));
  }
  assert.deepEqual(await texts(),expected);
}
try{
  await startWorker();await db('create',course('course'));await db('create',course('deleted'));
  await db('settings',{appearance:{theme:'light',japaneseSize:28,translationSize:17}});
  await worker.terminate();worker=null;
  const sql=new DatabaseSync(path.join(root,'data/library.sqlite'));
  const insert=(id,text,origins)=>{const f={id,kind:'word',key:text+'\0かな',text,reading:'かな',meaning:'示例释义',origins,createdAt:'2026-10-01'};sql.prepare('INSERT INTO favorites VALUES(?,?,?,?)').run(id,f.kind,f.key,JSON.stringify(f));};
  insert('legacy-low','猫',[origin]);
  insert('legacy-high','図書館',[0,1,2].map(i=>({...origin,sentenceId:'s'+i})));
  insert('legacy-deleted','旧词',[0,1].map(i=>({lessonId:'deleted',sentenceId:'s'+i})));
  sql.close();await startWorker();
  await db('deleteLesson',{id:'deleted'});
  const retained=(await db('favorites')).find(f=>f.id==='legacy-deleted');
  assert.equal(retained.collectionCount,2);assert.equal(retained.origins.length,0);
  await db('removeFavorite',{id:retained.id});check('deleting a course preserves legacy collection count');
  const first=await db('favorite',word('調べる'));
  await Promise.all(Array.from({length:10},()=>db('favorite',word('調べる'))));
  const repeated=(await db('favorites')).find(f=>f.id===first.id);
  assert.equal(repeated.collectionCount,11);assert.equal(repeated.origins.length,1);
  await db('removeFavorite',{id:first.id});check('repeated saves count individually, retain one identity and deduplicated origin');
  for(const text of ['勉強','練習']){await db('favorite',word(text));await db('favorite',word(text));}
  await db('favorite',{kind:'sentence',text:'今日はいい天気ですね。',origin});
  const defaultRows=await db('favorites'),defaultOrder=defaultRows.map(f=>f.text);
  assert.deepEqual(defaultOrder,['今日はいい天気ですね。','練習','勉強','図書館','猫']);
  await worker.terminate();worker=null;
  const env={...process.env,LPM_ROOT:root,TEMP:path.join(root,'cache/tmp'),TMP:path.join(root,'cache/tmp')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:path.join(project,packaged?'release/ListeningProMax/app/ListeningProMax.App.exe':'node_modules/electron/dist/electron.exe'),args:packaged?[]:[project],cwd:project,env});
  page=await app.firstWindow();await page.setViewportSize({width:1280,height:900});
  await nav();await expectTexts(defaultOrder);
  assert.equal(await page.getByLabel('排序',{exact:true}).inputValue(),'default');
  assert.equal((await api('favorites')).find(f=>f.text==='勉強').collectionCount,2);
  check('default order unchanged and collection counts survive worker restart');
  await page.getByLabel('排序',{exact:true}).selectOption('count');
  await expectTexts(['図書館','練習','勉強','猫','今日はいい天気ですね。']);
  assert.deepEqual(await page.locator('.favorite-count').allTextContents(),['收藏 3 次','收藏 2 次','收藏 2 次','收藏 1 次']);
  assert.deepEqual(await api('favorites'),defaultRows);check('count descending; stable ties; sentences last; sorting does not write favorites');
  await page.screenshot({path:path.join(reportDir,'favorites-light.png')});
  await page.getByLabel('排序',{exact:true}).selectOption('default');await expectTexts(defaultOrder);
  await page.getByLabel('排序',{exact:true}).selectOption('count');
  await page.locator('.favorite').filter({has:page.getByRole('heading',{name:'図書館',exact:true})}).locator('.favorite-origins button').first().click();
  await page.locator('#sentence-s0').waitFor();check('sorted favorite still opens its original sentence');
  await nav();await expectTexts(['図書館','練習','勉強','猫','今日はいい天気ですね。']);
  await page.locator('.favorite').filter({has:page.getByRole('heading',{name:'勉強',exact:true})}).getByRole('button',{name:'移除收藏'}).click();
  await expectTexts(['図書館','練習','猫','今日はいい天気ですね。']);check('choice survives navigation; removal updates sorted list');
  await page.setViewportSize({width:850,height:720});
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
  assert(await page.getByLabel('排序',{exact:true}).isVisible());
  assert.equal(await page.locator('.page').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  await page.screenshot({path:path.join(reportDir,'favorites-dark-narrow.png')});check('dark theme and narrow layout fit without horizontal overflow');
  for(const f of await api('favorites'))await api('removeFavorite',{id:f.id});
  await page.getByRole('button',{name:'课程库',exact:true}).click();await nav();
  await page.getByRole('heading',{name:'把想记住的内容留在这里',exact:true}).waitFor();
  await page.getByLabel('排序',{exact:true}).selectOption('default');await expectTexts([]);check('empty favorites support either sorting mode');
  report.passed=true;
}finally{
  if(worker)await worker.terminate();if(app)await app.close();
  fs.writeFileSync(path.join(reportDir,packaged?'release.json':'checks.json'),JSON.stringify(report,null,2));
}
