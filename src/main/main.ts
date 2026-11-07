import { nativeTheme, app, BrowserWindow, ipcMain, dialog, protocol, shell } from 'electron';
import { Worker } from 'node:worker_threads';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import iconv from 'iconv-lite';
import AdmZip from 'adm-zip';
import type { Lesson, Task, Settings } from '../shared/types';
import { parseTranscript, formatTime } from '../shared/timeline';
import { validateTimeline, editTimeline } from '../shared/timeline';
import { backup } from './backup';
import { lessonFileTargets } from './lessonFiles';
import {modelFiles,downloadModel,type ModelName,type ResourceProgress} from './modelResources';
const root = process.env.LPM_ROOT || path.resolve(__dirname, '..');
for (const dir of ['data','cache/tmp','cache/session','cache/gpu','cache/pycache','cache/torch','cache/huggingface','logs','data/jobs','data/media','data/exports']) fs.mkdirSync(path.join(root,dir),{recursive:true});
Object.assign(process.env, { TEMP:path.join(root,'cache/tmp'),TMP:path.join(root,'cache/tmp'),HF_HOME:path.join(root,'cache/huggingface'),TORCH_HOME:path.join(root,'cache/torch'),XDG_CACHE_HOME:path.join(root,'cache'),PYTHONPYCACHEPREFIX:path.join(root,'cache/pycache'),PYTHONUTF8:'1',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',TOKENIZERS_PARALLELISM:'false',NUMBA_CACHE_DIR:path.join(root,'cache/numba') });
app.setPath('userData',path.join(root,'data/browser')); app.setPath('sessionData',path.join(root,'cache/session')); app.setPath('temp',path.join(root,'cache/tmp')); app.setAppLogsPath(path.join(root,'logs'));
app.commandLine.appendSwitch('disk-cache-dir',path.join(root,'cache/session')); app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.disableHardwareAcceleration();
if(!app.requestSingleInstanceLock()){app.quit();process.exit(0);}
protocol.registerSchemesAsPrivileged([{scheme:'lpm',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
const worker = new Worker(path.join(__dirname,'db-worker.cjs'),{workerData:{root}});
let nextId=0; const pending=new Map<number,{resolve:(v:any)=>void,reject:(e:any)=>void}>();
let databaseError:Error|undefined;
const dbReady=new Promise<void>((resolve,reject)=>{ worker.on('message',m=>{if(m.ready)resolve(); else {const p=pending.get(m.id); pending.delete(m.id); if(m.error)p?.reject(Error(m.error));else p?.resolve(m.result);}}); worker.on('error',reject); });
worker.on('error',e=>{databaseError=e instanceof Error?e:Error(String(e));for(const p of pending.values())p.reject(e);pending.clear();});
worker.on('exit',()=>{databaseError=Error('数据进程已退出，请重启软件恢复');for(const p of pending.values())p.reject(databaseError);pending.clear();});
async function db<T=any>(method:string,args:any={}):Promise<T>{await dbReady;if(databaseError)throw databaseError;return new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(Error('数据操作超时，请检查磁盘空间并重试'));},method==='dictionaryImport'?300000:60000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});worker.postMessage({id,method,args});});}
let win:BrowserWindow|undefined;
app.on('second-instance',()=>{if(win?.isMinimized())win.restore();win?.show();win?.focus();});
const notify=(event:any)=>win?.webContents.send('change',event.task?{...event,task:{...event.task,request:{}}}:event);
const lightweight=fs.existsSync(path.join(root,'assets/lightweight.json'));
const downloads:{progress?:ResourceProgress;controller?:AbortController;promise?:Promise<void>}={};
const resources=(model:ModelName)=>modelFiles(JSON.parse(fs.readFileSync(path.join(root,'assets/manifest.json'),'utf8')),model);
function installed(model:ModelName){if(!fs.existsSync(path.join(root,`models/${model}/model.bin`)))return false;return resources(model).every(r=>fs.existsSync(path.join(root,r.path))&&fs.statSync(path.join(root,r.path)).size===r.bytes);}
function installModel(model:ModelName):Promise<void>{
 if(downloads.promise)throw Error('已有模型正在下载，请等待或取消后再试');
 const files=resources(model),controller=new AbortController();downloads.controller=controller;
 downloads.progress={model,state:'downloading',received:0,total:files.reduce((n,r)=>n+r.bytes,0),message:'正在连接下载源'};
 downloads.promise=downloadModel(root,files,model,controller.signal,p=>{downloads.progress=p;}).catch(e=>{downloads.progress={...downloads.progress!,state:controller.signal.aborted?'cancelled':'error',message:controller.signal.aborted?'已取消；已下载部分保留，可继续':(e as Error).message};throw e;}).finally(()=>{downloads.promise=undefined;downloads.controller=undefined;notify({type:'library'});});
 return downloads.promise;
}
async function requireModel(model:ModelName){
 if(installed(model))return;
 if(downloads.promise){if(downloads.progress?.model===model)return downloads.promise;throw Error('其他模型正在下载，请完成后重试');}
 const bytes=resources(model).reduce((n,r)=>n+r.bytes,0);const answer=await dialog.showMessageBox(win!,{type:'info',title:'首次使用：准备离线模型',message:'这项功能需要下载一次模型',detail:`下载约 ${(bytes/1024/1024).toFixed(0)} MB，保存在软件目录。以后可离线使用。下载进度、取消与重试入口在“设置与资源”。不会上传音频。`,buttons:['暂不下载','下载并继续'],defaultId:0,cancelId:0,noLink:true});
 if(answer.response!==1)throw Error('已保留课程。可在设置中下载模型后继续生成或校准。');await installModel(model);
}
const tasks=new Map<string,Task>(); const queue:string[]=[]; let running:string|undefined; let child:ChildProcess|undefined; let stopping=false;
const deleting=new Set<string>();
const deletionDialogs=new Set<string>();
const taskUpdate=async(t:Task)=>{t.updatedAt=new Date().toISOString();try{await db('task',t);}catch(e){t.state='error';t.stage='任务状态保存失败';t.error=`请检查磁盘空间和目录权限：${(e as Error).message}`;notify({type:'task',lessonId:t.lessonId,task:t});return false;}notify({type:'task',lessonId:t.lessonId,task:t});return true;};
async function enqueue(kind:Task['kind'],lessonId:string,options:any={}){
  if(deleting.has(lessonId))throw Error('课程正在删除');
  if(!['analyze','realign','translate','segment'].includes(kind))throw Error('无效任务类型');
  const lesson:Lesson=await db('lesson',{id:lessonId}); const settings:Settings=(await db('library')).settings;
  if((kind==='analyze'&&!options.keepSubtitleTimes&&!options.mediaOnly)||kind==='realign')await requireModel(settings.model);
  if(kind==='translate'&&!settings.online)await requireModel('translation');
  const duplicate=[...tasks.values()].find(t=>t.lessonId===lessonId && t.kind===kind && ['queued','running'].includes(t.state));
  if(duplicate){const old=duplicate.request.lesson as Lesson;if(old.version===lesson.version && duplicate.request.translateAfterEdit===options.translateAfterEdit && JSON.stringify(duplicate.request.pendingSplit)===JSON.stringify(options.pendingSplit) && duplicate.request.fromId===options.fromId && JSON.stringify(duplicate.request.settings)===JSON.stringify({...settings,apiKey:'',endpoint:'',onlineModel:''}))return duplicate;duplicate.state='cancelled';duplicate.stage='已被新编辑替代';await taskUpdate(duplicate);if(running===duplicate.id&&child)await killTree(child);}
  settings.apiKey='';settings.endpoint='';settings.onlineModel='';
  const task:Task={id:randomUUID(),lessonId,kind,state:'queued',progress:0,stage:'等待处理',request:{...options,lesson,settings},updatedAt:new Date().toISOString()};
  tasks.set(task.id,task);if(!await taskUpdate(task))throw Error(task.error);queue.push(task.id);void runNext();return task;
}
async function runNext(){
  if(running || stopping)return; const id=queue.shift();if(!id)return;const task=tasks.get(id)!; if(task.state!=='queued'){void runNext();return;}
  running=id;task.state='running';task.stage='正在加载';if(!await taskUpdate(task)){running=undefined;void runNext();return;}
  const jobDir=path.join(root,'data/jobs',id);const input=path.join(jobDir,'request.json');
  let lastProgress=Date.now(); let errorText=''; let completion=false; let eventChain=Promise.resolve();
  try {
    task.request.lesson=await db('lesson',{id:task.lessonId});
    if(task.request.pendingSplit){const l=task.request.lesson as Lesson;const pending=task.request.pendingSplit as any;const s=l.sentences.find(s=>s.id===pending.id);if(!s||s.text!==pending.originalText)throw Error('待拆分句子已修改，请重新选择拆分位置');Object.assign(pending,{originalStartMs:s.startMs,originalEndMs:s.endMs,originalAnchor:s.anchor});l.sentences=editTimeline(l.sentences,pending,randomUUID).sentences;}
    fs.mkdirSync(jobDir,{recursive:true});
    fs.writeFileSync(input,JSON.stringify({root,jobDir,kind:task.kind,...task.request}));
    await new Promise<void>((resolve,reject)=>{
      const env={...process.env,LPM_NODE:process.execPath,LPM_SEGMENTER:path.join(__dirname,'segmenter.cjs')};delete (env as NodeJS.ProcessEnv).LPM_TRANSLATION_KEY;
      const proc=spawn(path.join(root,'runtime/python/python.exe'),[path.join(root,'worker/worker.py'),input],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});child=proc;proc.stdout!.setEncoding('utf8');
      const writeLog=(data:string|Buffer)=>{try{fs.appendFileSync(path.join(jobDir,'worker.log'),data);}catch{errorText='日志无法保存，请检查磁盘空间或目录权限后重试。';void killTree(proc);}};
      const watchdog=setInterval(()=>{if(Date.now()-lastProgress>15*60*1000){errorText='当前片段处理超时，已停止；可缩短片段后重试。';void killTree(proc);}},10000);
      let buffer='';proc.stdout!.on('data',data=>{buffer+=data.toString('utf8');let p;while((p=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,p);buffer=buffer.slice(p+1);try{const event=JSON.parse(line);if(event.type!=='heartbeat')lastProgress=Date.now();eventChain=eventChain.then(async()=>{
        if(task.state==='cancelled')return;
        if(event.type==='progress'){task.progress=event.progress;task.stage=event.stage;if(!await taskUpdate(task)){errorText=task.error||'任务状态保存失败';void killTree(proc);}}
        if(event.type==='media'){await db('media',{id:task.lessonId,...event});notify({type:'lesson',lessonId:task.lessonId});}
        if(event.type==='translation'){await db('translation',{id:task.lessonId,...event});notify({type:'translation',lessonId:task.lessonId});}
        if(event.type==='draft'){
          const current:Lesson=await db('lesson',{id:task.lessonId});
          if(current.version===(task.request.lesson as Lesson).version && !current.sentences.length){
            const saved:Lesson=await db('timeline',{id:task.lessonId,version:current.version,sentences:event.sentences});
            (task.request.lesson as Lesson).version=saved.version;notify({type:'lesson',lessonId:task.lessonId});
          }
        }
        if(event.type==='result'){
          if(event.sentences)await db('timeline',{id:task.lessonId,version:(task.request.lesson as Lesson).version,sentences:event.sentences,baseline:task.kind==='analyze'||!(task.request.lesson as Lesson).sentences.length});
          if(event.reference!==undefined)await db('reference',{id:task.lessonId,text:event.reference,expected:(task.request.lesson as Lesson).reference,organized:true});
          completion=true;notify({type:'lesson',lessonId:task.lessonId});
          if(event.sentences&&task.request.translateAfterEdit)await enqueue('translate',task.lessonId);
        }
        if(event.type==='error')errorText=event.message;
      }).catch(e=>{errorText=e.message;});}catch{writeLog(line+'\n');}}});
      proc.stderr!.on('data',writeLog);
      proc.on('error',e=>{clearInterval(watchdog);reject(e);});
      proc.on('close',code=>{clearInterval(watchdog);void eventChain.then(()=>{if(task.state==='cancelled')resolve();else if(code!==0||errorText||!completion)reject(Error(errorText||`后台退出 (${code})，详见任务日志`));else resolve();});});
    });
    if((task.state as string)!=='cancelled'){task.state='done';task.progress=1;task.stage='已完成';}
  }catch(e){if((task.state as string)!=='cancelled'){task.state='error';task.error=(e as Error).message;task.errorKind=/已修改|版本|已更新/.test(task.error)?'conflict':/超时/.test(task.error)?'timeout':/对齐|锚点|拆分/.test(task.error)?'alignment':/必应|网络|连接/.test(task.error)?'network':'process';task.stage='处理未完成，原内容已保留';}}
  finally{child=undefined;running=undefined;await taskUpdate(task);void runNext();}
}
async function killTree(proc:ChildProcess){if(!proc.pid)return;await new Promise<void>(resolve=>{const kill=spawn('taskkill',['/PID',String(proc.pid),'/T','/F'],{windowsHide:true});kill.on('exit',()=>resolve());kill.on('error',()=>{proc.kill();resolve();});});}
async function deleteLesson(id:string){
  if(deleting.has(id)||deletionDialogs.has(id))throw Error('课程正在删除');
  deletionDialogs.add(id);
  try{
    const lesson:Lesson=await db('lesson',{id});
    const answer=await dialog.showMessageBox(win!,{type:'warning',title:'删除课程',message:`删除“${lesson.title}”？`,detail:'将删除此课程的文稿、编辑历史及应用内音频和分析文件，停止相关任务。已收藏的文字会保留，但不能再跳回此课程。你原来的导入文件及已导出的备份不会删除。此操作不可撤销。',buttons:['取消','删除课程'],defaultId:0,cancelId:0,noLink:true});
    if(answer.response!==1)return {deleted:false};
    deleting.add(id);
    const related=[...tasks.values()].filter(t=>t.lessonId===id);
    // Resolve and inspect owned paths before changing any data.
    lessonFileTargets(root,id,related.map(t=>t.id));
    for(const task of related)if(['queued','running'].includes(task.state)){task.state='cancelled';task.stage='课程已删除';await taskUpdate(task);}
    if(running&&tasks.get(running)?.lessonId===id&&child)await killTree(child);
    const deadline=Date.now()+10000;
    while(running&&tasks.get(running)?.lessonId===id){
      if(Date.now()>deadline)throw Error('后台尚未退出，课程未删除，请稍后重试');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    const targets=lessonFileTargets(root,id,related.map(t=>t.id));
    await db('deleteLesson',{id});
    for(const task of related)tasks.delete(task.id);
    for(let i=queue.length-1;i>=0;i--)if(!tasks.has(queue[i]))queue.splice(i,1);
    notify({type:'lessonDeleted',lessonId:id});notify({type:'library'});
    const remaining:string[]=[];
    for(const target of targets)try{await fs.promises.rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:150});}catch{remaining.push(path.relative(root,target));}
    return {deleted:true,remaining};
  }finally{deleting.delete(id);deletionDialogs.delete(id);}
}
function decode(buffer:Buffer){if(buffer[0]===255&&buffer[1]===254)return iconv.decode(buffer,'utf16-le');if(buffer[0]===254&&buffer[1]===255)return iconv.decode(buffer,'utf16-be');const value=buffer.toString('utf8');return value.includes('\uFFFD')?iconv.decode(buffer,'shift_jis'):value;}
async function importFiles(files?:string[],attachId?:string){
  if(!files){const result=await dialog.showOpenDialog(win!,{title:attachId?'关联音频':'导入日语素材或课程备份',properties:['openFile','multiSelections'],filters:[{name:'音频、视频、文稿与课程备份',extensions:['mp3','m4a','wav','flac','ogg','opus','aac','mp4','mkv','webm','mov','txt','srt','vtt','zip']}]});if(result.canceled)return;files=result.filePaths;}
  if(!Array.isArray(files)||!files.every(f=>typeof f==='string'))throw Error('文件路径无效');
  if(files.length===1&&/\.zip$/i.test(files[0])){const restored=await backup(root,{mode:'import',file:files[0]});validateTimeline(restored.lesson.sentences,restored.lesson.durationMs);const stamp=new Date().toISOString();restored.lesson.createdAt=restored.lesson.updatedAt=stamp;await db('create',restored.lesson);for(const f of restored.favorites)await db('favorite',f);notify({type:'library'});return restored.lesson;}
  if(files.some(f=>/\.zip$/i.test(f)))throw Error('课程备份请单独导入');
  if(files.filter(f=>/\.(txt|srt|vtt)$/i.test(f)).length>1||files.filter(f=>!/\.(txt|srt|vtt)$/i.test(f)).length>1)throw Error('每次请选择一段音频或视频，可同时附一份文稿或字幕');
  const textPath=files.find(f=>/\.(txt|srt|vtt)$/i.test(f));const media=files.find(f=>!/\.(txt|srt|vtt)$/i.test(f));if(!textPath&&!media)return;
  let lesson:Lesson;
  if(attachId)lesson=await db('lesson',{id:attachId});
  else {const text=textPath?decode(fs.readFileSync(textPath)):'';const stamp=new Date().toISOString();lesson={id:randomUUID(),title:path.basename(media||textPath!,path.extname(media||textPath!)),createdAt:stamp,updatedAt:stamp,version:1,durationMs:0,originalText:text,sentences:textPath?parseTranscript(text,path.extname(textPath).slice(1),randomUUID):[],reference:textPath&&/\.(srt|vtt)$/i.test(textPath)?parseTranscript(text,path.extname(textPath).slice(1),randomUUID).map(s=>s.text).join('\n'):text,positionMs:0,rate:1,loop:'off',hidden:false,referenceCollapsed:false};await db('create',lesson);}
  if(media){for(const task of tasks.values())if(task.lessonId===lesson.id&&['queued','running'].includes(task.state)){task.state='cancelled';task.stage='音源已更换';await taskUpdate(task);if(running===task.id&&child)await killTree(child);}const folder=path.join(root,'data/media',lesson.id);fs.mkdirSync(folder,{recursive:true});const name='source-'+randomUUID()+path.extname(media).toLowerCase();await fs.promises.copyFile(media,path.join(folder,name));lesson=await db('media',{id:lesson.id,sourceMedia:`data/media/${lesson.id}/${name}`,mediaFile:undefined,durationMs:0});const keepSubtitleTimes=lesson.sentences.length>0&&lesson.sentences.every(s=>s.startMs!=null);const settings:Settings=(await db('library')).settings;await enqueue('analyze',lesson.id,{keepSubtitleTimes,mediaOnly:!keepSubtitleTimes&&!installed(settings.model)});}
  notify({type:'library'});return lesson;
}
async function exportLesson(a:any){const l:Lesson=await db('lesson',{id:a.id});const folder=path.join(root,'data/exports');const file=path.join(folder,`${l.title.replace(/[<>:"/\\|?*]/g,'_')}-${Date.now()}.${a.format}`);let content='';
  if(a.format==='txt')content=l.sentences.map(s=>s.text).join('\n');
  else if(a.format==='srt'||a.format==='vtt'){const valid=l.sentences.filter(s=>s.startMs!=null);content=(a.format==='vtt'?'WEBVTT\n\n':'')+valid.map((s,i)=>`${i+1}\n${formatTime(s.startMs).replace('.',a.format==='srt'?',':'.')} --> ${formatTime(s.endMs).replace('.',a.format==='srt'?',':'.')}\n${s.text}\n`).join('\n');}
  else if(a.format==='zip'){const favorites=(await db('favorites')).filter((f:any)=>f.origins.some((o:any)=>o.lessonId===l.id));await backup(root,{mode:'export',file,lesson:l,favorites});return file;}
  else throw Error('不支持的导出格式');await fs.promises.writeFile(file,content,'utf8');return file;
}
const exposed=new Set(['lesson','progress','lookup','vocabulary','favorites','favorite','removeFavorite','resolve','settings']);
const lookups=new Map<string,()=>void>();const onlineCache=new Map<string,any>();
function lookupOnline(id:string,query:string):Promise<any>{
 if(typeof id!=='string'||typeof query!=='string'||!query.trim()||query.length>100)throw Error('查词参数无效');
 if(onlineCache.has(query))return Promise.resolve(onlineCache.get(query));
 for(const cancel of lookups.values())cancel();
 return new Promise((resolve,reject)=>{
  const proc=spawn(path.join(root,'runtime/python/python.exe'),['-B',path.join(root,'worker/lookup_online.py')],{cwd:root,env:process.env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let text='';let settled=false;
  const finish=(error?:string,result?:any)=>{if(settled)return;settled=true;clearTimeout(timer);lookups.delete(id);if(error)reject(Error(error));else{if(onlineCache.size>=300)onlineCache.clear();onlineCache.set(query,result);resolve(result);}};
  const cancel=()=>{finish('联网查询已取消');void killTree(proc);};
  const timer=setTimeout(()=>{finish('联网查询超过 10 秒，请稍后重试；本地结果仍可使用');void killTree(proc);},10000);
  lookups.set(id,cancel);proc.stdout!.setEncoding('utf8');proc.stdout!.on('data',chunk=>{text+=chunk;if(text.length>20000){finish('联网结果格式异常');void killTree(proc);}});proc.stderr!.resume();
  proc.on('error',e=>finish(e.message));proc.on('close',code=>{if(settled)return;try{const result=JSON.parse(text);if(code!==0||result.error)finish(result.error||'联网查词失败');else if(typeof result.text!=='string'||!result.text.trim())finish('未返回有效译文');else finish(undefined,result);}catch{finish('联网查词未返回有效结果');}});
  proc.stdin!.on('error',()=>{});proc.stdin!.end(query,'utf8');
 });
}
ipcMain.handle('lpm',async(event,method:string,a:any={})=>{
  if(event.sender!==win?.webContents)throw Error('未知窗口');
  if(!a||typeof a!=='object'||Array.isArray(a))throw Error('请求参数无效');
  if(deleting.has(a.id)&&!['library','progress'].includes(method))throw Error('课程正在删除');
  if(method==='deleteLesson')return deleteLesson(a.id);
  if(method==='renameLesson'){const result=await db('renameLesson',a);notify({type:'library'});notify({type:'lesson',lessonId:a.id});return result;}
  if(method==='lookupOnline')return lookupOnline(a.requestId,a.query);
  if(method==='cancelLookup'){lookups.get(a.requestId)?.();return true;}
  if(method==='resourceStatus')return {progress:downloads.progress,models:['turbo','small','translation'].map(model=>({model,bytes:resources(model as ModelName).reduce((n,r)=>n+r.bytes,0),installed:installed(model as ModelName)}))};
  if(method==='resourceCancel'){downloads.controller?.abort();return true;}
  if(method==='resourceInstall'){if(running)throw Error('请等待当前处理任务完成后再安装模型');if(!['turbo','small','translation'].includes(a.model))throw Error('未知模型');void installModel(a.model).catch(()=>{});return true;}
  if(method==='settings'){const settings=await db('settings',{...a,apiKey:'',endpoint:'',onlineModel:''});nativeTheme.themeSource=settings.appearance.theme;return settings;}
  if(method==='lesson')return db('repairMissingTimes',a);
  if(method==='library'){const data=await db('library');return {...data,root,lightweight,health:{python:fs.existsSync(path.join(root,'runtime/python/python.exe')),turbo:installed('turbo'),small:installed('small'),translation:installed('translation')}};}
  if(method==='import')return importFiles(a.paths,a.attachId);
  if(method==='reference'&&a.undo)throw Error('撤销功能已取消');
  if(method==='edit'&&a.edit?.kind==='reset')throw Error('重置时间轴功能已取消');
  if(method==='edit'&&a.edit?.kind==='undo')throw Error('撤销功能已取消');
  if(method==='edit'){
    const before:Lesson=await db('lesson',{id:a.id});if(a.version!==before.version)throw Error('时间轴已更新，请重新打开编辑');
    const e=a.edit;const prior=before.sentences.find(s=>s.id===e.id);
    if(e.kind==='split'&&prior){const candidate=editTimeline(before.sentences,e,randomUUID);if(candidate.realignFrom&&before.sourceMedia){await enqueue('realign',a.id,{fromId:e.id,translateAfterEdit:a.translate===true,pendingSplit:{...e,originalText:prior.text,originalStartMs:prior.startMs,originalEndMs:prior.endMs,originalAnchor:prior.anchor}});return before;}}
    const l=await db('edit',a);
    if(e.kind==='text'&&prior&&(e.startMs!==prior.startMs||e.endMs!==prior.endMs)&&e.startMs!=null&&l.sourceMedia){try{await enqueue('realign',a.id,{fromId:e.id});}catch(error){notify({type:'message',message:'时间已保存，但后台校准未启动：'+(error as Error).message});}}
    if(a.translate===true&&l.sentences.some((s:any)=>!s.translation)){
      try{await enqueue('translate',a.id);}catch(error){notify({type:'message',message:'修改已保存，但自动翻译未启动：'+(error as Error).message});}
    }
    notify({type:'lesson',lessonId:a.id});return l;
  }
  if(method==='enqueue'){const task=await enqueue(a.kind,a.id,a.options);return {...task,request:{}};}
  if(method==='cancel'){const t=tasks.get(a.id);if(t){t.state='cancelled';t.stage='已取消，可继续';await taskUpdate(t);if(running===t.id&&child)await killTree(child);}return true;}
  if(method==='dismissTask'){const t=tasks.get(a.id);if(t&&!['queued','running'].includes(t.state)){t.dismissed=true;await taskUpdate(t);}return true;}
  if(method==='retry'){
    const t=tasks.get(a.id);if(!t||!['error','cancelled'].includes(t.state))return;
    const l:Lesson=await db('lesson',{id:t.lessonId});const options:any={};
    if(t.request.pendingSplit){const p=t.request.pendingSplit as any;if(!l.sentences.some(s=>s.id===p.id&&s.text===p.originalText))throw Error('原句已经变化，请重新选择拆分位置');options.pendingSplit=p;}
    if(t.request.translateAfterEdit)options.translateAfterEdit=true;
    if(t.request.fromId){const old=(t.request.lesson as Lesson)?.sentences.find(s=>s.id===t.request.fromId);const resolved=await db('resolve',{lessonId:l.id,sentenceId:t.request.fromId,positionMs:old?.startMs});if(!resolved.sentenceId)throw Error('原句已变化，请重新选择校准范围');options.fromId=resolved.sentenceId;}
    const next=await enqueue(t.kind,l.id,options);t.dismissed=true;await taskUpdate(t);return {...next,request:{}};
  }
  if(method==='dictionaryImport'){const result=await dialog.showOpenDialog(win!,{properties:['openFile'],filters:[{name:'Yomitan 词库',extensions:['zip']}]});if(result.canceled)return;const value=await db('dictionaryImport',{file:result.filePaths[0]});notify({type:'library'});return value;}
  if(method==='export')return exportLesson(a);
  if(method==='showExports')return shell.openPath(path.join(root,'data/exports'));
  if(exposed.has(method))return db(method,a);throw Error('不允许的操作');
});
app.whenReady().then(async()=>{
  protocol.handle('lpm',async request=>{try{const url=new URL(request.url);if(url.hostname!=='media')return new Response(null,{status:404});const l:Lesson=await db('lesson',{id:url.pathname.slice(1)});if(!l.mediaFile)return new Response(null,{status:404});const file=path.resolve(root,l.mediaFile);if(!file.startsWith(path.join(root,'data/media')+path.sep))return new Response(null,{status:403});const size=fs.statSync(file).size;const range=request.headers.get('range');let start=0,end=size-1,status=200;if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m)return new Response(null,{status:416});if(!m[1])start=Math.max(0,size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});status=206;}const mime:Record<string,string>={'.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.flac':'audio/flac','.ogg':'audio/ogg','.opus':'audio/ogg'};const headers:any={'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Accept-Ranges':'bytes','Content-Length':String(end-start+1)};if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;return new Response(Readable.toWeb(fs.createReadStream(file,{start,end})) as any,{status,headers});}catch{return new Response(null,{status:404});}});
  nativeTheme.themeSource=(await db('library')).settings.appearance.theme;
  win=new BrowserWindow({width:1400,height:940,minWidth:800,minHeight:600,show:false,backgroundColor:nativeTheme.shouldUseDarkColors?'#1c1c1e':'#ffffff',title:'ListeningProMax',icon:path.join(root,'assets/branding/listening-promax.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.removeMenu();win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());win.once('ready-to-show',()=>win?.show());await win.loadFile(path.join(__dirname,'renderer/index.html'));
  for(const t of await db<Task[]>('tasks')){if(t.state==='running'||t.state==='queued'){t.state='cancelled';t.stage='上次处理中断，可继续';await taskUpdate(t);}tasks.set(t.id,t);}
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{stopping=true;downloads.controller?.abort();for(const cancel of lookups.values())cancel();if(child)void killTree(child);});
