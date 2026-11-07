import {memo,useEffect,useRef,useState} from 'react';
import {ChevronDown,X} from 'lucide-react';
import {vocabularyLevels,vocabularyLabels,vocabularyColor,vocabularyDescription,type VocabularyTag,type VocabularySpan,type VocabularySettings} from '../shared/vocabulary';

export const ColoredSentence=memo(function ColoredSentence({text,spans,settings}:{text:string;spans?:VocabularySpan[];settings:VocabularySettings}){
  if(!settings.enabled)return <>{text}</>;
  if(!spans)return <span className="vocabulary-word level-other">{text}</span>;
  return <>{spans.map(s=><span key={s.start} className={'vocabulary-word level-'+vocabularyColor(s,settings)} data-level={s.level||'other'} title={s.word?`${s.word} · ${vocabularyDescription(s)}`:undefined}>{text.slice(s.start,s.end)}</span>)}</>;
});
export function VocabularyBadge({tag}:{tag?:VocabularyTag}){
  return <span className={'vocabulary-badge level-'+(tag?.level||'other')} title={tag?vocabularyDescription(tag):'未在当前词表中匹配'}>{tag?.level?vocabularyLabels[tag.level]:'未分级'}</span>;
}
export function VocabularyControls({value,onChange,busy,error,retry}:{value:VocabularySettings;onChange:(s:VocabularySettings)=>void;busy:boolean;error:string;retry:()=>void}){
  const [open,setOpen]=useState(false),[position,setPosition]=useState({top:0,left:0});const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(!open)return;const place=()=>{const r=trigger.current?.getBoundingClientRect();if(r)setPosition({top:r.bottom+8,left:Math.max(12,Math.min(r.right-360,innerWidth-372))});};place();const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus({preventScroll:true});}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key,true);window.addEventListener('resize',place);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key,true);window.removeEventListener('resize',place);};},[open]);
  return <div className="vocabulary-controls" ref={root}>
    <button className={value.enabled?'vocabulary-toggle selected':'vocabulary-toggle'} aria-pressed={value.enabled} onClick={e=>{e.currentTarget.blur();onChange({...value,enabled:!value.enabled});}}>彩色单词</button>
    <button ref={trigger} className="vocabulary-options" aria-label="彩色单词筛选" title="彩色单词筛选" aria-expanded={open} aria-controls="vocabulary-panel" onClick={e=>{e.currentTarget.blur();setOpen(!open);}}><ChevronDown size={15}/>{error&&<span className="vocabulary-error-dot"/>}</button>
    {open&&<div id="vocabulary-panel" className="vocabulary-panel" role="dialog" aria-label="彩色单词筛选设置" data-editor style={{top:position.top,left:position.left,maxHeight:`calc(100vh - ${position.top+16}px)`}}>
      <header><strong>彩色单词筛选</strong><button aria-label="关闭彩色单词筛选" onClick={()=>{setOpen(false);trigger.current?.focus({preventScroll:true});}}><X size={16}/></button></header>
      <p>{value.enabled?'选择要标注的等级，自动保存。':'彩色单词已关闭。可先选择等级，再点「彩色单词」开启。'}</p>
      <div className="vocabulary-filters" role="group" aria-label="彩色标注等级">
        {[...vocabularyLevels].reverse().map(level=><label key={level} className={'vocabulary-filter level-'+level}>
          <input type="checkbox" checked={value.levels.includes(level)} aria-label={'标注'+vocabularyLabels[level]} onChange={e=>{onChange({...value,levels:e.target.checked?[...value.levels,level]:value.levels.filter(l=>l!==level)});e.currentTarget.blur();}}/>{vocabularyLabels[level]}
        </label>)}
      </div>
      <span className="vocabulary-hint">最低等级优先 · 未选中及其他词为灰色</span>
      {busy&&<span role="status" className="vocabulary-hint">正在标注…</span>}
      {error&&<span role="alert" className="vocabulary-error">{error}<button onClick={retry}>重试标注</button></span>}
      <details className="vocabulary-sources"><summary>词表说明</summary><p>按 N5 → N4 → N3 → N2 → 考研 → N1 取最低等级。分词和词表覆盖可能有遗漏，灰色不等于超纲。JLPT 采用 Open Anki JLPT / Tanos 社区整理词表；考研采用「张小虎在学习」公开的《考研日语 · 高频核心 2200 词》十五篇笔记。均为学习参考，不代表官方完整考纲。</p></details>
    </div>}
    {busy&&value.enabled&&!open&&<span className="sr-only" role="status">正在标注单词</span>}
  </div>;
}
