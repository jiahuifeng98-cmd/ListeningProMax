import {_electron as electron} from 'playwright';
import {Worker} from 'node:worker_threads';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const project=process.cwd(),root=path.join(project,'cache/v19-smoke-'+Date.now()),report={passed:false,checks:[]};
fs.mkdirSync(path.join(root,'data/media/course'),{recursive:true});fs.mkdirSync(path.join(root,'cache/tmp'),{recursive:true});fs.mkdirSync('reports/v19',{recursive:true});
const bytes=16000*96*2,wav=Buffer.alloc(44+bytes);
wav.write('RIFF');wav.writeUInt32LE(36+bytes,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(bytes,40);fs.writeFileSync(path.join(root,'data/media/course/sample.wav'),wav);
const w=new Worker(path.join(project,'out/db-worker.cjs'),{workerData:{root}});
await new Promise((resolve,reject)=>{w.on('message',m=>{if(m.ready)resolve();});w.on('error',reject);});
let seq=0;const db=(method,args={})=>new Promise((resolve,reject)=>{const id=++seq;const listener=m=>{if(m.id!==id)return;w.off('message',listener);m.error?reject(Error(m.error)):resolve(m.result);};w.on('message',listener);w.postMessage({id,method,args});});
const stamp=new Date().toISOString(),lesson={id:'course',title:'playback-smoke-v19',createdAt:stamp,updatedAt:stamp,version:1,durationMs:96000,mediaFile:'data/media/course/sample.wav',originalText:'',reference:'',positionMs:0,rate:1,loop:'sentence',hidden:false,referenceCollapsed:true,sentences:Array.from({length:24},(_,i)=>({id:'s'+i,text:`第${i+1}文です。今日はいい天気ですね。`,startMs:i*4000,endMs:i*4000+3600,words:[],issues:[]}))};
await db('create',lesson);await db('settings',{appearance:{theme:'light',japaneseSize:28,translationSize:17}});
await assert.rejects(()=>db('settings',{playback:{padding:'yes',loopPause:true}}));
await w.terminate();
const env={...process.env,LPM_ROOT:root,TEMP:path.join(root,'cache/tmp'),TMP:path.join(root,'cache/tmp')};delete env.ELECTRON_RUN_AS_NODE;
let app,page;
const api=(method,args={})=>page.evaluate(({method,args})=>window.api.call(method,args),{method,args});
const check=name=>{report.checks.push(name);console.log('PASS',name);};
const pause=()=>page.locator('audio').evaluate(a=>a.pause());
const pos=()=>page.locator('audio').evaluate(a=>a.currentTime);
const configure=async(padding,loopPause)=>{
 await pause();await page.getByRole('button',{name:'设置与资源',exact:true}).click();
 await page.getByLabel('句首、句尾各延长 0.5 秒',{exact:true}).setChecked(padding);
 await page.getByLabel('单句循环结束后静音等待 0.5 秒',{exact:true}).setChecked(loopPause);
 await page.getByRole('button',{name:'保存设置',exact:true}).click();
 await page.waitForFunction(p=>document.querySelector('.toast')?.textContent?.includes('设置已保存'),null,{timeout:5000});
 assert.deepEqual((await api('library')).settings.playback,{padding,loopPause});
 await page.getByRole('button',{name:'精听工作台',exact:true}).click();
};
const jump=async(i=3)=>{await page.locator('#sentence-s'+i).evaluate(e=>e.click());await page.waitForTimeout(200);};
const reachEnd=async(end)=>{
 await page.locator('audio').evaluate(async(a,t)=>{a.currentTime=t;await a.play();},end+.03);
 await page.waitForFunction(()=>document.querySelector('audio').paused,null,{timeout:3000});
};
try{
 app=await electron.launch({executablePath:path.join(project,'node_modules/electron/dist/electron.exe'),args:[project],cwd:project,env});page=await app.firstWindow();await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('heading',{name:lesson.title,exact:true}).click();
 for(const padding of [false,true])for(const gap of [false,true]){
  await configure(padding,gap);await jump();await pause();
  const p=await pos();assert(p>=(padding?11.5:12)&&p<(padding?12:12.5));
  await page.locator('audio').evaluate(a=>{a.playbackRate=2;});
  const end=padding?16.1:15.6;
  if(gap){
   await reachEnd(end);
   assert(Math.abs(await pos()-end)<.04);
   assert.equal(await page.locator('.sentence.current').getAttribute('id'),'sentence-s3');
   assert.match(await page.locator('.play-button').getAttribute('title'),/^暂停/);
   await page.waitForTimeout(250);assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);
   await page.waitForTimeout(360);assert.equal(await page.locator('audio').evaluate(a=>a.paused),false);assert(await pos()<13);
  }else{
   await page.locator('audio').evaluate(async(a,t)=>{a.currentTime=t+.03;await a.play();},end);
   await page.waitForTimeout(120);assert(await pos()<13);assert.equal(await page.locator('audio').evaluate(a=>a.paused),false);
  }
  await pause();check(`padding=${padding}, silent gap=${gap}: correct range and 500 ms wall-clock wait at 2x`);
 }
 await configure(false,true);await jump();await reachEnd(15.6);await page.keyboard.press('Space');await page.waitForTimeout(650);
 assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);assert(Math.abs(await pos()-15.6)<.05);
 check('Space during gap cancels pending restart and retains selected sentence');
 await jump();await reachEnd(15.6);await page.keyboard.press('ArrowRight');await page.waitForTimeout(650);
 assert.equal(await page.locator('.sentence.current').getAttribute('id'),'sentence-s4');assert((await pos())>=16);check('next shortcut during wait cancels old restart');
 await jump();await reachEnd(15.6);await page.locator('[aria-label="播放进度"]').fill('24500');await page.waitForTimeout(650);
 assert.equal(await page.locator('.sentence.current').getAttribute('id'),'sentence-s6');assert(await pos()>24);check('free seek during wait resumes at new target');
 await jump();await reachEnd(15.6);await page.keyboard.press('Shift');await page.waitForTimeout(650);
 assert(await pos()>15.6);assert.equal(await page.locator('.loop span').innerText(),'不循环');check('turning loop off during wait resumes continuous playback');
 await page.keyboard.press('Shift');await configure(true,true);await jump(23);
 await page.locator('audio').evaluate(async a=>{a.currentTime=95.98;await a.play();});
 await page.waitForFunction(()=>document.querySelector('audio').paused);await page.waitForTimeout(650);assert(await pos()<94);
 check('media end also honors silent wait before restart');
 await pause();await page.locator('#sentence-s12').focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(340);await pause();
 assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'sentence-s12');
 assert.equal(await page.locator('#sentence-s12 .sentence-marker').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 await page.locator('#sentence-s13').focus();await page.keyboard.press('Space');await page.keyboard.press('Space');
 assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'sentence-s13');
 await page.locator('#sentence-s13').focus();
 const box=await page.locator('#sentence-s13 .marker-cue').boundingBox();assert(box.height<=24);
 await page.keyboard.press('Enter');await pause();check('Space/next/Enter release row focus; Tab cue stays compact instead of stretching across row');
 await page.screenshot({path:'reports/v19/study.png'});
 assert.deepEqual((await api('lesson',{id:'course'})).sentences,lesson.sentences);check('options and loops never mutate stored words/timestamps');
 await app.close();app=undefined;
 app=await electron.launch({executablePath:path.join(project,'node_modules/electron/dist/electron.exe'),args:[project],cwd:project,env});page=await app.firstWindow();
 assert.deepEqual((await api('library')).settings.playback,{padding:true,loopPause:true});check('playback settings persist across restart; malformed values rejected');
 report.passed=true;
}finally{if(app)await app.close();fs.writeFileSync('reports/v19/interaction.json',JSON.stringify(report,null,2));}
