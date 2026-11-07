import {VocabularyIndex} from '../shared/vocabularyIndex';
import type {VocabularyLevel,VocabularySpan} from '../shared/vocabulary';
import data from './vocabulary-data.json';

let index:VocabularyIndex|undefined;
export function vocabularyIndex(){return index ||= new VocabularyIndex(data.entries as [string,string,VocabularyLevel[]][]);}
const cache=new Map<string,VocabularySpan[]>();
export async function annotateVocabulary(texts:unknown,getTokenizer:()=>Promise<any>){
  if(!Array.isArray(texts)||texts.length>16||texts.some(t=>typeof t!=='string')||texts.reduce((sum,t)=>sum+t.length,0)>24000)throw Error('单次词汇标注文本过长，请缩短句子后重试。');
  if(!texts.length)return [];
  const tokenizer=await getTokenizer();
  return texts.map((text:string)=>{
    let result=cache.get(text);if(result)return result;
    result=vocabularyIndex().annotate(text,tokenizer.tokenize(text));
    cache.set(text,result);if(cache.size>2000)cache.delete(cache.keys().next().value!);
    return result;
  });
}
