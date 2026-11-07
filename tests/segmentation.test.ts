import {beforeAll,describe,it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';import {createRequire} from 'node:module';
import kuromoji from 'kuromoji';import {segmentSentences} from '../src/shared/segmentation';
import {textContent,validateTimeline} from '../src/shared/timeline';import type {Sentence} from '../src/shared/types';
const dicPath=path.join(path.dirname(createRequire(import.meta.url).resolve('kuromoji/package.json')),'dict');
let tokenizer:any;beforeAll(async()=>{tokenizer=await new Promise((resolve,reject)=>kuromoji.builder({dicPath}).build((e,t)=>e?reject(e):resolve(t)));},30000);
let seq=0;const cut=(items:Sentence[])=>segmentSentences(items,t=>tokenizer.tokenize(t),()=>`new-${++seq}`);
function sentence(text:string,offset=0,id='a'):Sentence{
 let time=offset;const words=[...text].filter(c=>textContent(c)).map(c=>({text:c,startMs:time,endMs:time+=100}));
 return {id,text,startMs:offset,endMs:time,words,issues:[]};
}
describe('Japanese sentence boundaries use morphology, not ASR window length',()=>{
 it.each([
  ['今日は晴れです明日も晴れです',['今日は晴れです。','明日も晴れです。']],
  ['行きますが雨ならやめます',['行きますが雨ならやめます。']],
  ['行きましたから安心してください',['行きましたから安心してください。']],
  ['先生は行きますと言いました',['先生は行きますと言いました。']],
  ['行きますか明日も行きます',['行きますか。','明日も行きます。']],
  ['まだ終わりません明日終わります',['まだ終わりません。','明日終わります。']],
  ['彼は「行きます」と言いました私は残ります',['彼は「行きます」と言いました。','私は残ります。']],
  ['今日はいい天気ですね一緒に歩きましょう',['今日はいい天気ですね。','一緒に歩きましょう。']],
  ['3.14は円周率です値段は1,000円です',['3.14は円周率です。','値段は1,000円です。']],
  ['行きますので待ってください',['行きますので待ってください。']],
  ['行きますかどうかはまだ決めていません',['行きますかどうかはまだ決めていません。']],
  ['ありますけれど今は使えません',['ありますけれど今は使えません。']],
 ])('%s',(text,expected)=>expect(cut([sentence(text)]).map(s=>s.text)).toEqual(expected));
 it('joins a compound across a generated window stop',()=>{
  const a=sentence('根気強く取り',0,'a');a.text+='。';a.issues=['句末标点按语音分段补全，请复核'];
  const b=sentence('組んでいきたいと思います。',a.endMs!+100,'b');
  const result=cut([a,b]);expect(result.map(s=>s.text)).toEqual(['根気強く取り組んでいきたいと思います。']);
  expect(result[0].startMs).toBe(a.startMs);expect(result[0].endMs).toBe(b.endMs);
 });
 it('splits screenshot paragraph while preserving every character',()=>{
  const text='私は子供の頃からリーダーを支える役割を果たしてきました周囲の声に耳を傾けることには自信があります反面受け身になるのでその点に気をつけ取り組んでいきたいと思います';
  const old=sentence(text);const result=cut([old]);expect(result).toHaveLength(3);expect(textContent(result.map(s=>s.text).join(''))).toBe(text);
  validateTimeline(result,old.endMs!);expect(result[0].startMs).toBe(old.startMs);expect(result.at(-1)!.endMs).toBe(old.endMs);
 });
 it('never splits within a timestamped word even at a grammatical ending',()=>{
  const s=sentence('今日は晴れです明日も晴れです');s.words=[{text:s.text,startMs:0,endMs:5000}];s.endMs=5000;expect(cut([s])).toHaveLength(1);
 });
 it('leaves anchors and unaligned edited text untouched',()=>{
  const s={...sentence('晴れです明日も晴れです'),anchor:true};expect(cut([s])).toEqual([s]);s.anchor=false;s.words=[];expect(cut([s])).toEqual([s]);
 });
 it('keeps a natural period and text symbols',()=>{
  const s=sentence('温度+1です。A=2です。');const result=cut([s]);expect(textContent(result.map(s=>s.text).join(''))).toBe(textContent(s.text));expect(result).toHaveLength(2);
 });
 it('does not invent times for an all-zero segment',()=>{
  const s=sentence('今日は晴れです明日も晴れです');s.words.forEach(w=>w.endMs=w.startMs=0);expect(cut([s])).toEqual([s]);
 });
 it('retains punctuation-only word records and their absolute times',()=>{
  const s=sentence('番号は5-12です。次は7です。');
  s.words.splice(4,0,{text:'-',startMs:400,endMs:400});
  expect(cut([s]).flatMap(s=>s.words)).toEqual(s.words);
 });
 it.each([
  ['今日は休みなんだってああ知らなかった',['今日は休みなんだって。','ああ知らなかった。']],
  ['もう予約したんだって私はまだだよ',['もう予約したんだって。','私はまだだよ。']],
  ['最近注目されてるよね私はまだ知らない',['最近注目されてるよね。','私はまだ知らない。']],
  ['どの電車に乗るんだろうね私は急行がいいな',['どの電車に乗るんだろうね。','私は急行がいいな。']],
  ['個人的には大歓迎だなそうじゃあ予約しよう',['個人的には大歓迎だな。','そうじゃあ予約しよう。']],
  ['これは高いと思うけどそれに送料もかかる',['これは高いと思うけど。','それに送料もかかる。']],
  ['そろそろ帰ろうか私はまだ残るよ',['そろそろ帰ろうか。','私はまだ残るよ。']],
  ['それは困るな明日まで待ってよ',['それは困るな。','明日まで待ってよ。']],
  ['もう提出したよ先生にも確認した',['もう提出したよ。','先生にも確認した。']],
  ['ちょっとそんな期待しないでよ私はまだ新人なんだから',['ちょっとそんな期待しないでよ。','私はまだ新人なんだから。']],
  ['先生は来るんだって言っていた',['先生は来るんだって言っていた。']],
  ['来るよねと聞かれた',['来るよねと聞かれた。']],
  ['何を選ぶかはまだ決めていない',['何を選ぶかはまだ決めていない。']],
  ['参加できるかなと思っている',['参加できるかなと思っている。']],
  ['今日はね午後から会議がある',['今日はね午後から会議がある。']],
  ['今ね資料を調べている',['今ね資料を調べている。']],
  ['これはね昨日買った本だ',['これはね昨日買った本だ。']],
  ['来週なんだって聞いたけど本当かな',['来週なんだって聞いたけど本当かな。']],
  ['忙しいけど午後なら手伝える',['忙しいけど午後なら手伝える。']],
  ['雨も降っているし風も強いから帰ろう',['雨も降っているし風も強いから帰ろう。']],
  ['これは便利だなと思った',['これは便利だなと思った。']],
  ['予約したかどうか確認してください',['予約したかどうか確認してください。']],
  ['いいかもしれないけどまだわからない',['いいかもしれないけどまだわからない。']],
  ['これは高いよねという話になった',['これは高いよねという話になった。']],
  ['月に一回利用するかしないかだしじゃあこれでお願いします',['月に一回利用するかしないかだしじゃあこれでお願いします。']],
  ['どっちにするか迷うけど留学に備えられる方にする',['どっちにするか迷うけど留学に備えられる方にする。']],
  ['何時に集合するか連絡してください',['何時に集合するか連絡してください。']],
  ['いつ来るか母に聞いてください',['いつ来るか母に聞いてください。']],
  ['本当に行くかどうかはまだわからない',['本当に行くかどうかはまだわからない。']],
  ['参加するかしないかを決めてください',['参加するかしないかを決めてください。']],
  ['これでいいかなと考えていた',['これでいいかなと考えていた。']],
  ['安いでしょへえいいものを見つけたね',['安いでしょ。','へえいいものを見つけたね。']],
  ['資料を読んでくれたうん内容はわかった',['資料を読んでくれた。','うん内容はわかった。']],
  ['それでいいんじゃないああなるほど',['それでいいんじゃない。','ああなるほど。']],
  ['変更せざるを得ないよねただし予算は増やせない',['変更せざるを得ないよね。','ただし予算は増やせない。']],
  ['企画そのものを否定するわけじゃないんだよね私もそう思う',['企画そのものを否定するわけじゃないんだよね。','私もそう思う。']],
  ['引き受けた以上最後までやるしかないよ僕も手伝う',['引き受けた以上最後までやるしかないよ。','僕も手伝う。']],
  ['時間さえあればできるんだ資料はもう揃っている',['時間さえあればできるんだ。','資料はもう揃っている。']],
  ['来るんだと思って待っていた',['来るんだと思って待っていた。']],
  ['遅れるんだもの仕方がない',['遅れるんだもの仕方がない。']],
  ['負担が増えるとはいえ今さら変更するわけにもいかない',['負担が増えるとはいえ今さら変更するわけにもいかない。']],
  ['その条件なら引き受けてもいいのではないかと考えている',['その条件なら引き受けてもいいのではないかと考えている。']],
 ])('JLPT conversational fixture: %s',(text,expected)=>expect(cut([sentence(text)]).map(s=>s.text)).toEqual(expected));
 it('repairs the legacy 思。うけど split without stripping complete natural sentences',()=>{
  const a=sentence('どうかと思',0,'a');a.text+='。';const b=sentence('うけどそれに費用もかかる。',a.endMs!,'b');
  expect(cut([a,b]).map(s=>s.text)).toEqual(['どうかと思うけど。','それに費用もかかる。']);
  a.endOrigin='manual';expect(cut([a,b])[0].text).toBe('どうかと思。');
  const c=sentence('明日は行く。',0,'c'),d=sentence('うん私は待つ。',c.endMs!,'d');expect(cut([c,d])).toHaveLength(2);
 });
 it('keeps segmentation and IDs stable on a repeated pass',()=>{
  const initial=cut([sentence('最近注目されてるよね私はどうかと思うけどそれに費用もかかる')]);
  expect(cut(initial)).toEqual(initial);
 });
 it('repairs a legacy compound even after old diagnostic tags were cleared',()=>{
  const a=sentence('根気強く取り',0,'a');a.text+='。';const b=sentence('組んでいきたいと思います。',a.endMs!,'b');
  expect(cut([a,b]).map(s=>s.text)).toEqual(['根気強く取り組んでいきたいと思います。']);
 });
 // Local private fixture is deliberately not distributed in the public repository.
 it.skipIf(!fs.existsSync('tests/fixtures/jlpt-n2-dialogue.json'))('segments the actual 2017-12 N2 screenshot without losing aligned records',()=>{
  const original=JSON.parse(fs.readFileSync('tests/fixtures/jlpt-n2-dialogue.json','utf8')) as Sentence[];
  const result=cut(original);
  expect(result).toHaveLength(8);
  ['んだって。','よね。','思うけど。','だろうし。','んだろうね。','大歓迎だな。','上がって。','期待しないでよ。'].forEach((end,i)=>expect(result[i].text.endsWith(end)).toBe(true));
  expect(result.flatMap(s=>s.words)).toEqual(original.flatMap(s=>s.words));
  expect(textContent(result.map(s=>s.text).join(''))).toBe(textContent(original.map(s=>s.text).join('')));
  validateTimeline(result,1160000);expect(cut(result)).toEqual(result);
 });
});
