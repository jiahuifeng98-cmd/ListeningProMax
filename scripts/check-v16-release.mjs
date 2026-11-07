import {_electron as electron} from 'playwright';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const root=path.resolve('release/ListeningProMax'),env={...process.env,LPM_ROOT:root};delete env.ELECTRON_RUN_AS_NODE;
const report={passed:false,checks:[]},app=await electron.launch({executablePath:path.join(root,'app/ListeningProMax.App.exe'),env});
try{
 const page=await app.firstWindow();await page.waitForSelector('.version');assert.equal(await page.locator('.version').innerText(),'ListeningProMax · 1.6');
 const lib=await page.evaluate(()=>window.api.call('library'));assert(Object.values(lib.health).every(Boolean));
 const entry=await page.evaluate(()=>window.api.call('lookup',{query:'使われて'}));assert(entry.entries.some(e=>e.expression==='使う'&&e.reading==='つかう'));
 const numeric=await page.evaluate(()=>window.api.call('lookup',{query:'3週間'}));assert.equal(numeric.surfaceReading,'さんしゅうかん');assert.equal(lib.settings.shortcuts.loop,'Shift');
 const paths=await app.evaluate(({app})=>({userData:app.getPath('userData'),sessionData:app.getPath('sessionData'),temp:app.getPath('temp'),logs:app.getPath('logs')}));assert(Object.values(paths).every(p=>p.startsWith(root)));
 const deployment=JSON.parse(fs.readFileSync('reports/v16/deployment.json','utf8'));for(const file of deployment.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file.path))).digest('hex'),file.sha256);
 report.checks=['deployed 1.6 launches','bundled resources present','inflected and numeric readings work in release','default configurable shortcuts loaded','portable writable paths','deployed code and docs hashes match'];report.paths=paths;report.passed=true;
}finally{await app.close();fs.writeFileSync('reports/v16/release.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
