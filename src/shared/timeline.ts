import type { Sentence, Edit } from './types';
export function formatTime(ms: number | null): string {
  if (ms == null) return '';
  const value = Math.max(0, Math.round(ms));
  return `${Math.floor(value / 3600000).toString().padStart(2, '0')}:${Math.floor(value / 60000) % 60}`.replace(/:(\d)$/, ':0$1') + `:${(Math.floor(value / 1000) % 60).toString().padStart(2, '0')}.${(value % 1000).toString().padStart(3, '0')}`;
}
export function parseTime(text: string): number | null {
  if (!text.trim()) return null;
  const m = /^(\d{1,3}):([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(text.trim());
  if (!m) throw Error('时间格式应为 时:分:秒.毫秒，例如 00:01:23.450');
  return +m[1] * 3600000 + +m[2] * 60000 + +m[3] * 1000 + +m[4];
}
export const textContent = (text: string) => text.replace(/[\p{P}\p{Z}\s]/gu, '');
export function assertSameText(before: string, after: string) { if (textContent(before) !== textContent(after)) throw Error('整理结果改变了原文字词，已保留原稿。'); }
export function recoverWordRange(sentence:Sentence,history:Sentence[]):Sentence|undefined {
  const wanted=textContent(sentence.text);if(!wanted)return;
  for(const old of history){if(old.id!==sentence.id||!old.words.length)continue;let joined='';const starts=new Map<number,number>(),ends=new Map<number,number>();
    old.words.forEach((w,i)=>{starts.set(joined.length,i);joined+=textContent(w.text);ends.set(joined.length,i+1);});
    const offset=joined.indexOf(wanted);if(offset<0||joined.indexOf(wanted,offset+1)>=0)continue;
    const first=starts.get(offset),last=ends.get(offset+wanted.length);if(first===undefined||last===undefined)continue;
    const words=old.words.slice(first,last);if(!words.length||words[0].startMs>=words.at(-1)!.endMs)continue;
    return {...sentence,startMs:words[0].startMs,endMs:words.at(-1)!.endMs,words,issues:sentence.issues.filter(i=>!i.includes('拆分后待校准')),anchor:false};
  }
}
export function validateTimeline(items: Sentence[], durationMs = 0) {
  const ids = new Set<string>(); let previous = -1;
  for (const s of items) {
    if (!s.id || ids.has(s.id)) throw Error('句子 ID 重复'); ids.add(s.id);
    if ((s.startMs == null) !== (s.endMs == null)) throw Error('起止时间需要同时填写或同时留空');
    if (s.startMs != null && s.endMs != null) {
      if (![s.startMs, s.endMs].every(Number.isSafeInteger) || s.startMs < 0 || s.endMs <= s.startMs) throw Error('结束时间必须晚于开始时间');
      if (durationMs > 0 && s.endMs > durationMs + 50) throw Error('句子超出音频时长');
      if (s.startMs < previous) throw Error('句子开始时间不能早于上一句'); previous = s.startMs;
    }
  }
}
export function activeIndex(items: Sentence[], ms: number): number {
  let found = -1;
  for (let i = 0; i < items.length; i++) if (items[i].startMs != null && items[i].startMs! <= ms) found = i;
  return found;
}
export function targetAt(items: Sentence[], ms: number): number {
  const found = activeIndex(items, ms);
  return found >= 0 ? found : items.findIndex(s => s.startMs != null);
}
export function editTimeline(items: Sentence[], edit: Edit, newId: () => string): { sentences: Sentence[]; aliases: Record<string, string>; realignFrom?: string } {
  const sentences = structuredClone(items); const aliases: Record<string, string> = {};
  if (edit.kind === 'undo' || edit.kind === 'reset') throw Error('History operation');
  const i = sentences.findIndex(s => s.id === edit.id); if (i < 0) throw Error('句子已被修改，请刷新');
  const s = sentences[i]; let realignFrom: string | undefined;
  if (edit.kind === 'text') {
    const changed = edit.text !== s.text;
    if (!edit.text.trim()) throw Error('句子不能为空');
    if (changed) { s.text = edit.text; s.endOrigin = 'manual'; s.translation = undefined; s.translationSource = undefined; s.words = []; s.issues = ['文字已修改，建议重新校准']; realignFrom = s.id; }
    if (edit.startMs !== undefined && edit.endMs !== undefined && (edit.startMs !== s.startMs || edit.endMs !== s.endMs)) {
      s.startMs = edit.startMs; s.endMs = edit.endMs; s.anchor = s.startMs != null;
      s.words = []; s.issues = s.anchor ? [] : ['未对齐']; realignFrom = s.id;
    }
  } else if (edit.kind === 'merge') {
    const next = sentences[i + 1]; if (!next) throw Error('已是最后一句');
    s.text += next.text; s.endOrigin = 'manual'; s.endMs = next.endMs; s.startMs = s.startMs ?? next.startMs;
    if (s.startMs == null || s.endMs == null) s.startMs = s.endMs = null;
    s.words.push(...next.words); s.translation = undefined; s.translationSource = undefined; s.issues = [...new Set([...s.issues, ...next.issues])];
    s.anchor = s.anchor || next.anchor; aliases[next.id] = s.id; sentences.splice(i + 1, 1);
  } else {
    if (edit.offset <= 0 || edit.offset >= s.text.length) throw Error('请把光标放在句子中间');
    const left = s.text.slice(0, edit.offset), right = s.text.slice(edit.offset);
    if (!left.trim() || !right.trim()) throw Error('拆分后两句都需要文字');
    let consumed = 0; let boundary: number | null = null; let cut = 0;
    for (let w = 0; w < s.words.length; w++) { consumed += s.words[w].text.length; if (consumed === edit.offset) { boundary = s.words[w].endMs; cut = w + 1; break; } }
    if (boundary != null && (boundary <= (s.startMs ?? -1) || boundary >= (s.endMs ?? Infinity))) boundary = null;
    const second: Sentence = { ...s, id: newId(), text: right, endOrigin: 'manual', startMs: boundary, words: boundary == null ? [] : s.words.slice(cut), translation: undefined, anchor: false, issues: boundary == null ? ['拆分后待校准'] : [] };
    s.text = left; s.endOrigin = 'manual'; s.endMs = boundary; s.words = boundary == null ? [] : s.words.slice(0, cut); s.translation = undefined; s.translationSource = undefined;
    if (boundary == null) { s.startMs = s.endMs = second.startMs = second.endMs = null; s.anchor = false; s.issues = ['拆分后待校准']; realignFrom = s.id; }
    sentences.splice(i + 1, 0, second);
  }
  return { sentences, aliases, realignFrom };
}
export function parseTranscript(text: string, extension: string, newId: () => string): Sentence[] {
  const make = (text: string, startMs: number | null = null, endMs: number | null = null): Sentence => ({ id: newId(), text, startMs, endMs, words: [], issues: startMs == null ? ['未对齐'] : [] });
  const clean = text.replace(/^\uFEFF/, '').replace(/\r/g, '');
  if (!['srt', 'vtt'].includes(extension.toLowerCase())) return (clean.match(/[^。！？!?\n]+[。！？!?]*|[^\n]+/gu) || []).filter(x => x.trim()).map(x => make(x.trim()));
  const stamp = (s: string) => { const p = s.replace(',', '.').split(':'); return Math.round(p.reduce((n, t) => n * 60 + Number(t), 0) * 1000); };
  const lines = clean.split('\n'); const cues: Sentence[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})/.exec(lines[i]);
    if (!match) continue;
    const body: string[] = []; while (i + 1 < lines.length && lines[i + 1].trim()) body.push(lines[++i]);
    const value = body.join('').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (value) cues.push(make(value, stamp(match[1]), stamp(match[2])));
  }
  if (!cues.length && clean.trim()) throw Error('未发现有效字幕时间，请检查 SRT/VTT 格式');
  const joined: Sentence[] = [];
  for (const cue of cues) {
    const previous = joined.at(-1);
    if (previous && !/[。！？!?」』]$/.test(previous.text) && cue.startMs! >= previous.endMs! && cue.startMs! - previous.endMs! < 1200 && cue.endMs! - previous.startMs! < 30000) { previous.text += cue.text; previous.endMs = cue.endMs; }
    else joined.push(cue);
  }
  validateTimeline(joined); return joined;
}
