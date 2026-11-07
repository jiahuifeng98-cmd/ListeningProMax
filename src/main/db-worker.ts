import {normalizePlayback} from '../shared/playback';
import {courseTitle} from '../shared/lessonCatalog';
import {normalizeVocabulary,vocabularyError} from '../shared/vocabulary';
import {annotateVocabulary,vocabularyIndex} from './vocabularyService';
import { favoriteCount } from '../shared/favorites';
import {normalizeAppearance, appearanceError} from '../shared/appearance';
import { normalizeShortcuts, shortcutError } from '../shared/shortcuts';
import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import kuromoji from 'kuromoji';
import type { Lesson, Task, Favorite, Entry, Settings, Edit, Sentence } from '../shared/types';
import { editTimeline, validateTimeline, assertSameText, recoverWordRange } from '../shared/timeline';
import { glosses, dictionaryForms, kanaReading, counterReading } from '../shared/dictionary';
const root: string = workerData.root;
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const db = new DatabaseSync(path.join(root, 'data', 'library.sqlite'));
const schemaVersion = Number((db.prepare('PRAGMA user_version').get() as any).user_version);
if (schemaVersion > 2) throw Error('此数据库来自更新的软件版本，请使用新版打开');
if (schemaVersion > 0 && schemaVersion < 2) {
  const backupDir=path.join(root,'data/backups');fs.mkdirSync(backupDir,{recursive:true});
  db.exec(`VACUUM INTO '${path.join(backupDir,`library-before-v2-${Date.now()}.sqlite`).replaceAll("'","''")}'`);
}
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS lessons(id TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reference(lesson_id TEXT PRIMARY KEY, body TEXT NOT NULL, history TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS history(lesson_id TEXT, version INTEGER, body TEXT NOT NULL, PRIMARY KEY(lesson_id,version));
CREATE TABLE IF NOT EXISTS baseline(lesson_id TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS aliases(lesson_id TEXT, old_id TEXT, new_id TEXT, PRIMARY KEY(lesson_id,old_id));
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS favorites(id TEXT PRIMARY KEY, kind TEXT, key TEXT, body TEXT NOT NULL, UNIQUE(kind,key));
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT);
PRAGMA user_version=2;`);
const dicPath = path.join(root, 'data', 'dictionaries.sqlite');
if (!fs.existsSync(dicPath) && fs.existsSync(path.join(root, 'assets', 'dictionaries.sqlite'))) fs.copyFileSync(path.join(root, 'assets', 'dictionaries.sqlite'), dicPath);
let dict = new DatabaseSync(dicPath);
if (fs.existsSync(path.join(root,'assets/dictionaries.sqlite')) && (dict.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='dictionaries'").get() as any).n && !(dict.prepare('SELECT count(*) AS n FROM dictionaries').get() as any).n) {
  dict.close();fs.copyFileSync(path.join(root,'assets/dictionaries.sqlite'),dicPath);dict=new DatabaseSync(dicPath);
}
dict.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS dictionaries(name TEXT PRIMARY KEY, language TEXT, source TEXT, count INTEGER);
CREATE TABLE IF NOT EXISTS terms(id INTEGER PRIMARY KEY, dictionary TEXT, expression TEXT, reading TEXT, meanings TEXT);
CREATE INDEX IF NOT EXISTS expression_idx ON terms(expression); CREATE INDEX IF NOT EXISTS reading_idx ON terms(reading);
CREATE TABLE IF NOT EXISTS pitches(expression TEXT,reading TEXT,positions TEXT,source TEXT);
CREATE INDEX IF NOT EXISTS pitch_idx ON pitches(expression,reading);`);
const now = () => new Date().toISOString();
const parse = <T>(row: any): T | undefined => row ? JSON.parse(row.body) : undefined;
function lesson(id: string): Lesson { const l = parse<Lesson>(db.prepare('SELECT body FROM lessons WHERE id=?').get(id)); if (!l) throw Error('课程不存在'); l.loop=l.loop==='sentence'?'sentence':'off'; l.reference = (db.prepare('SELECT body FROM reference WHERE lesson_id=?').get(id) as any)?.body || ''; return l; }
function save(l: Lesson) { const value = { ...l, reference: '', updatedAt: now() }; db.prepare('INSERT OR REPLACE INTO lessons VALUES(?,?)').run(l.id, JSON.stringify(value)); return lesson(l.id); }
function tx<T>(fn: () => T): T { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (e) { db.exec('ROLLBACK'); throw e; } }
function snapshot(l: Lesson) { db.prepare('INSERT OR REPLACE INTO history VALUES(?,?,?)').run(l.id, l.version, JSON.stringify(l.sentences)); }
function resolveId(l:Lesson,id:string|undefined,positionMs?:number) {
  const seen=new Set<string>();
  while(id && !l.sentences.some(s=>s.id===id) && !seen.has(id)){seen.add(id);id=(db.prepare('SELECT new_id FROM aliases WHERE lesson_id=? AND old_id=?').get(l.id,id) as any)?.new_id;}
  if(id && l.sentences.some(s=>s.id===id))return id;
  if(positionMs!=null)return l.sentences.filter(s=>s.startMs!=null).sort((a,b)=>Math.abs(a.startMs!-positionMs)-Math.abs(b.startMs!-positionMs))[0]?.id;
  return undefined;
}
function reconcile(l:Lesson,old:Sentence[]){
  for(const prior of old){if(l.sentences.some(s=>s.id===prior.id))continue;const target=l.sentences.find(s=>s.text===prior.text)||l.sentences.find(s=>s.text.includes(prior.text));if(target)db.prepare('INSERT OR REPLACE INTO aliases VALUES(?,?,?)').run(l.id,prior.id,target.id);}
  const all=db.prepare("SELECT body FROM favorites WHERE kind='sentence'").all().map(row=>parse<Favorite>(row)!);
  const grouped=new Map<string,Favorite>();
  for(const f of all){if(!f.origins.some(o=>o.lessonId===l.id))continue;const origin=f.origins.find(o=>o.lessonId===l.id)!;const target=resolveId(l,origin.sentenceId,origin.positionMs);if(!target)continue;f.key=`${l.id}\0${target}`;const previous=grouped.get(f.key);if(previous){previous.origins.push(...f.origins.filter(o=>!previous.origins.some(p=>JSON.stringify(p)===JSON.stringify(o))));db.prepare('DELETE FROM favorites WHERE id=?').run(f.id);}else grouped.set(f.key,f);}
  for(const f of grouped.values()){const target=f.key.split('\0')[1];f.text=l.sentences.find(s=>s.id===target)?.text||f.text;db.prepare('UPDATE favorites SET key=?,body=? WHERE id=?').run(f.key,JSON.stringify(f),f.id);}
}
const defaultSettings: Settings = { model: 'turbo', online: fs.existsSync(path.join(root,'assets/lightweight.json')), onlineFallback:!fs.existsSync(path.join(root,'assets/lightweight.json')), endpoint: '', apiKey: '', onlineModel: '', freeProvider: 'bing' };
function setting() { const s=parse<Settings>(db.prepare('SELECT body FROM settings WHERE id=1').get()) || {...defaultSettings};if(s.freeProvider!=='bing'){s.freeProvider='bing';db.prepare('INSERT OR REPLACE INTO settings VALUES(1,?)').run(JSON.stringify(s));}s.vocabulary=normalizeVocabulary(s.vocabulary);s.playback=normalizePlayback(s.playback);s.appearance=normalizeAppearance(s.appearance);s.shortcuts=normalizeShortcuts(s.shortcuts);s.sidebarCollapsed=s.sidebarCollapsed===true;return s; }
function plain(value: any): string { if (typeof value === 'string') return value; if (Array.isArray(value)) return value.map(plain).filter(Boolean).join('；'); if (value && typeof value === 'object') return plain(value.content ?? value.text ?? value.glossary ?? ''); return ''; }
const dictionaryList = () => dict.prepare('SELECT name,count,language FROM dictionaries').all();
let tokenizer: any; let tokenizerPromise: Promise<any> | undefined;
function getTokenizer() { return tokenizerPromise ||= new Promise((resolve, reject) => kuromoji.builder({ dicPath: path.join(root, 'assets', 'kuromoji') }).build((err, result) => { if (err) reject(err); else resolve(tokenizer = result); })).catch(error=>{tokenizerPromise=undefined;throw error;}); }
const cache = new Map<string, any>();
const repairAttempts=new Set<string>();
async function lookup(query: string) {
  query = query.normalize('NFKC').trim().slice(0, 100); if (cache.has(query)) return cache.get(query);
  let tokens:any[]=[];
  try { tokens=(tokenizer||await getTokenizer()).tokenize(query); } catch {tokenizerPromise=undefined;}
  const forms=dictionaryForms(query,tokens);
  const rows: any[] = [];
  for (const form of forms) rows.push(...dict.prepare('SELECT t.*,d.language,d.source FROM terms t JOIN dictionaries d ON d.name=t.dictionary WHERE expression=? OR reading=? LIMIT 80').all(form, form));
  const groups = new Map<string, Entry>();
  for (const row of rows) {
    const key = `${row.dictionary}\0${row.expression}\0${row.reading}`;
    let entry = groups.get(key);
    if (!entry) { const pitch = dict.prepare('SELECT positions FROM pitches WHERE expression=? AND reading=?').all(row.expression, row.reading) as any[]; entry = { dictionary: row.dictionary, expression: row.expression, reading: row.reading, meanings: [], language: row.language, source: row.source, pitches: [...new Set<number>(pitch.flatMap(p => JSON.parse(p.positions)))] }; groups.set(key, entry); }
    for (const meaning of JSON.parse(row.meanings)) if (meaning && !entry.meanings.includes(meaning)) entry.meanings.push(meaning);
  }
  const entries = [...groups.values()];
  for(const entry of entries){
    const original=kanaReading(entry.reading);
    const sibling=entries.find(e=>e.expression===entry.expression&&kanaReading(e.reading));
    const inferred=tokenizer?.tokenize(entry.expression) as any[]|undefined;
    entry.reading=original||(sibling?kanaReading(sibling.reading):'')||(inferred?.every(t=>kanaReading(t.reading||t.surface_form))?inferred.map(t=>kanaReading(t.reading||t.surface_form)).join(''):'');
    entry.readingSource=original?'辞书':sibling?'其他辞书':entry.reading?'形态分析':'暂无读音';
    if(entry.readingSource==='形态分析')entry.pitches=[];
    else if(entry.reading)entry.pitches=[...new Set<number>((dict.prepare('SELECT positions FROM pitches WHERE expression=? AND reading=?').all(entry.expression,entry.reading) as any[]).flatMap(p=>JSON.parse(p.positions)))];
  }
  entries.sort((a,b)=>forms.indexOf(a.expression)-forms.indexOf(b.expression)||Number(b.language==='zh')-Number(a.language==='zh'));
  const counted=counterReading(query);
  const exact=entries.find(e=>e.expression===query&&e.reading);
  const surfaceReading=counted||exact?.reading||(tokens.length&&tokens.every(t=>kanaReading(t.reading||t.surface_form))?tokens.map(t=>kanaReading(t.reading||t.surface_form)).join(''):undefined);
  const surfaceReadingSource=counted?'数字与助数词规则':exact?.reading?exact.readingSource:'形态分析';
  const result = { query, entries, surfaceReading, surfaceReadingSource }; if (cache.size > 800) cache.clear(); cache.set(query, result); return result;
}
function importDictionary(file: string, options: any = {}) {
  const zip = new AdmZip(file); const indexFile = zip.getEntry('index.json'); if (!indexFile) throw Error('不是有效的 Yomitan 词库');
  const index = JSON.parse(indexFile.getData().toString('utf8')); const name = index.title; if (!name) throw Error('词库缺少标题');
  let count = 0; const language = options.language || (/中文|日中|Chinese|zh/i.test(name) ? 'zh' : 'en');
  dict.exec('BEGIN');
  try {
    dict.prepare('DELETE FROM terms WHERE dictionary=?').run(name); dict.prepare('DELETE FROM pitches WHERE source=?').run(name);
    const insert = dict.prepare('INSERT INTO terms(dictionary,expression,reading,meanings) VALUES(?,?,?,?)');
    const pitch = dict.prepare('INSERT INTO pitches VALUES(?,?,?,?)');
    for (const e of zip.getEntries()) {
      if (/^term_bank_\d+\.json$/.test(e.entryName)) for (const row of JSON.parse(e.getData().toString('utf8'))) { const meanings = glosses(row[5]); insert.run(name, row[0], row[1] || row[0], JSON.stringify(meanings)); count++; }
      else if (/^term_meta_bank_\d+\.json$/.test(e.entryName)) for (const row of JSON.parse(e.getData().toString('utf8'))) if (row[1] === 'pitch') { const positions = (row[2]?.pitches || []).map((p: any) => p.position).filter(Number.isInteger); pitch.run(row[0], row[2]?.reading || row[0], JSON.stringify(positions), name); count++; }
    }
    dict.prepare('INSERT OR REPLACE INTO dictionaries VALUES(?,?,?,?)').run(name, language, options.source || index.url || '用户导入 / Yomitan', count);
    dict.exec('COMMIT'); cache.clear(); return { name, count };
  } catch (e) { dict.exec('ROLLBACK'); throw e; }
}
async function dispatch(method: string, a: any = {}): Promise<any> {
  switch (method) {
    case 'library': return { lessons: db.prepare('SELECT body FROM lessons').all().map(row => {const {sentences,originalText,reference,...summary}=parse<Lesson>(row)!;return {...summary,sentenceCount:sentences.length};}).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)), tasks: db.prepare('SELECT body FROM tasks').all().map(row => ({...parse<Task>(row)!,request:{}})), dictionaries: dictionaryList(), settings: setting() };
    case 'lesson': return lesson(a.id);
    case 'renameLesson': return tx(()=>{
      const title=courseTitle(a.title),l=lesson(a.id);
      if(a.expectedTitle!==undefined&&a.expectedTitle!==l.title)throw Error('课程名称已更新，请关闭后重新编辑');
      if(l.title===title)return l;
      l.title=title;return save(l);
    });
    case 'deleteLesson': return tx(() => {
      lesson(a.id); // Missing courses must not affect other data.
      for (const table of ['reference','history','baseline','aliases'])
        db.prepare(`DELETE FROM ${table} WHERE lesson_id=?`).run(a.id);
      for (const row of db.prepare('SELECT body FROM tasks').all()) {
        const task=parse<Task>(row)!;
        if(task.lessonId===a.id)db.prepare('DELETE FROM tasks WHERE id=?').run(task.id);
      }
      for(const row of db.prepare('SELECT body FROM favorites').all()){
        const favorite=parse<Favorite>(row)!;
        if(!favorite.origins.some(origin=>origin.lessonId===a.id))continue;
        if(favorite.kind==='word')favorite.collectionCount=favoriteCount(favorite);
        favorite.origins=favorite.origins.filter(origin=>origin.lessonId!==a.id);
        db.prepare('UPDATE favorites SET body=? WHERE id=?').run(JSON.stringify(favorite),favorite.id);
      }
      db.prepare('DELETE FROM lessons WHERE id=?').run(a.id);
      return true;
    });
    case 'repairMissingTimes': return tx(()=>{
      const l=lesson(a.id);const key=l.id+':'+l.version;if(!l.mediaFile||!l.sentences.some(s=>s.startMs==null)||repairAttempts.has(key))return l;
      if(repairAttempts.size>100)repairAttempts.clear();repairAttempts.add(key);
      const history=db.prepare('SELECT body FROM history WHERE lesson_id=? ORDER BY version DESC').all(l.id).flatMap(row=>JSON.parse((row as any).body)) as Sentence[];
      const before=structuredClone(l);let changed=false;
      l.sentences=l.sentences.map((s,i)=>{if(s.startMs!=null)return s;const restored=recoverWordRange(s,history);if(!restored)return s;
        const prev=l.sentences.slice(0,i).reverse().find(s=>s.endMs!=null),next=l.sentences.slice(i+1).find(s=>s.startMs!=null);
        if((prev&&prev.endMs!>restored.startMs!)||(next&&next.startMs!<restored.endMs!))return s;changed=true;return restored;
      });
      if(changed){validateTimeline(l.sentences,l.durationMs);snapshot(before);l.version++;return save(l);}return l;
    });
    case 'create': return tx(() => { const l = a as Lesson; db.prepare('INSERT INTO reference VALUES(?,?,?)').run(l.id, l.reference, '[]'); db.prepare('INSERT INTO baseline VALUES(?,?)').run(l.id, JSON.stringify(l.sentences)); return save(l); });
    case 'progress': { const l = lesson(a.id); if(a.positionMs!==undefined && (!Number.isFinite(a.positionMs)||a.positionMs<0))throw Error('播放位置无效');if(a.rate!==undefined && (!Number.isFinite(a.rate)||a.rate<.25||a.rate>3))throw Error('播放速度无效');if(a.loop!==undefined&&!['off','sentence'].includes(a.loop))throw Error('循环模式无效');for (const k of ['positionMs','rate','loop','selectedId','hidden','referenceCollapsed'] as const) if (a[k] !== undefined) (l as any)[k] = a[k]; return save(l); }
    case 'media': { const l = lesson(a.id); Object.assign(l, { mediaFile: a.mediaFile, sourceMedia: a.sourceMedia ?? l.sourceMedia, durationMs: a.durationMs }); return save(l); }
    case 'reference': return tx(() => { const l = lesson(a.id); const record: any = db.prepare('SELECT * FROM reference WHERE lesson_id=?').get(a.id); const history: string[] = JSON.parse(record.history); if (a.undo) { if (!history.length) return l.reference; a.text = history.pop(); } else { if (a.expected !== undefined && a.expected !== l.reference) throw Error('参考资料已修改，请重新整理'); if (a.organized) assertSameText(l.reference, a.text); history.push(l.reference); } db.prepare('UPDATE reference SET body=?,history=? WHERE lesson_id=?').run(a.text, JSON.stringify(history.slice(-30)), a.id); return a.text; });
    case 'edit': return tx(() => {
      const l = lesson(a.id); if (a.version !== l.version) throw Error('时间轴已更新，请刷新后重试');
      const old=structuredClone(l.sentences);const edit: Edit = a.edit;
      if (edit.kind === 'undo') { const row: any = db.prepare('SELECT version,body FROM history WHERE lesson_id=? ORDER BY version DESC LIMIT 1').get(l.id); if (!row) throw Error('没有可撤销操作'); l.sentences = JSON.parse(row.body); db.prepare('DELETE FROM history WHERE lesson_id=? AND version=?').run(l.id,row.version); }
      else if (edit.kind === 'reset') { throw Error('重置时间轴功能已取消'); }
      else { snapshot(l); const result = editTimeline(l.sentences, edit, randomUUID); l.sentences = result.sentences; for (const [oldId,newId] of Object.entries(result.aliases)) db.prepare('INSERT OR REPLACE INTO aliases VALUES(?,?,?)').run(l.id,oldId,newId); }
      validateTimeline(l.sentences, l.durationMs);reconcile(l,old); l.version++; return save(l);
    });
    case 'timeline': return tx(() => { const l = lesson(a.id); if (l.version !== a.version) throw Error('处理期间正文已修改；结果已保留，请重新校准当前版本'); if(!a.sentences?.length)throw Error('拒绝用空文稿覆盖时间轴，请生成逐句文稿'); validateTimeline(a.sentences,l.durationMs); snapshot(l);const old=l.sentences; l.sentences = a.sentences.map((incoming:Sentence)=>{const current=old.find(s=>s.id===incoming.id&&s.text===incoming.text);return current?.translation?{...incoming,translation:current.translation,translationSource:current.translationSource}:incoming;});reconcile(l,old); l.version++; if (a.baseline) db.prepare('INSERT OR REPLACE INTO baseline VALUES(?,?)').run(l.id,JSON.stringify(l.sentences)); if (!l.reference && !l.originalText) db.prepare('UPDATE reference SET body=? WHERE lesson_id=?').run(l.sentences.map(s=>s.text).join('\n'), l.id); return save(l); });
    case 'translation': { const l = lesson(a.id); const s = l.sentences.find(s => s.id === a.sentenceId); if (s && s.text === a.text) { s.translation = a.translation; s.translationSource = a.source; save(l); } return true; }
    case 'task': db.prepare('INSERT OR REPLACE INTO tasks VALUES(?,?)').run(a.id,JSON.stringify(a)); return a;
    case 'tasks': return db.prepare('SELECT body FROM tasks').all().map(row=>parse<Task>(row));
    case 'lookup': return lookup(a.query);
    case 'vocabulary': return annotateVocabulary(a.texts,getTokenizer);
    case 'dictionaryImport': return importDictionary(a.file, a);
    case 'settings': { const s = { ...setting(), ...a }; if(a.vocabulary){const error=vocabularyError(a.vocabulary);if(error)throw Error(error);}s.vocabulary=normalizeVocabulary(s.vocabulary); if(a.playback && (typeof a.playback.padding!=='boolean'||typeof a.playback.loopPause!=='boolean'))throw Error('无效播放设置');s.playback=normalizePlayback(s.playback); if(a.appearance){const error=appearanceError(a.appearance);if(error)throw Error(error);}if(a.shortcuts){const error=shortcutError(a.shortcuts);if(error)throw Error(error);}if(typeof s.sidebarCollapsed!=='boolean')throw Error('无效导航设置'); if(s.freeProvider!=='bing')throw Error('无效免费翻译服务'); if (!['small','turbo'].includes(s.model)) throw Error('无效模型'); db.prepare('INSERT OR REPLACE INTO settings VALUES(1,?)').run(JSON.stringify(s)); return s; }
    case 'favorites': return db.prepare('SELECT body FROM favorites ORDER BY rowid DESC').all().map(row => {const f=parse<Favorite>(row)!;return f.kind==='word'?{...f,vocabulary:vocabularyIndex().find(f.text,f.reading)||{levels:[]}}:f;});
    case 'favorite': return tx(() => {
      const key = a.kind === 'word' ? `${a.text.normalize('NFKC')}\0${a.reading || ''}` : `${a.origin.lessonId}\0${a.origin.sentenceId}`;
      let f = parse<Favorite>(db.prepare('SELECT body FROM favorites WHERE kind=? AND key=?').get(a.kind,key));
      const collectionCount = f ? favoriteCount(f) + 1 : 1;
      if (!f) f = { id: randomUUID(), kind: a.kind, key, text:a.text,reading:a.reading,meaning:a.meaning, origins:[],createdAt:now() };
      if (f.kind === 'word') f.collectionCount = collectionCount;
      if (!f.origins.some(o=>JSON.stringify(o)===JSON.stringify(a.origin))) f.origins.push(a.origin);
      db.prepare('INSERT OR REPLACE INTO favorites VALUES(?,?,?,?)').run(f.id,f.kind,key,JSON.stringify(f));
      return f;
    });
    case 'removeFavorite': db.prepare('DELETE FROM favorites WHERE id=?').run(a.id); return true;
    case 'resolve': { const l=lesson(a.lessonId);return {lesson:l,sentenceId:a.sentenceId?resolveId(l,a.sentenceId,a.positionMs):undefined}; }
    case 'checkpoint': db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); dict.exec('PRAGMA wal_checkpoint(TRUNCATE)'); return true;
    default: throw Error(`未知操作 ${method}`);
  }
}
let chain = Promise.resolve();
parentPort!.on('message', ({ id, method, args }) => { chain = chain.then(async () => { try { parentPort!.postMessage({ id, result: await dispatch(method,args) }); } catch (e) { parentPort!.postMessage({ id, error: (e as Error).message }); } }); });
parentPort!.postMessage({ ready: true });
