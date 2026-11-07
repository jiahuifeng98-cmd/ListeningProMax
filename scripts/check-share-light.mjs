import {_electron as electron} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
const project=process.cwd(),root=path.resolve('cache/分享验收 中文 空格/.ListeningProMax'),report={passed:false,checks:[]};
const env={...process.env,LPM_ROOT:root,TEMP:path.join(root,'cache/tmp'),TMP:path.join(root,'cache/tmp'),APPDATA:path.join(root,'cache'),LOCALAPPDATA:path.join(root,'cache'),PATH:process.env.SystemRoot+'\\System32;'+process.env.SystemRoot};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:path.join(root,'app/ListeningProMax.App.exe'),cwd:root,env,timeout:60000});
try{
 const page=await app.firstWindow();await page.setViewportSize({width:1440,height:1000});await page.waitForSelector('h1');
 const api=(method,args={})=>page.evaluate(({method,args})=>window.api.call(method,args),{method,args});
 const poll=async(fn,ms=60000)=>{const until=Date.now()+ms;while(Date.now()<until){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw Error('Actual IPC state did not become ready');};
 let lib=await api('library');assert.equal(lib.lessons.length,0);assert.equal((await api('favorites')).length,0);assert.equal(lib.lightweight,true);assert.equal(lib.health.python,true);assert.equal(lib.health.turbo,false);assert.equal(lib.health.small,false);assert.equal(lib.health.translation,false);assert.equal(lib.settings.online,true);assert.equal(lib.settings.onlineFallback,false);
 report.checks.push('empty personal library; no models; online default, no silent local fallback');
 await page.screenshot({path:'reports/share-v19/library.png'});
 const word=await api('lookup',{query:'使われて'});assert(word.entries.some(e=>e.expression==='使う'&&e.reading==='つかう'));report.checks.push('local dictionaries and inflected readings bundled');
 await page.getByRole('button',{name:'设置与资源',exact:true}).click();await page.getByRole('heading',{name:'按需下载离线模型'}).waitFor();
 assert.equal(await page.locator('.model-downloads button').filter({hasText:'下载'}).count(),3);await page.locator('.model-downloads').screenshot({path:'reports/share-v19/models.png'});
 const playSettings=page.locator('.settings-card').filter({has:page.getByRole('heading',{name:'句子播放',exact:true})});await playSettings.screenshot({path:'reports/share-v19/playback.png'});report.checks.push('model sizes and all three optional downloads visible');
 // Public fixture only. Importing AUDIO without a model must prepare playback, not start a download.
 const first=await api('import',{paths:[path.join(project,'reports/fixtures/julius-sample.wav')]});
 await poll(async()=>(await api('lesson',{id:first.id})).durationMs>0);
 await poll(async()=>!(await api('library')).tasks.some(t=>['running','queued'].includes(t.state)));
 assert.equal((await api('resourceStatus')).progress,undefined);assert.equal((await api('lesson',{id:first.id})).sentences.length,0);report.checks.push('audio without model plays without forced download');
 await page.getByRole('button',{name:'课程库',exact:true}).click();await page.getByRole('heading',{name:'julius-sample',exact:true}).click();await page.getByRole('heading',{name:'尚未生成逐句文稿',exact:true}).waitFor();
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async(_w,options)=>{globalThis.shareModelPrompt=options;return {response:0,checkboxChecked:false};};});
 await page.getByRole('button',{name:'生成逐句文稿',exact:true}).click();await poll(async()=>Boolean(await app.evaluate(()=>globalThis.shareModelPrompt)));
 const prompt=await app.evaluate(()=>globalThis.shareModelPrompt);assert(prompt.detail.includes('MB'));assert.equal((await api('resourceStatus')).progress,undefined);assert((await api('library')).lessons.some(l=>l.id===first.id));report.checks.push('first ASR asks before model download; declining preserves playable course and shows idle status');
 // Self-authored teaching demonstration: silent audio, not a recognition accuracy claim.
 const demo=path.join(root,'cache/quickstart');fs.mkdirSync(demo,{recursive:true});const bytes=16000*20*2,b=Buffer.alloc(44+bytes);b.write('RIFF');b.writeUInt32LE(36+bytes,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(bytes,40);fs.writeFileSync(path.join(demo,'日常会話.wav'),b);
 fs.writeFileSync(path.join(demo,'日常会話.srt'),'1\n00:00:01,000 --> 00:00:06,000\n今日はいい天気ですね。\n\n2\n00:00:07,000 --> 00:00:12,000\n一緒に図書館へ行きませんか。\n\n3\n00:00:13,000 --> 00:00:18,000\nいいですね。午後二時に会いましょう。\n');
 const lesson=await api('import',{paths:[path.join(demo,'日常会話.wav'),path.join(demo,'日常会話.srt')]});await poll(async()=>(await api('lesson',{id:lesson.id})).durationMs===20000);
 await poll(async()=>!(await api('library')).tasks.some(t=>['running','queued'].includes(t.state)));
 await page.getByRole('button',{name:'课程库',exact:true}).click();await page.getByRole('heading',{name:'日常会話',exact:true}).click();await page.locator('.sentence').first().click();await poll(async()=>await page.locator('audio').evaluate(a=>!a.paused&&a.currentTime>0.6));await page.keyboard.press('Space');await page.screenshot({path:'reports/share-v19/study.png'});
 const actual=await api('lesson',{id:lesson.id});assert.deepEqual(actual.sentences.map(s=>[s.startMs,s.endMs]),[[1000,6000],[7000,12000],[13000,18000]]);report.checks.push('audio + SRT import, exact cue times and playback without models');
 await page.locator('.japanese').first().evaluate(e=>{const text=e.firstChild,r=document.createRange(),start=text.textContent.indexOf('天気');r.setStart(text,start);r.setEnd(text,start+2);window.getSelection().removeAllRanges();window.getSelection().addRange(r);e.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
 await page.locator('.lookup-card .core-meaning').waitFor();await page.locator('.lookup-card').screenshot({path:'reports/share-v19/dictionary.png'});await page.getByRole('button',{name:'关闭词卡',exact:true}).click();
 const networkStart=Date.now();try{const result=await api('lookupOnline',{requestId:'share-network-check',query:'図書館'});assert(result.text);report.network={passed:true,text:result.text,seconds:(Date.now()-networkStart)/1000};}catch(e){report.network={passed:false,error:e.message,seconds:(Date.now()-networkStart)/1000};}assert((Date.now()-networkStart)<20000);report.checks.push('network dictionary lookup returns result or bounded error');
 const oldIds=(await api('library')).tasks.map(t=>t.id);await page.getByRole('button',{name:'中文翻译',exact:true}).click();await poll(async()=>{const t=(await api('library')).tasks.find(t=>t.kind==='translate'&&!oldIds.includes(t.id));return t&&!['running','queued'].includes(t.state);});
 report.translation={completed:(await api('lesson',{id:lesson.id})).sentences.filter(s=>s.translation).length,total:3};await page.screenshot({path:'reports/share-v19/translated.png'});
 const paths=await app.evaluate(({app})=>Object.fromEntries(['userData','sessionData','temp','logs'].map(k=>[k,app.getPath(k)])));assert(Object.values(paths).every(p=>p.startsWith(root)));report.paths=paths;report.checks.push('all Electron writable paths under extracted package');
 report.passed=true;
}finally{await app.close();fs.writeFileSync('reports/share-v19/ui.json',JSON.stringify(report,null,2));}console.log(JSON.stringify(report));
