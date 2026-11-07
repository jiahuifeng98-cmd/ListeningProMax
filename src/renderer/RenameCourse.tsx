import {useEffect,useRef,useState} from 'react';
import {courseTitle} from '../shared/lessonCatalog';
import {useDialogFocus} from './useDialogFocus';
export function RenameCourse({title,onClose,onSave}:{title:string;onClose:()=>void;onSave:(title:string)=>Promise<void>}){
 const [value,setValue]=useState(title),[error,setError]=useState(''),[busy,setBusy]=useState(false);const input=useRef<HTMLInputElement>(null);
 useDialogFocus('rename',()=>{if(!busy)onClose();});
 useEffect(()=>{input.current?.focus();input.current?.select();},[]);
 const save=async()=>{if(busy)return;try{const next=courseTitle(value);setBusy(true);setError('');await onSave(next);onClose();}catch(e){setError((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /,''));setBusy(false);}};
 return <div className="rename-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><form className="rename-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-title" data-editor onSubmit={e=>{e.preventDefault();void save();}}><h2 id="rename-title">重命名课程</h2><p>修改名称后，学习进度和收藏出处会继续保留。</p><label htmlFor="course-name">课程名称</label><input id="course-name" ref={input} value={value} maxLength={100} disabled={busy} onChange={e=>{setValue(e.target.value);setError('');}} aria-invalid={!!error} aria-describedby={error?'rename-error':undefined}/>{error&&<p id="rename-error" role="alert" className="rename-error">{error}</p>}<div className="rename-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy||!value.trim()}>{busy?'保存中…':'保存名称'}</button></div></form></div>;
}
