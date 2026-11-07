import {chromium} from 'playwright';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const edge=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));assert(edge,'System Edge required for guide rendering check');
const dir=path.resolve('cache/share-build/guide-browser');fs.mkdirSync(dir,{recursive:true});
const context=await chromium.launchPersistentContext(dir,{executablePath:edge,headless:true,viewport:{width:1280,height:1000},env:{...process.env,TEMP:dir,TMP:dir,APPDATA:dir,LOCALAPPDATA:dir},args:['--disable-gpu','--no-first-run','--disable-background-networking']});
const report={passed:false};
try{const page=await context.newPage();await page.route('https://**/*',r=>r.abort());await page.goto(pathToFileURL(path.resolve('reports/share-20261106/使用说明.html')).href);
 await page.locator('img').evaluateAll(imgs=>imgs.forEach(i=>i.loading='eager'));await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));assert.equal(await page.locator('img').count(),9);
 await page.screenshot({path:'reports/share-20261106/guide-cover.png'});await page.locator('#download').scrollIntoViewIfNeeded();await page.screenshot({path:'reports/share-20261106/guide-models.png'});
 for(const width of [1280,700,390]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 report.passed=true;report.embeddedScreenshots=9;report.checkedWidths=[1280,700,390];report.externalAssetsRequired=false;
}finally{await context.close();fs.writeFileSync('reports/share-20261106/guide.json',JSON.stringify(report,null,2));}console.log(JSON.stringify(report));
