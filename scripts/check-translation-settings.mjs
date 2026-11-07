import {Worker} from 'node:worker_threads';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve('cache',`storage-test-translation-${Date.now()}`);fs.mkdirSync(root,{recursive:true});
const w=new Worker(path.resolve('out/db-worker.cjs'),{workerData:{root}}),pending=new Map();let seq=0;
await new Promise((resolve,reject)=>{w.on('error',reject);w.on('message',m=>{if(m.ready)resolve();else{const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});});
const call=(method,args={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});w.postMessage({id,method,args});});
const db=new DatabaseSync(path.join(root,'data/library.sqlite'));const checks=[];
try{
 for(const legacy of ['google','mymemory',undefined]){
  const previous={model:'small',online:true,onlineFallback:false,endpoint:'',apiKey:'',onlineModel:'',...(legacy?{freeProvider:legacy}:{})};
  db.prepare('INSERT OR REPLACE INTO settings VALUES(1,?)').run(JSON.stringify(previous));
  const result=(await call('library')).settings;assert.deepEqual(result,{...previous,freeProvider:'bing'});
  assert.equal(JSON.parse(db.prepare('SELECT body FROM settings WHERE id=1').get().body).freeProvider,'bing');checks.push(`migrate ${legacy||'absent'} provider and preserve options`);
 }
 await assert.rejects(call('settings',{freeProvider:'google'}));checks.push('reject unsupported provider');
 const result=await call('settings',{online:false,freeProvider:'bing',onlineFallback:true});assert.equal(result.online,false);checks.push('offline preference remains supported');
 fs.writeFileSync('reports/v14/settings-migration.json',JSON.stringify({passed:true,checks},null,2));console.log('SETTINGS PASS',checks.length);
}finally{db.close();await w.terminate();}
