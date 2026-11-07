import {_electron as electron} from 'playwright';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.cwd(),env={...process.env,LPM_ROOT:root};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root],env});
try{
 const page=await app.firstWindow();await page.waitForSelector('h1');
 const title=`playback-smoke-translation-${Date.now()}`,file=path.join(root,'cache',title+'.txt');fs.writeFileSync(file,'駅はどこにありますか。明日は図書館で勉強します。');
 await page.evaluate(()=>window.api.call('settings',{online:true,onlineFallback:false,freeProvider:'bing'}));
 const lesson=await page.evaluate(paths=>window.api.call('import',{paths}),[file]);await page.getByRole('heading',{name:title,exact:true}).waitFor();await page.getByRole('heading',{name:title,exact:true}).click();await page.waitForSelector('.sentence');
 assert.equal(await page.locator('.translation').count(),0);const begin=Date.now();await page.getByRole('button',{name:'中文翻译',exact:true}).click();
 let task;while(Date.now()-begin<45000){const lib=await page.evaluate(()=>window.api.call('library'));task=lib.tasks.find(t=>t.lessonId===lesson.id&&t.kind==='translate');if(task&&['done','error'].includes(task.state))break;await page.waitForTimeout(300);}
 assert.equal(task?.state,'done',task?.error);await page.waitForFunction(()=>document.querySelectorAll('.translation').length===2&&[...document.querySelectorAll('.translation')].every(n=>n.innerText&&!/正在翻译|尚无译文/.test(n.innerText)));
 const saved=await page.evaluate(id=>window.api.call('lesson',{id}),lesson.id);assert(saved.sentences.every(s=>s.translationSource==='微软必应 · 免费联网'));
 fs.writeFileSync('reports/v14/translation-ui.json',JSON.stringify({passed:true,seconds:(Date.now()-begin)/1000,translations:saved.sentences.map(s=>s.translation),checks:['translation hidden until requested','real worker task completed without local fallback','two translated rows rendered','Bing source persisted']},null,2));console.log('TRANSLATION UI PASS');
}finally{await app.close();}
