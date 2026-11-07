import {describe,it,expect} from 'vitest';
import {normalizePlayback,playbackRange} from '../src/shared/playback';
import type {Sentence} from '../src/shared/types';
const s:Sentence={id:'x',text:'テスト。',startMs:1000,endMs:2000,words:[],issues:[]};
describe('independent playback options',()=>{
 it('keeps old padding and defaults silent gap off',()=>expect(normalizePlayback()).toEqual({padding:true,loopPause:false}));
 it.each([true,false])('gap does not change audio bounds: %s',loopPause=>{
   const p=normalizePlayback({padding:false,loopPause});
   expect(playbackRange(s,5000,p.padding)).toEqual({startMs:1000,endMs:2000});
 });
 it('padding remains clamped and leaves timeline immutable',()=>{
   const before=JSON.stringify(s);
   expect(playbackRange(s,2200,true)).toEqual({startMs:500,endMs:2200});
   expect(JSON.stringify(s)).toBe(before);
 });
});
