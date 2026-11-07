import {_electron as electron} from 'playwright';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve('release/ListeningProMax'),env={...process.env,LPM_ROOT:root};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:path.join(root,'app/ListeningProMax.App.exe'),args:[],cwd:root,env});
const checks=[];let page,original;
try{
 page=await app.firstWindow();await page.waitForSelector('h1');
 const lib=await page.evaluate(()=>window.api.call('library'));original=await page.evaluate(id=>window.api.call('lesson',{id}),lib.lessons.find(l=>l.title==='2017.12（N2）').id);
 await page.getByRole('heading',{name:'2017.12（N2）',exact:true}).click();await page.waitForSelector('.sentence');assert.equal(await page.locator('.sentence').count(),214);checks.push('214 recovered sentences visible');
 assert.equal(await page.getByRole('button',{name:/撤销/}).count(),0);checks.push('both undo controls removed');
 const loop=page.getByRole('button',{name:'切换循环模式',exact:true});assert.match(await loop.textContent(),/不循环/);await loop.click();assert.match(await loop.textContent(),/单句循环/);await loop.click();assert.match(await loop.textContent(),/不循环/);checks.push('exactly two loop states');
 await page.waitForFunction(()=>document.querySelector('audio').readyState>=2);
 for(const seconds of [30,1400,2800]){
  await page.getByRole('slider',{name:'播放进度',exact:true}).fill(String(seconds*1000));
  await page.getByRole('slider',{name:'播放进度',exact:true}).blur();
  await page.waitForFunction(s=>!document.querySelector('audio').seeking&&Math.abs(document.querySelector('audio').currentTime-s)<.2,seconds);
 }
 await page.keyboard.press('Space');await page.waitForFunction(()=>!document.querySelector('audio').paused);await page.waitForTimeout(300);await page.keyboard.press('Space');checks.push('original MP3 seeks at beginning middle and end and plays');
 assert.equal(await page.locator('.sentence.current').count(),1);checks.push('paused marker retained');
 await page.getByRole('button',{name:'设置与资源',exact:true}).click();await page.waitForSelector('.settings');
 assert.equal(await page.getByText('API 密钥',{exact:true}).count(),0);assert.equal(await page.getByText('兼容服务地址',{exact:true}).count(),0);assert.equal(await page.getByText('免费联网翻译',{exact:true}).count(),1);checks.push('free translation settings without API key or endpoint');
 await page.screenshot({path:'reports/v11/settings.png',timeout:15000});
 await page.getByRole('button',{name:/精听工作台/}).click();await page.waitForTimeout(700);
 const visible=await page.locator('.sentence.current').evaluate(row=>{const box=row.getBoundingClientRect(),pane=row.closest('.sentence-scroll').getBoundingClientRect();return {top:box.top,bottom:box.bottom,paneTop:pane.top,paneBottom:pane.bottom,height:box.height};});
 console.log('current sentence bounds',visible);assert(visible.bottom>visible.paneTop&&visible.top<visible.paneBottom);checks.push('return to study scrolls current sentence into view');
 await page.screenshot({path:'reports/v11/study.png',timeout:15000});
 fs.writeFileSync('reports/v11/ui.json',JSON.stringify({passed:true,checks},null,2));console.log('V11 UI PASS',checks);
}finally{
 if(original&&page){
  await page.evaluate(l=>{const a=document.querySelector('audio');a.pause();a.currentTime=l.positionMs/1000;a.playbackRate=l.rate;},original);
  await page.evaluate(l=>window.api.call('progress',{id:l.id,positionMs:l.positionMs,rate:l.rate,loop:l.loop,selectedId:l.selectedId,hidden:l.hidden,referenceCollapsed:l.referenceCollapsed}),original);
 }
 await app.close();
}
