import {it,expect} from 'vitest';
import {dictionaryForms,kanaReading} from '../src/shared/dictionary';
import {editTimeline,recoverWordRange} from '../src/shared/timeline';
import type {Sentence} from '../src/shared/types';
it.each([['使われて','使う'],['食べさせられた','食べる'],['読んでいた','読む'],['話していました','話す'],['行った','行く'],['高くなかった','高い'],['書きませんでした','書く']])('還原 %s -> %s',(q,base)=>expect(dictionaryForms(q)).toContain(base));
it('候选有界且不改写输入',()=>{expect(dictionaryForms('使われて')).toHaveLength(new Set(dictionaryForms('使われて')).size);expect(dictionaryForms('使われて').length).toBeLessThanOrEqual(96);expect(dictionaryForms('使われて')[0]).toBe('使われて');expect(kanaReading('漢字')).toBe('');expect(kanaReading('ツカウ')).toBe('つかう');});
const old:Sentence={id:'a',text:'今日晴れ。明日は雨。',startMs:100,endMs:1000,words:[{text:'今日',startMs:100,endMs:300},{text:'晴れ',startMs:300,endMs:600},{text:'明日は雨',startMs:700,endMs:1000}],issues:[]};
it('只改字保留句界且使旧译文失效',()=>{const result=editTimeline([{...old,translation:'旧',translationSource:'旧来源'}],{kind:'text',id:'a',text:'今夜晴れ。'},()=> 'x').sentences[0];expect(result.startMs).toBe(100);expect(result.endMs).toBe(1000);expect(result.words).toEqual([]);expect(result.translationSource).toBeUndefined();});
it('历史恢复只采用完整词级边界',()=>{const broken={...old,text:'今日晴れ。',startMs:null,endMs:null,words:[]};expect(recoverWordRange(broken,[old])).toMatchObject({startMs:100,endMs:600,text:broken.text});expect(recoverWordRange({...broken,text:'今日晴'},[old])).toBeUndefined();expect(recoverWordRange({...broken,text:'昨日晴れ'},[old])).toBeUndefined();});
