import {currencyReading} from './numericReading';
/** Preserve text nodes while extracting senses rather than examples/ruby/attribution. */
export const kanaReading=(value:string)=>/^[ぁ-ゖァ-ヺー・\s]+$/u.test(value) ? value.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)) : '';
/** Restricted, unambiguous counters. Never infer readings for names, dates or arbitrary kanji. */
export function counterReading(query:string):string|undefined {
 const currency=currencyReading(query);if(currency)return currency;
 const match=/^([1-9]\d{0,3})(週間|週|か月|ヶ月|年)$/.exec(query.normalize('NFKC'));
 if(!match)return;
 const n=Number(match[1]),counter=match[2],digits=['','いち','に','さん','よん','ご','ろく','なな','はち','きゅう'];
 const number=(v:number):string=>{
  if(v<10)return digits[v];
  if(v<100)return (v<20?'':digits[Math.floor(v/10)])+'じゅう'+number(v%10);
  if(v<1000){const d=Math.floor(v/100);return ({1:'ひゃく',3:'さんびゃく',6:'ろっぴゃく',8:'はっぴゃく'}[d]||digits[d]+'ひゃく')+number(v%100);}
  const d=Math.floor(v/1000);return ({1:'せん',3:'さんぜん',8:'はっせん'}[d]||digits[d]+'せん')+number(v%1000);
 };
 let reading=number(n);
 if(counter==='年')return reading.replace(/よん$/,'よ')+'ねん';
 if(counter==='週'||counter==='週間')return reading.replace(/いち$/,'いっ').replace(/はち$/,'はっ').replace(/じゅう$/,'じゅっ')+(counter==='週'?'しゅう':'しゅうかん');
 return reading.replace(/いち$/,'いっ').replace(/ろく$/,'ろっ').replace(/はち$/,'はっ').replace(/じゅう$/,'じゅっ')+'かげつ';
}
/** Bounded candidates, always validated against actual dictionary entries. */
export function dictionaryForms(query:string,tokens:any[]=[]):string[]{
 const forms=new Set<string>([query]);
 if(tokens.length&&tokens[0].basic_form!=='*'&&tokens[0].basic_form&&tokens.slice(1).every(t=>['助動詞','助詞'].includes(t.pos)||(t.pos==='動詞'&&t.pos_detail_1==='非自立')))forms.add(tokens[0].basic_form);
 const rules:[RegExp,string[]][]=[
  [/ませんでした$/,['る']],[/ません$/,['る']],[/ました$/,['る']],[/ます$/,['る']],
  [/ている$/,['る','て']],[/ていた$/,['る','て']],[/でいる$/,['で']],[/でいた$/,['で']],[/ちゃった$/,['てしまった']],[/ちゃう$/,['てしまう']],[/じゃった$/,['でしまった']],
  [/かった$/,['い']],[/くない$/,['い']],[/くなかった$/,['い']],
  [/なかった$/,['ない']],[/ない$/,['る']],[/なくて$/,['ない']],
  [/させられる$/,['る']],[/させる$/,['る']],[/られる$/,['る']],[/れる$/,['る']],
  [/った$/,['う','つ','る']],[/って$/,['う','つ','る']],[/んだ$/,['む','ぶ','ぬ']],[/んで$/,['む','ぶ','ぬ']],
  [/いた$/,['く']],[/いて$/,['く']],[/いだ$/,['ぐ']],[/いで$/,['ぐ']],[/した$/,['す','する']],[/して$/,['す','する']],
  [/た$/,['る']],[/て$/,['る']],
 ];
 const a='わかがさたなばまら',u='うくぐすつぬぶむる',i='いきぎしちにびみり',e='えけげせてねべめれ';
 for(let depth=0,front=[...forms];depth<4&&forms.size<96;depth++){
  const next:string[]=[];const add=(s:string)=>{if(s.length>=1&&s!==query&&!forms.has(s)&&forms.size<96){forms.add(s);next.push(s);}};
  for(const word of front){for(const [pattern,replacements] of rules)if(pattern.test(word))for(const r of replacements)add(word.replace(pattern,r));
   for(let n=0;n<a.length;n++){
    for(const ending of ['ない','なかった','れる','せる','せられる'])if(word.endsWith(a[n]+ending))add(word.slice(0,-ending.length-1)+u[n]);
    for(const ending of ['ます','ました','ません','ませんでした'])if(word.endsWith(i[n]+ending))add(word.slice(0,-ending.length-1)+u[n]);
    if(word.endsWith(e[n]+'る'))add(word.slice(0,-2)+u[n]);
   }
   if(word==='行った'||word==='行って')add('行く');
   if(word.startsWith('こ')&&/^(こない|こなかった|こられる)$/.test(word))add('くる');
  }front=next;
 }
 return [...forms];
}
export function plainText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(plainText).join('');
  if (value && typeof value === 'object') { const v=value as any; if (v.tag==='rt' || v.tag==='rp') return ''; return plainText(v.content ?? v.text ?? ''); }
  return '';
}
export function glosses(value: unknown): string[] {
  const found:string[]=[];
  const walk=(v:any)=>{ if(!v||typeof v!=='object')return; if(Array.isArray(v)){v.forEach(walk);return;} if(v.data?.content==='glossary'){const children=Array.isArray(v.content)?v.content:[v.content]; for(const c of children){const text=plainText(c).trim();if(text)found.push(text);}return;} walk(v.content); };
  walk(value);
  if(found.length)return [...new Set(found)];
  const list=Array.isArray(value)?value:[value];
  return [...new Set(list.map(plainText).map(s=>s.trim()).filter(Boolean))];
}
