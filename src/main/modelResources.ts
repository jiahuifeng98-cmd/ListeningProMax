import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export type ModelName='turbo'|'small'|'translation';
export interface ResourceFile {path:string;url:string;bytes:number;sha256:string}
export interface ResourceProgress {model:ModelName;state:'downloading'|'verifying'|'done'|'cancelled'|'error';received:number;total:number;message:string}
export function modelFiles(records:ResourceFile[],model:ModelName){
 if(!['turbo','small','translation'].includes(model))throw Error('未知模型');
 const files=records.filter(r=>r.path.startsWith(`models/${model}/`));
 if(!files.some(f=>f.path===`models/${model}/model.bin`))throw Error('模型资源清单不完整');
 for(const r of files){if(!/^models\/(turbo|small|translation)\/[\w.-]+$/.test(r.path)||!/^https:\/\/huggingface\.co\//.test(r.url)||!Number.isSafeInteger(r.bytes)||r.bytes<0||!/^[a-f0-9]{64}$/.test(r.sha256))throw Error('模型资源清单无效');}
 return files;
}
async function hash(file:string,signal:AbortSignal){const h=createHash('sha256');for await(const chunk of fs.createReadStream(file)){signal.throwIfAborted();h.update(chunk);}return h.digest('hex');}
function safe(root:string,relative:string){const target=path.resolve(root,relative);if(!target.startsWith(path.resolve(root)+path.sep))throw Error('模型路径越界');let p=target;while(p!==path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('模型目录不能是链接');p=path.dirname(p);}return target;}
export async function downloadModel(root:string,files:ResourceFile[],model:ModelName,signal:AbortSignal,progress:(p:ResourceProgress)=>void,fetcher:typeof fetch=fetch){
 let completed=0;const total=files.reduce((n,r)=>n+r.bytes,0);const emit=(state:ResourceProgress['state'],received:number,message:string)=>progress({model,state,received,total,message});
 for(const r of files){
  signal.throwIfAborted();const dest=safe(root,r.path);fs.mkdirSync(path.dirname(dest),{recursive:true});
  const part=safe(root,`cache/model-downloads/${model}/${path.basename(r.path)}.part`);fs.mkdirSync(path.dirname(part),{recursive:true});
  if(fs.existsSync(dest)&&fs.statSync(dest).size===r.bytes){emit('verifying',completed,'校验已有文件');if(await hash(dest,signal)===r.sha256){completed+=r.bytes;continue;}}
  let installed=false,last:unknown;
  for(const url of [r.url.replace('https://huggingface.co/','https://hf-mirror.com/'),r.url]){
   try{
    signal.throwIfAborted();let offset=fs.existsSync(part)?fs.statSync(part).size:0;if(offset>r.bytes){fs.unlinkSync(part);offset=0;}
    if(offset<r.bytes){
     const controller=new AbortController();const abort=()=>controller.abort(signal.reason);signal.addEventListener('abort',abort,{once:true});let timer:ReturnType<typeof setTimeout>|undefined;
     const arm=()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>controller.abort(Error('下载超过 30 秒没有响应')),30000);};arm();
     try{
      const res=await fetcher(url,{headers:offset?{Range:`bytes=${offset}-`}:{},signal:controller.signal});if(!res.ok||!res.body)throw Error(`下载服务返回 HTTP ${res.status}`);
      if(res.status===206){const m=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('content-range')||'');if(!m||Number(m[1])!==offset||Number(m[3])!==r.bytes)throw Error('断点续传响应异常');}
      else{offset=0;}
      const file=await fs.promises.open(part,offset?'a':'w');const reader=res.body.getReader();let count=offset;
      try{while(true){arm();const {done,value}=await reader.read();if(done)break;signal.throwIfAborted();count+=value.length;if(count>r.bytes)throw Error('下载文件超出清单大小');await file.writeFile(value);emit('downloading',completed+count,`正在下载 ${path.basename(r.path)}`);}if(count!==r.bytes)throw Error('连接提前中断，进度已保存');}finally{controller.abort();reader.releaseLock();await file.close();}
     }finally{if(timer)clearTimeout(timer);signal.removeEventListener('abort',abort);}
    }
    emit('verifying',completed+r.bytes,'校验文件完整性');if(await hash(part,signal)!==r.sha256){fs.unlinkSync(part);throw Error('文件校验不符，已丢弃损坏文件');}
    signal.throwIfAborted();await fs.promises.rename(part,dest);installed=true;break;
   }catch(e){last=e;if(signal.aborted)throw e;}
  }
  if(!installed)throw Error(`下载未完成，可重试继续：${(last as Error)?.message||last}`);completed+=r.bytes;
 }
 emit('done',total,'模型已准备好');
}
