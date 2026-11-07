import {_electron as electron} from 'playwright';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const project=process.cwd(),root=path.resolve(process.argv[2]||'release/ListeningProMax');
fs.mkdirSync(path.join(root,'cache/tmp'),{recursive:true});
const env={...process.env,LPM_ROOT:root,TEMP:path.join(root,'cache/tmp'),TMP:path.join(root,'cache/tmp'),APPDATA:path.join(root,'cache'),LOCALAPPDATA:path.join(root,'cache'),HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',PYTHONUTF8:'1'};
delete env.ELECTRON_RUN_AS_NODE;delete env.PYTHONHOME;delete env.PYTHONPATH;
const start=performance.now();const app=await electron.launch({executablePath:path.join(root,'app/ListeningProMax.App.exe'),args:[],cwd:root,env,timeout:30000});
const monitor=spawn(path.join(project,'runtime/python/python.exe'),[path.join(project,'scripts/monitor-process.py'),String(app.process().pid),path.join(project,'reports/process-metrics.json')],{env:process.env,windowsHide:true,stdio:'ignore'});
const report={root,checks:[],startupMs:0,memory:[],outboundRequests:[]};
async function poll(work,timeout=600000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await work();if(value)return value;await new Promise(r=>setTimeout(r,500));}throw Error('Timed out waiting for background task');}
try{
 const page=await app.firstWindow();await page.waitForSelector('h1');report.startupMs=Math.round(performance.now()-start);
 await app.evaluate(({session})=>{globalThis.denied=[];session.defaultSession.webRequest.onBeforeRequest((req,cb)=>{if(/^https?:/.test(req.url)){globalThis.denied.push(req.url);cb({cancel:true});}else cb({});});});
 const paths=await app.evaluate(({app})=>({userData:app.getPath('userData'),sessionData:app.getPath('sessionData'),temp:app.getPath('temp'),logs:app.getPath('logs')}));assert(Object.values(paths).every(p=>p.startsWith(root)));report.paths=paths;report.checks.push('portable browser paths');
 const lib=await page.evaluate(()=>window.api.call('library'));assert(Object.values(lib.health).every(Boolean));report.checks.push('all bundled models present');
 const title='日本語 音声 '+Date.now();const src=path.join(project,'reports/fixtures/julius-sample.wav');const file=path.join(root,'cache/tmp',title+'.wav');fs.copyFileSync(src,file);
 const lesson=await page.evaluate(file=>window.api.call('import',{paths:[file]}),file);
 await page.getByRole('heading',{name:title,exact:true}).click();
 await poll(async()=>{const l=await page.evaluate(()=>window.api.call('library'));return l.tasks.some(t=>t.lessonId===lesson.id&&['done','error'].includes(t.state));});
 let state=await page.evaluate(()=>window.api.call('library'));let task=state.tasks.find(t=>t.lessonId===lesson.id);assert.equal(task.state,'done',task.error);
 let loaded=await page.evaluate(id=>window.api.call('lesson',{id}),lesson.id);assert(loaded.sentences.length>0);assert(/今日は/.test(loaded.sentences[0].text));assert(/[。！？]$/.test(loaded.sentences[0].text));report.transcript=loaded.sentences;report.checks.push('offline audio to punctuated aligned transcript');
 await page.locator('.sentence').first().click();await page.waitForTimeout(400);assert.equal(await page.locator('audio').evaluate(a=>a.paused),false);await page.keyboard.press('Space');
 report.memory.push({stage:'playback',metrics:await app.evaluate(({app})=>app.getAppMetrics().map(p=>({type:p.type,...p.memory})))});
 const lookup=await page.evaluate(()=>window.api.call('lookup',{query:'今日'}));assert(lookup.entries.some(e=>e.language==='zh'&&e.meanings.includes('今天')));report.checks.push('bundled three dictionaries');
 await page.getByRole('button',{name:'中文翻译',exact:true}).click();
 const translateStarted=performance.now();await poll(async()=>{const library=await page.evaluate(()=>window.api.call('library'));const failed=library.tasks.find(t=>t.lessonId===lesson.id&&t.kind==='translate'&&t.state==='error');if(failed)throw Error(failed.error);const l=await page.evaluate(id=>window.api.call('lesson',{id}),lesson.id);return l.sentences.length&&l.sentences.every(s=>s.translation);},240000);report.translationMs=Math.round(performance.now()-translateStarted);report.checks.push('bundled local Chinese translation');
 await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows()){w.restore();w.show();w.focus();}});await page.bringToFront();
 try{await page.screenshot({path:path.join(project,'reports/screenshots/portable.png'),animations:'disabled',timeout:10000});report.screenshotCaptured=true;}catch(e){report.screenshotCaptured=false;report.screenshotError=e.message;}
 report.memory.push({stage:'after dictionary and translation',metrics:await app.evaluate(({app})=>app.getAppMetrics().map(p=>({type:p.type,...p.memory})))});
 await page.setViewportSize({width:1000,height:720});if(report.screenshotCaptured)await page.screenshot({path:path.join(project,'reports/screenshots/portable-small.png'),animations:'disabled',timeout:10000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);report.checks.push('1000px layout');
 report.outboundRequests=await app.evaluate(()=>globalThis.denied);assert.equal(report.outboundRequests.length,0);
 report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;throw e;}finally{fs.writeFileSync(path.join(project,'reports/portable.json'),JSON.stringify(report,null,2));await app.close();}
console.log('PORTABLE PASS',report.startupMs);
