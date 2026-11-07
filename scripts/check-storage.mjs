import {Worker} from 'node:worker_threads';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const root=path.resolve('cache',`storage-test-${Date.now()}`);fs.mkdirSync(root,{recursive:true});
const worker=new Worker(path.resolve('out/db-worker.cjs'),{workerData:{root}});let seq=0;const pending=new Map();
await new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',m=>{if(m.ready)resolve();else{const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});});
const call=(method,args={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});worker.postMessage({id,method,args});});
const sentence=(id,text,startMs,endMs)=>({id,text,startMs,endMs,words:[],issues:[]});
const checks=[];
try{
 let lesson={id:'test',title:'保存与恢复',version:1,createdAt:'now',updatedAt:'now',durationMs:10000,originalText:'原稿',sentences:[sentence('a','今日は。',1000,2000),sentence('b','晴れです。',3000,4000),sentence('c','出かけます。',5000,6000)],reference:'独立原文',positionMs:3500,rate:1.25,loop:'sentence',selectedId:'b',hidden:false,referenceCollapsed:false};
 await call('create',lesson);
 for(const s of lesson.sentences.slice(0,2))await call('favorite',{kind:'sentence',text:s.text,origin:{lessonId:'test',sentenceId:s.id,positionMs:s.startMs}});
 await call('reference',{id:'test',text:'新しい参考資料'});assert.deepEqual((await call('lesson',{id:'test'})).sentences,lesson.sentences);assert.equal((await call('favorites')).length,2);checks.push('reference isolation');
 await assert.rejects(call('reference',{id:'test',expected:'独立原文',text:'古い整理結果'}));checks.push('stale reference rejection');
 lesson=await call('edit',{id:'test',version:1,edit:{kind:'merge',id:'a'}});assert.equal(lesson.sentences[0].text,'今日は。晴れです。');assert.equal((await call('favorites')).length,1);assert.equal((await call('resolve',{lessonId:'test',sentenceId:'b'})).sentenceId,'a');checks.push('merge preserves text and deduplicates bookmarks');
 await assert.rejects(call('timeline',{id:'test',version:1,sentences:[]}));assert.equal((await call('lesson',{id:'test'})).version,2);checks.push('stale timeline rejection');
 lesson=await call('edit',{id:'test',version:2,edit:{kind:'undo'}});assert.equal((await call('resolve',{lessonId:'test',sentenceId:'b'})).sentenceId,'b');checks.push('undo restores bookmark targets');
 await call('translation',{id:'test',sentenceId:'a',text:'过期原文',translation:'不应该显示'});assert.equal((await call('lesson',{id:'test'})).sentences[0].translation,undefined);checks.push('stale translation rejection');
 lesson=await call('edit',{id:'test',version:3,edit:{kind:'split',id:'c',offset:2}});assert.equal(lesson.sentences.slice(2).map(s=>s.text).join(''),'出かけます。');lesson=await call('edit',{id:'test',version:4,edit:{kind:'undo'}});checks.push('split and undo');
 await assert.rejects(call('edit',{id:'test',version:5,edit:{kind:'reset'}}),/已取消/);assert.deepEqual(await call('lesson',{id:'test'}),lesson);assert.equal(lesson.positionMs,3500);assert.equal(lesson.rate,1.25);assert.equal(lesson.loop,'sentence');checks.push('removed reset rejected; timeline and playback preserved');
 const media=path.join(root,'data/media/test/sample.wav');fs.mkdirSync(path.dirname(media),{recursive:true});fs.copyFileSync('reports/fixtures/julius-sample.wav',media);lesson.sourceMedia='data/media/test/sample.wav';lesson.mediaFile=lesson.sourceMedia;
 const zip=path.join(root,'backup.zip');const request=req=>{const r=spawnSync(path.resolve('runtime/python/python.exe'),[path.resolve('worker/backup.py')],{input:JSON.stringify({root,...req}),encoding:'utf8',env:process.env});if(r.status)throw Error(r.stdout+r.stderr);return JSON.parse(r.stdout);};
 request({mode:'export',file:zip,lesson,favorites:await call('favorites')});const restored=request({mode:'import',file:zip});assert.notEqual(restored.lesson.id,lesson.id);assert.deepEqual(restored.lesson.sentences.map(s=>s.text),lesson.sentences.map(s=>s.text));assert.equal(restored.lesson.reference,lesson.reference);assert.deepEqual(fs.readFileSync(path.join(root,restored.lesson.mediaFile)),fs.readFileSync(media));assert(restored.favorites.every(f=>f.origin.lessonId===restored.lesson.id));checks.push('streaming backup restore with media and favorite remapping');
 fs.writeFileSync('reports/storage.json',JSON.stringify({passed:true,checks},null,2));console.log('STORAGE PASS',checks.length);
}finally{await worker.terminate();}
