import {it,expect} from 'vitest';
import {VocabularyIndex} from '../src/shared/vocabularyIndex';
import {normalizeVocabulary,vocabularyTag,vocabularyColor,vocabularyError,type VocabularyLevel} from '../src/shared/vocabulary';
import {annotateVocabulary,vocabularyIndex} from '../src/main/vocabularyService';
import data from '../src/main/vocabulary-data.json';

it('最低等级优先，包括 N2 < 考研 < N1，顺序及重复不影响结果',()=>{
  const low=['N5','N4','N3','N2','KY','N1'] as VocabularyLevel[];
  low.forEach((level,i)=>expect(vocabularyTag([...low.slice(i).reverse(),level]).level).toBe(level));
  expect(vocabularyTag(['N1','KY']).level).toBe('KY');
  expect(vocabularyTag(['KY','N2']).level).toBe('N2');
});
it('筛选在最低等级确定后生效；不会把关闭的低级词重新标成高级',()=>{
  const settings={enabled:true,levels:['N1'] as VocabularyLevel[]};
  expect(vocabularyColor(vocabularyTag(['N5','N1']),settings)).toBe('other');
  expect(vocabularyColor(vocabularyTag(['N1']),settings)).toBe('N1');
  expect(vocabularyColor({levels:[]},settings)).toBe('other');
  expect(vocabularyColor(vocabularyTag(['N1']),{...settings,enabled:false})).toBeUndefined();
});
it('新旧设置默认关闭，允许全部取消选择，拒绝未知等级',()=>{
  expect(normalizeVocabulary().enabled).toBe(false);
  expect(normalizeVocabulary({enabled:true,levels:[]}).levels).toEqual([]);
  expect(vocabularyError({enabled:true,levels:['N0'] as any})).not.toBe('');
  expect(vocabularyError({enabled:true,levels:[]})).toBe('');
});
it('区分同形异音；全角拉丁和片假名读音可以归一化匹配',()=>{
  const idx=new VocabularyIndex([['生','なま',['N3']],['生','せい',['N2']],['ABC','えーびーしー',['KY']]]);
  expect(idx.find('生','ナマ')?.level).toBe('N3');expect(idx.find('生','セイ')?.level).toBe('N2');
  expect(idx.find('生')).toBeUndefined();expect(idx.find('生','しょう')).toBeUndefined();
  expect(idx.find('ＡＢＣ','エービーシー')?.level).toBe('KY');
});
it('活用尾部随词标色，旁边的助词保持独立；UTF16 位置保留表情与空白',()=>{
  const idx=new VocabularyIndex([['使う','つかう',['N5']],['道具','どうぐ',['N3']]]),text='🙂 使われている道具を\n';
  const spans=idx.annotate(text,[{surface_form:'使わ',basic_form:'使う',pos:'動詞'},{surface_form:'れ',pos:'動詞',pos_detail_1:'非自立'},{surface_form:'て',pos:'助詞',pos_detail_1:'接続助詞'},{surface_form:'いる',pos:'動詞',pos_detail_1:'非自立'},{surface_form:'道具',pos:'名詞'},{surface_form:'を',pos:'助詞'}]);
  expect(spans.map(s=>text.slice(s.start,s.end)).join('')).toBe(text);
  expect(spans.find(s=>s.word==='使う')).toMatchObject({start:3,end:9,level:'N5'});
  expect(spans.find(s=>text.slice(s.start,s.end)==='を')?.level).toBeUndefined();
});
it('词组整词优先，禁止在别的词内按子串着色',()=>{
  const idx=new VocabularyIndex([['取り組む','とりくむ',['N1']],['組む','くむ',['N2']],['会社','かいしゃ',['N5']]]);
  const text='取り組んだ会社員';
  const result=idx.annotate(text,[{surface_form:'取り',basic_form:'取る',pos:'動詞'},{surface_form:'組ん',basic_form:'組む',pos:'動詞'},{surface_form:'だ',pos:'助動詞'},{surface_form:'会社員',pos:'名詞'}]);
  expect(result[0]).toMatchObject({start:0,end:5,level:'N1',word:'取り組む'});
  expect(result[1].level).toBeUndefined();
});
it('分词与原文不一致时明确失败，不显示错位颜色',()=>{
  expect(()=>new VocabularyIndex([]).annotate('原文',[{surface_form:'改文'}])).toThrow('不一致');
});
it('公开源数据含五级和15章考研；漏号如实记录，未造条目',()=>{
  expect(data.sources.filter(s=>s.level==='KY')).toHaveLength(15);
  expect(data.sources.filter(s=>s.level==='KY').reduce((n,s)=>n+s.rows,0)).toBe(2235);
  expect(data.entries.length).toBeGreaterThan(8000);
  expect(vocabularyIndex().find('食べる','たべる')?.level).toBe('N5');
  expect(vocabularyIndex().find('試みる','こころみる')?.level).toBe('KY');
  expect(vocabularyIndex().find('騒がしい','さわがしい')?.level).toBe('N2');
});
it('批量接口有上限且热缓存不重复分词；失败不会存入成功缓存',async()=>{
  let count=0;const getTokenizer=async()=>({tokenize:(text:string)=>{count++;return [{surface_form:text,basic_form:'食べる'}];}});
  const texts=['食べたテスト'];await annotateVocabulary(texts,getTokenizer);await annotateVocabulary(texts,getTokenizer);expect(count).toBe(1);
  await expect(annotateVocabulary(['a'.repeat(24001)],getTokenizer)).rejects.toThrow('过长');
  await expect(annotateVocabulary(Array(17).fill('a'),getTokenizer)).rejects.toThrow('过长');
  await expect(annotateVocabulary(['初回失敗'],async()=>{throw Error('missing');})).rejects.toThrow('missing');
  expect(await annotateVocabulary(['初回失敗'],getTokenizer)).toHaveLength(1);
});
