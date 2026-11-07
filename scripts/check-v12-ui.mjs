import {_electron as electron} from 'playwright';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve('release/ListeningProMax'),env={...process.env,LPM_ROOT:root};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:path.join(root,'app/ListeningProMax.App.exe'),args:[],cwd:root,env});
const checks=[];let page,original,updated;
const content=s=>s.replace(/[\s\p{P}]/gu,'');
try{
 page=await app.firstWindow();await page.waitForSelector('h1');
 const lib=await page.evaluate(()=>window.api.call('library'));const item=lib.lessons.find(l=>l.title.includes('2017.12'));
 original=await page.evaluate(id=>window.api.call('lesson',{id}),item.id);
 const favorites=await page.evaluate(()=>window.api.call('favorites'));
 await page.getByRole('heading',{name:item.title,exact:true}).click();await page.waitForSelector('.sentence');
 assert.equal(await page.locator('.issue').count(),0);assert(!/需复核|待校准/.test(await page.locator('.study').innerText()));checks.push('review badges and count removed');
 await page.waitForFunction(()=>document.querySelector('audio').readyState>=2);
 await page.getByRole('slider',{name:'播放进度',exact:true}).fill('1235000');await page.getByRole('slider',{name:'播放进度',exact:true}).blur();
 await page.waitForFunction(()=>!document.querySelector('audio').seeking&&Math.abs(document.querySelector('audio').currentTime-1235)<.2);
 const beforeMedia=await page.locator('audio').evaluate(a=>({time:a.currentTime,rate:a.playbackRate,paused:a.paused}));
 const begin=Date.now();await page.getByRole('button',{name:'整理断句',exact:true}).click();
 let task;while(Date.now()-begin<110000){const state=await page.evaluate(()=>window.api.call('library'));task=state.tasks.filter(t=>t.kind==='segment'&&t.lessonId===item.id&&Date.parse(t.updatedAt)>=begin).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];if(task&&['done','error'].includes(task.state))break;await page.waitForTimeout(300);}
 assert(task,'No segmentation task completed');
 assert.equal(task.state,'done',task.error);const seconds=(Date.now()-begin)/1000;
 updated=await page.evaluate(id=>window.api.call('lesson',{id}),item.id);
 await page.waitForFunction(count=>document.querySelectorAll('.sentence').length===count,updated.sentences.length);
 assert.equal(content(updated.sentences.map(s=>s.text).join('')),content(original.sentences.map(s=>s.text).join('')));
 assert.equal(updated.reference,original.reference);assert.equal(updated.originalText,original.originalText);
 for(const s of original.sentences.filter(s=>s.anchor))assert.deepEqual(updated.sentences.find(t=>t.id===s.id),s);
 const afterMedia=await page.locator('audio').evaluate(a=>({time:a.currentTime,rate:a.playbackRate,paused:a.paused}));assert.deepEqual(afterMedia,beforeMedia);
 assert.equal(updated.loop,original.loop);checks.push('atomic sentence update preserves characters, anchors, reference and media state');
 const followingFavorites=await page.evaluate(()=>window.api.call('favorites'));assert.equal(followingFavorites.length,favorites.length);
 for(const f of followingFavorites)for(const o of f.origins.filter(o=>o.lessonId===item.id&&o.sentenceId)){const target=await page.evaluate(o=>window.api.call('resolve',o),o);assert(updated.sentences.some(s=>s.id===target.sentenceId));}
 checks.push('existing favorite origins still resolve');
 const example=updated.sentences.filter(s=>s.startMs>=1225000&&s.startMs<1254500);assert.equal(example.length,3);assert(example[2].text.includes('取り組んで'));checks.push('screenshot paragraph becomes three complete sentences');
 assert.equal(await page.locator('.sentence.current').count(),1);const current=await page.locator('.sentence.current').getAttribute('id');assert.equal(current,'sentence-'+example[1].id);checks.push('current marker follows actual time after splitting retained ID');
 await page.screenshot({path:'reports/v12/study.png'});
 const loop=page.getByRole('button',{name:'切换循环模式',exact:true});
 if((await loop.textContent()).includes('不循环'))await loop.click();
 await page.locator('#sentence-'+example[2].id).click();await page.waitForFunction(()=>!document.querySelector('audio').paused);
 await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('audio').paused);
 await page.keyboard.press('Space');await page.waitForFunction(()=>!document.querySelector('audio').paused);
 await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('audio').paused);
 assert.equal(await page.locator('.sentence.current').getAttribute('id'),'sentence-'+example[2].id);
 await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>!document.querySelector('audio').paused);
 assert.equal(await page.locator('.sentence.current').getAttribute('id'),'sentence-'+example[1].id);
 await page.keyboard.press('Space');checks.push('loop sentence switching and repeated Space keep marker');
 await page.getByRole('slider',{name:'播放进度',exact:true}).fill('2600000');await page.getByRole('slider',{name:'播放进度',exact:true}).blur();
 await page.waitForFunction(()=>!document.querySelector('audio').seeking&&Math.abs(document.querySelector('audio').currentTime-2600)<.2);checks.push('late-audio seek remains effective in single sentence loop');
 assert.equal(await page.getByRole('button',{name:/撤销/}).count(),0);
 await page.getByRole('button',{name:'设置与资源',exact:true}).click();assert.equal(await page.getByText('免费联网翻译',{exact:true}).count(),1);assert.equal(await page.getByText('API 密钥',{exact:true}).count(),0);
 checks.push('prior two-mode loop, no undo, free translation settings preserved');
 fs.writeFileSync('reports/v12/ui.json',JSON.stringify({passed:true,checks,taskId:task.id,seconds,beforeVersion:original.version,afterVersion:updated.version,beforeCount:original.sentences.length,afterCount:updated.sentences.length,example:example.map(({text,startMs,endMs})=>({text,startMs,endMs}))},null,2));console.log('V12 UI PASS',seconds,updated.sentences.length,checks);
}finally{
 if(original&&page){
  await page.evaluate(l=>{const a=document.querySelector('audio');a.pause();a.currentTime=l.positionMs/1000;a.playbackRate=l.rate;},original);
  const loop=page.getByRole('button',{name:'切换循环模式',exact:true});if((await loop.textContent()).includes('单句循环')!==(original.loop==='sentence'))await loop.click();
  const selectedId=updated?.sentences.find(s=>s.startMs<=original.positionMs&&s.endMs>original.positionMs)?.id||original.selectedId;
  await page.evaluate(l=>window.api.call('progress',l),{id:original.id,positionMs:original.positionMs,rate:original.rate,loop:original.loop,selectedId,hidden:original.hidden,referenceCollapsed:original.referenceCollapsed});
 }
 await app.close();
}
