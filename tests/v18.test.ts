import {it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {playbackRange} from '../src/shared/playback';
import {lessonFileTargets} from '../src/main/lessonFiles';
import type {Sentence} from '../src/shared/types';
const sentence=(startMs:number|null,endMs:number|null):Sentence=>({id:'s',text:'テスト。',startMs,endMs,words:[],issues:[],anchor:true});
it('播放前后各加 500ms，不改写原始锚点',()=>{
 const s=sentence(1000,2000);expect(playbackRange(s,5000)).toEqual({startMs:500,endMs:2500});
 expect(s).toEqual(sentence(1000,2000));
});
it('首尾边界限制在实际媒体范围',()=>{
 expect(playbackRange(sentence(100,200),1000)).toEqual({startMs:0,endMs:700});
 expect(playbackRange(sentence(800,1000),1000)).toEqual({startMs:300,endMs:1000});
 expect(playbackRange(sentence(0,1000),1000)).toEqual({startMs:0,endMs:1000});
});
it('未对齐句子不伪造播放边界',()=>expect(playbackRange(sentence(null,null),1000)).toBeUndefined());
it.each(['../outside','..','a/b','a\\b','C:\\data',''])('删除拒绝无效课程标识 %s',id=>{
 expect(()=>lessonFileTargets(process.cwd(),id,[])).toThrow('标识');
});
it('课程清理只能选择每课自有目录',()=>{
 expect(lessonFileTargets(process.cwd(),'fixture',['task-1']).map(p=>path.relative(process.cwd(),p).replaceAll('\\','/'))).toEqual(['data/media/fixture','data/analysis/fixture','data/jobs/task-1']);
});
it('拒绝课程目录中的链接，保护链接目标文件',()=>{
 const root=fs.mkdtempSync(path.join(process.cwd(),'cache/v18-path-test-'));
 const external=path.join(root,'external'),link=path.join(root,'data/media/course');
 fs.mkdirSync(external);fs.writeFileSync(path.join(external,'keep.txt'),'keep');
 fs.mkdirSync(path.dirname(link),{recursive:true});fs.symlinkSync(external,link,'junction');
 try{expect(()=>lessonFileTargets(root,'course',[])).toThrow('链接');expect(fs.readFileSync(path.join(external,'keep.txt'),'utf8')).toBe('keep');}
 finally{fs.rmSync(link,{recursive:true});fs.rmSync(root,{recursive:true});}
});
