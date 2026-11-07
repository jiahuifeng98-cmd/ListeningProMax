import type { Sentence, Word } from './types';
import { textContent } from './timeline';
import { conversationalBoundary,brokenInflection } from './japaneseBoundaries';
export interface Morph { surface_form:string; pos:string; pos_detail_1:string; conjugated_form:string; basic_form:string }
type Tokenize=(text:string)=>Morph[];
const stop=/[。！？!?]/;
const polite=/(?:ます|ました|ません|ませんでした|です|でした|でしょう|ましょう|ください)(?:よね|ね|よ|かね|か|なあ)?$/;
const continuation=/^(?:から|ので|けれど|けど|けれども|が|し|と|って|なら|のに|のを|のは|のか|かも|かどうか|こと|もの|よう|ため|ところ|はず|わけ|ほど|まで)/;
/** Boundaries are token ends backed by real word times, never a duration cap. */
export function segmentSentences(items:Sentence[],tokenize:Tokenize,newId:()=>string):Sentence[]{
 const output:Sentence[]=[];let group:Sentence[]=[];
 function flush(){
  if(!group.length)return;
  let text='';const positions:{word:Word;owner:Sentence}[]=[];const alignedWords:Word[]=[];
  for(let si=0;si<group.length;si++){
   const s=group[si],next=group[si+1];
   // Remove only the sentence-final stop known to have been inserted by v1.1.
   const generated=s.endOrigin==='auto'||s.issues.some(i=>i.includes('句末标点按语音分段补全'));
   const broken=next&&s.endOrigin!=='manual'&&!/[。！？!?]\s*$/.test(s.words.at(-1)?.text||'')&&next.startMs!-s.endMs!<400&&brokenInflection(s.text,next.text,tokenize);
   text+=generated||broken?s.text.replace(/。\s*$/,''):s.text;
   for(const word of s.words){alignedWords.push(word);for(let i=0;i<textContent(word.text).length;i++)positions.push({word,owner:s});}
  }
  if(!positions.length||textContent(text).length!==positions.length){output.push(...group);group=[];return;}
  const tokens=tokenize(text);let cursor=0,contentOffset=0,quoteDepth=0;const cuts:number[]=[];
  for(let i=0;i<tokens.length;i++){
   const token=tokens[i],at=text.indexOf(token.surface_form,cursor);if(at<0)throw Error('分词偏移不匹配');
   contentOffset+=textContent(text.slice(cursor,at+token.surface_form.length)).length;cursor=at+token.surface_form.length;
   const surface=token.surface_form;
   for(const c of surface){if('「『（('.includes(c))quoteDepth++;if('」』）)'.includes(c))quoteDepth=Math.max(0,quoteDepth-1);}
   const next=text.slice(cursor).trimStart();const previous=text.slice(0,cursor).trimEnd();
   const left=positions[contentOffset-1]?.word,right=positions[contentOffset]?.word;
   if(!left||!right||left===right||quoteDepth)continue;
   const pause=right.startMs-left.endMs;
   const suffix=tokens.slice(i+1).find(t=>t.surface_form.trim());
   const explicit=stop.test(surface)||(/[」』）)]$/.test(surface)&&/[。！？!?][」』）)]$/.test(previous));
   const connective=continuation.test(next)||(/か$/.test(previous)&&/^どうか/.test(next))||['接続助詞','格助詞','係助詞','連体化'].includes(suffix?.pos_detail_1||'');
   const politeEnd=polite.test(previous)&&!connective&&!/^(?:ね|よ|か|な|ん)/.test(next);
   const plainEnd=(token.conjugated_form==='基本形'&&['動詞','形容詞','助動詞'].includes(token.pos))||token.pos_detail_1==='終助詞';
   const nextDependent=suffix?.pos==='助詞'||suffix?.pos==='助動詞'||suffix?.pos==='名詞'||suffix?.pos==='接尾';
   // Plain endings require a pause and no dependent following constituent.
   if(explicit||politeEnd||conversationalBoundary(tokens,i,previous,next,pause)||(pause>=450&&plainEnd&&!connective&&!nextDependent))cuts.push(cursor);
  }
  cuts.push(text.length);let from=0,offset=0,wordOffset=0;const used=new Set<string>();const generated:Sentence[]=[];
  for(const cut of [...new Set(cuts)]){
   let part=text.slice(from,cut).trim();from=cut;const length=textContent(part).length;if(!length)continue;
   const range=positions.slice(offset,offset+length);offset+=length;
   let wordEnd=alignedWords.indexOf(range.at(-1)!.word,wordOffset)+1;
   while(wordEnd<alignedWords.length&&!textContent(alignedWords[wordEnd].text))wordEnd++;
   const words=alignedWords.slice(wordOffset,wordEnd);wordOffset=wordEnd;
   if(!words.length)continue;
   const startMs=words[0].startMs,endMs=words.at(-1)!.endMs;
   // Do not invent 1 ms durations for zero-duration words.
   if(endMs<=startMs){output.push(...group);group=[];return;}
   const autoEnd=!/[。！？!?][」』）)]?$/.test(part);if(autoEnd)part+='。';
   const owner=range[0].owner;const id=used.has(owner.id)?newId():owner.id;used.add(id);
   const issues=[...new Set(range.flatMap(p=>p.owner.issues).filter(i=>!i.includes('句末标点按语音分段补全')))];
   const exact=group.find(s=>s.text===part&&s.startMs===startMs&&s.endMs===endMs);
   generated.push({id,text:part,startMs,endMs,words,issues,...(autoEnd?{endOrigin:'auto' as const}:exact?.endOrigin?{endOrigin:exact.endOrigin}:{}),...(exact?.translation?{translation:exact.translation,translationSource:exact.translationSource}:{})});
  }
  output.push(...generated);group=[];
 }
 for(const s of items){
  const reliable=s.words.length&&textContent(s.text)===textContent(s.words.map(w=>w.text).join(''))&&s.startMs!=null&&s.endMs!=null;
  if(s.anchor||!reliable){flush();output.push(structuredClone(s));continue;}
  const previous=group.at(-1);
  // Long silences and manual anchors separate contexts, not arbitrary 28 s limits.
  if(previous&&s.startMs!-previous.endMs!>1800)flush();
  group.push(s);
 }
 flush();
 if(textContent(items.map(s=>s.text).join(''))!==textContent(output.map(s=>s.text).join('')))throw Error('断句改变字词，已拒绝结果');
 return output;
}
