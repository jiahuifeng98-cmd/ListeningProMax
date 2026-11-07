import {_electron as electron} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]);
const env={...process.env,LPM_ROOT:root,TEMP:path.join(root,'cache/tmp'),TMP:path.join(root,'cache/tmp'),APPDATA:path.join(root,'cache'),LOCALAPPDATA:path.join(root,'cache'),HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'};
delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:path.join(root,'app/ListeningProMax.App.exe'),cwd:root,env,timeout:60000});
const report={root,passed:false};
try {
 const page=await app.firstWindow();
 await page.waitForSelector('h1');
 const state=await page.evaluate(()=>window.api.call('library'));
 assert.equal(state.lessons.length,0);
 assert(Object.values(state.health).every(Boolean),JSON.stringify(state.health));
 const result=await page.evaluate(()=>window.api.call('lookup',{query:'今日'}));
 assert(result.entries.some(e=>e.language==='zh'&&e.meanings.includes('今天')));
 report.checks=['empty personal library','all resource health checks','bundled Chinese dictionary lookup'];
 report.health=state.health;report.passed=true;
} finally {
 await app.close();
 fs.writeFileSync('reports/share-ui.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
