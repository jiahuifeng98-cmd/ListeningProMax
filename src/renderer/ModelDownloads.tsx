import {useEffect,useState} from 'react';
type Status={models:{model:string;bytes:number;installed:boolean}[];progress?:{model:string;state:string;received:number;total:number;message:string}};
const names:Record<string,string>={turbo:'标准识别 · Large-v3-turbo',small:'省资源识别 · Small',translation:'离线日中翻译'};
const size=(n:number)=>n>=1024**3?(n/1024**3).toFixed(2)+' GB':Math.ceil(n/1024**2)+' MB';
export function ModelDownloads(){
 const [status,setStatus]=useState<Status>(),[error,setError]=useState('');
 const refresh=()=>window.api.call<Status>('resourceStatus').then(setStatus).catch(e=>setError(String(e.message)));
 useEffect(()=>{let active=true;const update=()=>window.api.call<Status>('resourceStatus').then(s=>{if(active)setStatus(s);}).catch(e=>{if(active)setError(String(e.message));});void update();const timer=setInterval(update,1000);return()=>{active=false;clearInterval(timer);};},[]);
 const p=status?.progress,busy=p&&['downloading','verifying'].includes(p.state);
 return <section className="settings-card model-downloads"><h3>按需下载离线模型</h3><p>轻量版已含运行环境与本地词典。播放已有音频和字幕、联网翻译均不需要下载模型。自动识别使用与你熟悉的完整版相同的本地方案。</p>
 {status?.models.map(m=><div className="resource-list" key={m.model}><div><span>{names[m.model]}<small> · {size(m.bytes)}</small></span><button type="button" disabled={!!busy||m.installed} onClick={()=>{setError('');void window.api.call('resourceInstall',{model:m.model}).then(refresh).catch(e=>setError(e.message));}}>{m.installed?'已就绪':p?.model===m.model&&['error','cancelled'].includes(p.state)?'继续下载':'下载'}</button></div></div>)}
 {p&&<div role="status" aria-live="polite"><p>{names[p.model]}：{p.message}</p><progress style={{width:'100%'}} max={p.total||1} value={p.received}/><p>{size(p.received)} / {size(p.total)}{busy&&<button type="button" onClick={()=>void window.api.call('resourceCancel').then(refresh)}>取消下载</button>}</p></div>}
 {error&&<p role="alert">{error}</p>}<p>国内镜像连接失败时会尝试原站；均按固定版本校验。网络不可用时可稍后续传，已完成译文与课程不受影响。</p></section>;
}
