const digits=['','いち','に','さん','よん','ご','ろく','なな','はち','きゅう'];
function smallNumber(v:number):string{
 if(v<10)return digits[v];
 if(v<100)return (v<20?'':digits[Math.floor(v/10)])+'じゅう'+smallNumber(v%10);
 if(v<1000){const d=Math.floor(v/100);return ({1:'ひゃく',3:'さんびゃく',6:'ろっぴゃく',8:'はっぴゃく'}[d]||digits[d]+'ひゃく')+smallNumber(v%100);}
 const d=Math.floor(v/1000);return ({1:'せん',3:'さんぜん',8:'はっせん'}[d]||digits[d]+'せん')+smallNumber(v%1000);
}
function readNumber(n:number):string{
 if(n===0)return 'ぜろ';
 let result='';
 for(const [unit,kana] of [[1e8,'おく'],[1e4,'まん']] as const){const amount=Math.floor(n/unit);if(amount){result+=smallNumber(amount)+kana;n%=unit;}}
 return result+smallNumber(n);
}
/** Parse ordered Japanese integer groups; reject decimals, fractions, malformed units and ambiguous dates. */
function parseInteger(value:string):number|undefined{
 if(/^(0|[1-9]\d*)$/.test(value))return Number(value);
 const canonical=value.replace(/[〇零一二三四五六七八九]/g,c=>String('〇一二三四五六七八九'.indexOf(c==='零'?'〇':c)));
 if(/^\d+$/.test(canonical))return /^(0|[1-9]\d*)$/.test(canonical)?Number(canonical):undefined;
 if(!/^[0-9十百千万億]+$/.test(canonical))return;
 let total=0,group=0,lastSmall=10000,lastBig=Infinity,pending='';
 for(const c of canonical){
  if(/\d/.test(c)){pending+=c;continue;}
  const unit=({十:10,百:100,千:1000,万:10000,億:1e8} as Record<string,number>)[c];
  const amount=pending?Number(pending):1;
  if(pending&&(!/^[1-9]\d*$/.test(pending)))return;
  if(unit<10000){if(unit>=lastSmall||amount>9)return;group+=amount*unit;lastSmall=unit;}
  else{const chunk=group+(pending?amount:0);if(unit>=lastBig||chunk<1||chunk>9999)return;total+=chunk*unit;group=0;lastSmall=10000;lastBig=unit;}
  pending='';
 }
 const tail=pending?Number(pending):0;if(tail>=lastSmall)return;
 return total+group+tail;
}
export function currencyReading(query:string):string|undefined{
 let text=query.normalize('NFKC').trim();
 if(!text.endsWith('円'))return;
 text=text.slice(0,-1);
 if(text.includes(',')){if(!/^[1-9]\d{0,2}(,\d{3})+$/.test(text))return;text=text.replaceAll(',','');}
 const n=parseInteger(text);
 if(n===undefined||!Number.isSafeInteger(n)||n<0||n>=1e12)return;
 return readNumber(n)+'えん';
}
