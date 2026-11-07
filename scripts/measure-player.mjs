import {_electron as electron} from 'playwright';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve('release/ListeningProMax'),label=process.argv[2]||'before';
const env={...process.env,LPM_ROOT:root};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:path.join(root,'app/ListeningProMax.App.exe'),args:[],cwd:root,env});let page,lesson;
try{
 page=await app.firstWindow();await page.waitForSelector('h1');
 const library=await page.evaluate(()=>window.api.call('library'));const item=library.lessons.find(l=>l.title.includes('2017.12'));
 lesson=await page.evaluate(id=>window.api.call('lesson',{id}),item.id);await page.getByRole('heading',{name:item.title,exact:true}).click();await page.waitForSelector('.sentence');
 if(label==='final'){assert.equal(await page.locator('.issue').count(),0);assert(!/需复核|待校准|上次处理中断/.test(await page.locator('.study').innerText()));}
 await page.waitForFunction(()=>document.querySelector('audio').readyState>=2);await page.getByRole('button',{name:'播放 空格',exact:true}).click();
 await page.waitForTimeout(2500);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');const begin=await cdp.send('Performance.getMetrics');
 const memory=[];for(let i=0;i<5;i++){await page.waitForTimeout(1000);const rows=await app.evaluate(({app})=>app.getAppMetrics());memory.push(rows.reduce((n,r)=>n+r.memory.workingSetSize,0)/1024);}
 const end=await cdp.send('Performance.getMetrics');const value=(metrics,name)=>metrics.metrics.find(m=>m.name===name)?.value||0;
 const result={label,sentences:lesson.sentences.length,libraryPayloadBytes:Buffer.byteLength(JSON.stringify(library)),workingSetMiB:memory,medianMiB:[...memory].sort((a,b)=>a-b)[2],rendererTaskSeconds:value(end,'TaskDuration')-value(begin,'TaskDuration'),measurementSeconds:value(end,'Timestamp')-value(begin,'Timestamp')};
 fs.writeFileSync(`reports/v12/player-${label}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 if(label==='final'){await page.evaluate(()=>document.querySelector('audio').pause());await page.getByRole('slider',{name:'播放进度',exact:true}).fill('1235000');await page.getByRole('slider',{name:'播放进度',exact:true}).blur();await page.waitForTimeout(200);await page.screenshot({path:'reports/v12/study.png'});}
}finally{if(lesson&&page){await page.evaluate(l=>{const a=document.querySelector('audio');a.pause();a.currentTime=l.positionMs/1000;},lesson);await page.evaluate(l=>window.api.call('progress',{id:l.id,positionMs:l.positionMs,rate:l.rate,loop:l.loop,selectedId:l.selectedId}),lesson);}await app.close();}
