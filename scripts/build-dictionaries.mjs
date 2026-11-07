import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
fs.cpSync(path.resolve('node_modules/kuromoji/dict'),path.resolve('assets/kuromoji'),{recursive:true});
const buildRoot=path.resolve('cache/dictionary-build');fs.mkdirSync(buildRoot,{recursive:true});
fs.mkdirSync(path.join(buildRoot,'assets'),{recursive:true});fs.cpSync(path.resolve('assets/kuromoji'),path.join(buildRoot,'assets/kuromoji'),{recursive:true});
const w=new Worker(path.resolve('out/db-worker.cjs'),{workerData:{root:buildRoot}});let serial=0;const pending=new Map();
const ready=new Promise((resolve,reject)=>{w.on('message',m=>{if(m.ready)resolve();else {const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error)):p?.resolve(m.result);}});w.on('error',reject);});
async function call(method,args){await ready;return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});w.postMessage({id,method,args});});}
try{
 for(const [file,language,source] of [['jitendex-zh.zip','zh','https://github.com/greyindex/jitendex-yomitan-zh'],['jmdict-en.zip','en','https://github.com/yomidevs/jmdict-yomitan'],['wiktionary-ja-en.zip','en','https://github.com/yomidevs/wiktionary-to-yomitan'],['kanjium-pitch.zip','ja','https://github.com/mifunetoshiro/kanjium']]){
  console.log(await call('dictionaryImport',{file:path.join(root,'assets/dictionaries',file),language,source}));
 }
 const timings=[];
 for(const query of ['今日','学校','食べる','天気','食べました','散歩']){const start=performance.now();const result=await call('lookup',{query});timings.push({query,ms:Math.round(performance.now()-start),dictionaries:[...new Set(result.entries.map(e=>e.dictionary))],pitches:result.entries[0]?.pitches,meaning:result.entries[0]?.meanings[0]});}
 await call('checkpoint');fs.copyFileSync(path.join(buildRoot,'data/dictionaries.sqlite'),path.join(root,'assets/dictionaries.sqlite'));
 fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/dictionary.json',JSON.stringify(timings,null,2));console.log(timings);
}finally{await w.terminate();}
