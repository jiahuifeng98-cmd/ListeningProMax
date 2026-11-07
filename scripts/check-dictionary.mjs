import {Worker} from 'node:worker_threads';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const worker=new Worker(path.resolve('out/db-worker.cjs'),{workerData:{root:process.cwd()}});let seq=0;const pending=new Map();
await new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',m=>{if(m.ready)resolve();else {const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});});
const lookup=query=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});worker.postMessage({id,method:'lookup',args:{query}});});
const db=new DatabaseSync('assets/dictionaries.sqlite',{readOnly:true});const words=db.prepare('SELECT DISTINCT expression FROM terms WHERE length(expression) BETWEEN 2 AND 8 LIMIT 100').all().map(r=>r.expression);db.close();
const report={firstQueryMs:0,unique:[],warm:[]};const p95=items=>[...items].sort((a,b)=>a-b)[Math.ceil(items.length*.95)-1];
try{
 let t=performance.now();const first=await lookup('今日');report.firstQueryMs=performance.now()-t;assert(first.entries.some(e=>e.language==='zh'&&e.meanings.includes('今天')));
 for(const word of words){t=performance.now();await lookup(word);report.unique.push(performance.now()-t);}
 for(const word of words){t=performance.now();await lookup(word);report.warm.push(performance.now()-t);}
 t=performance.now();const conjugated=await lookup('食べました');report.deinflectionMs=performance.now()-t;assert(conjugated.entries.some(e=>e.expression==='食べる'));report.uniqueP95Ms=p95(report.unique);report.warmP95Ms=p95(report.warm);report.queryCount=words.length;report.method='One process; first query includes SQLite setup already complete; unique queries use warmed OS file cache; repeated queries use app result cache';
 fs.writeFileSync('reports/dictionary-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify({first:report.firstQueryMs,uniqueP95:report.uniqueP95Ms,warmP95:report.warmP95Ms,deinflection:report.deinflectionMs}));
}finally{await worker.terminate();}
