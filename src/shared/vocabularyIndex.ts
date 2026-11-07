import {vocabularyTag,type VocabularyLevel,type VocabularySpan,type VocabularyTag} from './vocabulary';

export interface MorphToken {surface_form:string;basic_form?:string;reading?:string;pos?:string;pos_detail_1?:string}
const normalize=(value:string)=>value.normalize('NFKC');
const kana=(value:string)=>normalize(value).replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
export class VocabularyIndex {
  private words=new Map<string,Map<string,VocabularyLevel[]>>();
  constructor(rows:readonly (readonly [string,string,readonly VocabularyLevel[]])[]){
    for(const [word,reading,levels] of rows){
      const key=normalize(word),entries=this.words.get(key)||new Map<string,VocabularyLevel[]>();
      const r=kana(reading);entries.set(r,vocabularyTag([...(entries.get(r)||[]),...levels]).levels);this.words.set(key,entries);
    }
  }
  find(word:string,reading=''):VocabularyTag|undefined {
    const entries=this.words.get(normalize(word));if(!entries)return;
    if(reading){const exact=entries.get(kana(reading));if(exact)return vocabularyTag(exact);}
    if(entries.size===1)return vocabularyTag([...entries.values()][0]);
    // Do not mix homographs with different readings/levels. An unknown reading
    // is safe only when all entries have the identical classification.
    const values=[...entries.values()];
    if(values.every(v=>JSON.stringify(v)===JSON.stringify(values[0])))return vocabularyTag(values[0]);
    return;
  }
  annotate(text:string,tokens:readonly MorphToken[]):VocabularySpan[]{
    const placed:{token:MorphToken;start:number;end:number}[]=[];let cursor=0;
    for(const token of tokens){
      if(!token.surface_form)continue;
      const start=text.indexOf(token.surface_form,cursor);
      if(start<0)throw Error('分词结果与原文不一致');
      placed.push({token,start,end:start+token.surface_form.length});cursor=start+token.surface_form.length;
    }
    const spans:VocabularySpan[]=[];cursor=0;
    for(let i=0;i<placed.length;){
      const first=placed[i];if(first.start>cursor)spans.push({start:cursor,end:first.start,levels:[]});
      let endIndex=i,word=first.token.basic_form&&first.token.basic_form!=='*'?first.token.basic_form:first.token.surface_form;
      let tag=this.find(word,first.token.reading)||this.find(first.token.surface_form,first.token.reading);
      // Longest whole-token compound wins, never a substring inside another word.
      for(let j=i+1;j<Math.min(placed.length,i+6);j++){
        if(placed[j-1].end!==placed[j].start||placed[j].token.pos==='記号')break;
        const surface=text.slice(first.start,placed[j].end),reading=placed.slice(i,j+1).map(t=>t.token.reading||'').join('');
        const exact=this.find(surface,reading);
        const last=placed[j].token.basic_form;
        const lemma=last&&last!=='*'?text.slice(first.start,placed[j].start)+last:surface;
        const compound=exact||this.find(lemma,reading);
        if(compound){tag=compound;word=exact?surface:lemma;endIndex=j;}
      }
      // Include ordinary conjugation tails (食べました / 使われて), without
      // colouring neighbouring particles/nouns as part of the lexical word.
      if(tag&&['動詞','形容詞'].includes(placed[endIndex].token.pos||'')){
        const tailLimit=Math.min(placed.length,endIndex+6);
        for(let j=endIndex+1;j<tailLimit;j++){
          const t=placed[j].token;
          if(placed[j-1].end!==placed[j].start)break;
          if(t.pos==='助動詞'||(t.pos==='動詞'&&t.pos_detail_1==='非自立')||(t.pos==='助詞'&&t.pos_detail_1==='接続助詞'&&/^[てで]$/.test(t.surface_form)))endIndex=j;else break;
        }
      }
      cursor=placed[endIndex].end;spans.push({start:first.start,end:cursor,...(tag||{levels:[]}),word:tag?word:undefined});i=endIndex+1;
    }
    if(cursor<text.length)spans.push({start:cursor,end:text.length,levels:[]});
    return spans;
  }
}
