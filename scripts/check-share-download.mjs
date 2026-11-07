import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {build} from 'esbuild';
await build({entryPoints:['src/main/modelResources.ts'],outfile:'cache/share-build/download-check.mjs',bundle:true,platform:'node',format:'esm'});
const {downloadModel}=await import('../cache/share-build/download-check.mjs');
const file=JSON.parse(fs.readFileSync('assets/manifest.json','utf8')).find(r=>r.path==='models/small/config.json');assert(file);
const root=path.resolve('cache/share-download-check'),controller=new AbortController();let latest;const timer=setTimeout(()=>controller.abort(),75000);const started=Date.now();
try{await downloadModel(root,[file],'small',controller.signal,p=>latest=p);const report={passed:true,url:file.url,sha256:file.sha256,seconds:(Date.now()-started)/1000,progress:latest};fs.writeFileSync('reports/share-v19/download-network.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{clearTimeout(timer);}
