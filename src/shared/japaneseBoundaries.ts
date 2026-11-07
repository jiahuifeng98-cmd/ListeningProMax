import type { Morph } from './segmentation';

const finite=(t:Morph|undefined)=>!!t&&['動詞','形容詞','助動詞'].includes(t.pos)&&['基本形','終止形'].includes(t.conjugated_form);
const particles=/^(?:よ|ね|な|なあ|なぁ|ぞ|ぜ|わ|さ|か|かな|かしら)$/;
const quoteVerb=/^(?:と|って|という|と言う|との|そう(?:言|聞)|聞|言|思|考|書|伝|教|決|読)/;

/** Conservative conversational boundaries, not speaker identification. */
export function conversationalBoundary(tokens:Morph[],i:number,previous:string,next:string,pause:number):boolean{
 const t=tokens[i];const before=tokens.slice(0,i).filter(t=>t.surface_form.trim());
 const following=tokens.slice(i+1).find(t=>t.surface_form.trim());
 if(!following||/^[。！？!?、，,」』）)]/.test(next))return false;
 // Sentence-final particles attach to a predicate, not fillers such as 今ね / これはね.
 if(particles.test(t.surface_form)&&!particles.test(following.surface_form)){
  while(before.length&&particles.test(before.at(-1)!.surface_form))before.pop();
  const base=before.at(-1),negativeRequest=/(?:ないで|なくて)(?:よ|ね)$/.test(previous);
  const question=t.surface_form==='か'||t.surface_form==='かな'||t.surface_form==='かしら';
  const dependent=['助詞','助動詞'].includes(following.pos)||['非自立','接尾'].includes(following.pos_detail_1);
  const questionTurn=following.pos==='感動詞'||/^(?:(?:私|僕|俺|あなた|君)(?:は|も)|では|じゃあ|それでは|でも|次は|どうした)/.test(next);
  if((finite(base)||negativeRequest)&&!dependent&&!quoteVerb.test(next)&&(!question||questionTurn)&&!(question&&/^(?:どうか|もしれ|否か)/.test(next)))return true;
 }
 // Plain-form questions/statements followed by an independent response.
 if(finite(t)&&following.pos==='感動詞'&&/^(?:うん|ううん|はい|いいえ|ああ|へえ|へー|ええ|そうか)/.test(next))return true;
 if(/(?:でしょ|でしょー)$/.test(previous)&&following.pos==='感動詞')return true;
 if(/(?:んだ|のだ)$/.test(previous)&&!quoteVerb.test(next)&&!['助詞','助動詞','記号'].includes(following.pos)&&!['非自立','接尾'].includes(following.pos_detail_1))return true;
 // Hearsay at the end of an utterance; do not split reported speech before 言った etc.
 if(/(?:んだって|なんだって|なんですって|んですって)$/.test(previous)&&!quoteVerb.test(next)){
  if(following.pos==='感動詞'||/^(?:私|僕|俺|あなた|それ|じゃあ|では|でも)/.test(next)||pause>=300)return true;
 }
 // A trailing connective can close a turn before a new discourse/question.
 if(/(?:けど|けれど|けれども)$/.test(previous)&&/^(?:それに|ところで|さて|それでは|じゃあ)/.test(next))return true;
 if(/(?:だろうし|でしょうし)$/.test(previous)&&pause>=400&&/^(?:どう|何|どれ|誰)/.test(next))return true;
 // Explicit interruption: preserve the unfinished utterance rather than invent words.
 if(t.surface_form==='て'&&pause>=200&&/^(?:ちょっとそんな|いや[、，,]?違|あっ[、，,]?待)/.test(next))return true;
 return false;
}

/** Repair only a demonstrably unfinished inflection crossing a legacy window stop. */
export function brokenInflection(left:string,right:string,tokenize:(s:string)=>Morph[]):boolean{
 if(!/。\s*$/.test(left)||!/^\s*[\p{Script=Han}ぁ-ん]/u.test(right))return false;
 const stem=left.replace(/。\s*$/,'').slice(-32),tail=right.slice(0,24);
 const last=tokenize(stem).filter(t=>t.surface_form.trim()).at(-1);
 if(!last||finite(last)||!/[\p{Script=Han}ぁ-ん]$/u.test(stem))return false;
 let offset=0;
 for(const t of tokenize(stem+tail)){
  const start=offset;offset+=t.surface_form.length;
  if(start<stem.length&&offset>stem.length)return ['動詞','形容詞'].includes(t.pos)&&t.surface_form.length>=2;
 }
 return false;
}
