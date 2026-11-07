import {_electron as electron} from 'playwright';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve('release/ListeningProMax'),env={...process.env,LPM_ROOT:root};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:path.join(root,'app/ListeningProMax.App.exe'),args:[],cwd:root,env});
try{
 const page=await app.firstWindow();await page.waitForSelector('h1');
 const library=await page.evaluate(()=>window.api.call('library'));assert.equal(library.settings.freeProvider,'bing');
 await page.getByRole('button',{name:'设置与资源',exact:true}).click();await page.waitForSelector('.settings');
 const text=await page.locator('.settings').innerText();assert(text.includes('微软必应 · 日语 → 简体中文'));assert(!/Google|MyMemory|API 密钥\s*\n/.test(text));
 await page.getByRole('button',{name:'保存设置',exact:true}).click();await page.getByText('设置已保存',{exact:true}).waitFor();
 const after=await page.evaluate(()=>window.api.call('library'));assert.deepEqual(after.settings,library.settings);
 await page.locator('.settings h1').scrollIntoViewIfNeeded();await page.screenshot({path:'reports/v14/settings.png'});
 fs.writeFileSync('reports/v14/ui.json',JSON.stringify({passed:true,checks:['Bing migrated and shown','Google and MyMemory choices removed','no paid key configuration','settings round trip preserves offline and fallback choices']},null,2));console.log('V14 UI PASS');
}finally{await app.close();}
