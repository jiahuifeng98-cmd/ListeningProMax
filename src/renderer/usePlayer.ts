import { normalizeShortcuts, shortcutAction, type ShortcutAction, type Shortcuts } from '../shared/shortcuts';
import { useEffect, useRef, useState } from 'react';
import type { Lesson, LoopMode } from '../shared/types';
import { targetAt } from '../shared/timeline';
import { normalizePlayback, playbackRange, type PlaybackSettings } from '../shared/playback';
import { currentListeningMode, isListeningMode, listeningModes, type ListeningMode } from '../shared/listeningModes';
export function usePlayer(lesson: Lesson | null, onError: (s:string)=>void, bindings?: Shortcuts, onAction?: (action:ShortcutAction)=>void, preferences?: PlaybackSettings) {
  const prefs=useRef(normalizePlayback(preferences));prefs.current=normalizePlayback(preferences);
  const waiting=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const cancelWait=()=>{if(waiting.current!==undefined){clearTimeout(waiting.current);waiting.current=undefined;}};
  const releaseRowFocus=()=>{const el=document.activeElement;if(el instanceof HTMLElement&&el.matches('.sentence'))el.blur();};
  const keys=useRef(normalizeShortcuts(bindings));keys.current=normalizeShortcuts(bindings);const extra=useRef(onAction);extra.current=onAction;
  const audio = useRef<HTMLAudioElement>(null); const data=useRef(lesson);data.current=lesson;
  const [playing,setPlaying]=useState(false), [position,setPosition]=useState(0), [active,setActive]=useState<string>(), [rate,setRate]=useState(1), [loop,setLoop]=useState<LoopMode>('off');
  const current=useRef<string|undefined>(undefined),loopTarget=useRef<string|undefined>(undefined),mode=useRef<LoopMode>('off'); const lastSeek=useRef(0);
  const leadIn=useRef<string|undefined>(undefined);
  const mark=(id:string|undefined)=>{if(id&&id!==current.current){current.current=id;setActive(id);}};
  useEffect(()=>{
    const a=audio.current;if(!a)return;
    cancelWait();leadIn.current=undefined;
    if(!lesson){a.pause();current.current=undefined;loopTarget.current=undefined;mode.current='off';setPlaying(false);setPosition(0);setActive(undefined);setLoop('off');return;}
    setPosition(lesson.positionMs);setRate(lesson.rate);a.playbackRate=lesson.rate;mode.current=lesson.loop==='sentence'?'sentence':'off';setLoop(mode.current);
    current.current=undefined;setActive(undefined);const initial=lesson.sentences.some(s=>s.id===lesson.selectedId)?lesson.selectedId:lesson.sentences[targetAt(lesson.sentences,lesson.positionMs)]?.id;mark(initial);loopTarget.current=initial;
    const loaded=()=>{a.currentTime=Math.min(lesson.positionMs/1000,Number.isFinite(a.duration)?a.duration:Infinity);};
    a.addEventListener('loadedmetadata',loaded);if(a.readyState>=1)loaded();
    return()=>{cancelWait();a.removeEventListener('loadedmetadata',loaded);};
  },[lesson?.id,lesson?.mediaFile]);
  useEffect(()=>{
    if(!lesson)return;const wasWaiting=waiting.current!==undefined;cancelWait();if(wasWaiting)setPlaying(false);const retained=lesson.sentences.find(s=>s.id===current.current);if(!retained)mark(lesson.sentences[targetAt(lesson.sentences,(audio.current?.currentTime||0)*1000)]?.id);
    loopTarget.current=current.current;
  },[lesson?.version]);
  const seek=(ms:number,id?:string)=>{const a=audio.current,l=data.current;if(!a||!l?.mediaFile)return;const resume=waiting.current!==undefined;cancelWait();const value=Math.max(0,Math.min(l.durationMs,ms));lastSeek.current=performance.now();a.currentTime=value/1000;setPosition(value);const next=id||l.sentences[targetAt(l.sentences,value)]?.id;mark(next);loopTarget.current=next;leadIn.current=id;if(resume)play();};
  const play=()=>{if(data.current?.mediaFile)void audio.current?.play().catch(e=>onError(`音频无法播放：${e.message}`));};
  const toggle=()=>{releaseRowFocus();const a=audio.current;if(waiting.current!==undefined){cancelWait();setPlaying(false);return;}if(a?.paused)play();else a?.pause();};
  const jump=(id:string,startPlaying=true)=>{const l=data.current,s=l?.sentences.find(s=>s.id===id);if(!s||!l)return;const range=playbackRange(s,l.durationMs,prefs.current.padding);if(!range){mark(id);onError('这句还没有可靠时间，可编辑起止时间或点击重新校准。');return;}releaseRowFocus();if(!startPlaying){cancelWait();setPlaying(false);}mark(id);loopTarget.current=id;seek(range.startMs,id);if(startPlaying)play();};
  const step=(delta:number)=>{const l=data.current;if(!l)return;const i=l.sentences.findIndex(s=>s.id===current.current);const s=l.sentences[Math.max(0,Math.min(l.sentences.length-1,i+delta))];if(s)jump(s.id);};
  const changeLoop=(value:LoopMode)=>{releaseRowFocus();const resume=waiting.current!==undefined;cancelWait();mode.current=value;setLoop(value);loopTarget.current=current.current;if(resume)play();};
  const changeRate=(value:number)=>{if(audio.current)audio.current.playbackRate=value;setRate(value);};
  const changeListeningMode=(id:ListeningMode)=>{
    const l=data.current,a=audio.current;if(!l?.mediaFile||!a)return;
    const preset=listeningModes[id];releaseRowFocus();changeRate(preset.rate);
    // Switching between intensive presets must not cancel a pending silent gap.
    // Exiting loop mode resumes logical playback, but never starts paused media.
    if(mode.current!==preset.loop)changeLoop(preset.loop);
    onError(`${preset.label} · ${preset.rate}× · ${preset.loop==='sentence'?'单句循环':'不循环'}`);
    void window.api.call('progress',{id:l.id,rate:preset.rate,loop:preset.loop}).catch(()=>onError('听力模式已切换，但未能保存，下次打开课程时可能恢复原设置。'));
  };
  const restartLoop=()=>{
    const a=audio.current,l=data.current,s=l?.sentences.find(s=>s.id===loopTarget.current);
    if(!a||!l||!s||waiting.current!==undefined)return;
    const range=playbackRange(s,l.durationMs,prefs.current.padding);if(!range)return;
    const restart=()=>{a.currentTime=range.startMs/1000;lastSeek.current=performance.now();setPosition(range.startMs);play();};
    if(!prefs.current.loopPause){restart();return;}
    // Logical transport remains "playing" while audio is silently waiting.
    // Every user seek/pause/switch invalidates this timer.
    const lessonId=l.id,sentenceId=s.id;
    waiting.current=setTimeout(()=>{waiting.current=undefined;if(data.current?.id===lessonId&&mode.current==='sentence'&&loopTarget.current===sentenceId)restart();},500);
    a.pause();a.currentTime=range.endMs/1000;setPosition(range.endMs);setPlaying(true);
  };
  useEffect(()=>{if(waiting.current!==undefined){cancelWait();play();}},[preferences?.padding,preferences?.loopPause]);
  useEffect(()=>{
    let shift=false,used=false;
    const input=(target:EventTarget|null)=>(target as HTMLElement|null)?.closest?.('input:not([type="range"]),textarea,select,[contenteditable="true"],[data-editor]');
    const blocked=(e:KeyboardEvent)=>input(e.target)||document.querySelector('[data-editor]')||e.altKey||e.ctrlKey||e.metaKey||e.isComposing;
    const dispatch=(code:string)=>{
      const action=shortcutAction(keys.current,code);if(!action)return false;
      if(action==='sidebar'){extra.current?.(action);return true;}
      if(!data.current)return false;
      if(isListeningMode(action)){changeListeningMode(action);return true;}
      switch(action){
        case 'play':toggle();break;
        case 'previous':step(-1);break;
        case 'next':step(1);break;
        case 'backward':seek((audio.current?.currentTime||0)*1000-10000);break;
        case 'forward':seek((audio.current?.currentTime||0)*1000+10000);break;
        case 'loop':{const value=mode.current==='off'?'sentence':'off';changeLoop(value);onError(value==='sentence'?'单句循环':'不循环');break;}
        default:extra.current?.(action);
      }return true;
    };
    const down=(e:KeyboardEvent)=>{
      if(e.key==='Shift'){if(!e.repeat){if(shift)used=true;else{shift=true;used=!!blocked(e);}}return;}
      if(shift)used=true;
      if(blocked(e)||e.shiftKey||e.repeat)return;
      if(e.code.startsWith('Numpad')&&!/^[0-9]$/.test(e.key))return;
      if(dispatch(e.code))e.preventDefault();
    };
    const up=(e:KeyboardEvent)=>{if(e.key!=='Shift')return;if(shift&&!used&&!blocked(e))dispatch('Shift');shift=false;used=false;};
    const pointer=()=>{if(shift)used=true;};const drag=(e:PointerEvent)=>{if(e.buttons&&shift)used=true;};const blur=()=>{shift=false;used=false;};
    window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('pointerdown',pointer,true);window.addEventListener('pointermove',drag,true);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('pointerdown',pointer,true);window.removeEventListener('pointermove',drag,true);window.removeEventListener('blur',blur);};
  },[]);
  useEffect(()=>{let lastDisplay=0;const tick=(now:number)=>{
    const a=audio.current,l=data.current;if(!a||!l?.mediaFile)return;
    const ms=a.currentTime*1000;if(now-lastDisplay>50){setPosition(ms);lastDisplay=now;}
    if(a.seeking||a.paused||now-lastSeek.current<=150)return;
    const s=l.sentences.find(s=>s.id===loopTarget.current),range=s&&playbackRange(s,l.durationMs,prefs.current.padding);
    if(mode.current==='sentence'&&s&&range){
      // Keep the selected sentence during both padding regions, even over a neighbour.
      mark(s.id);if(ms>=range.endMs)restartLoop();
      return;
    }
    const leading=l.sentences.find(s=>s.id===leadIn.current);
    if(leading?.startMs!=null&&ms<leading.startMs){mark(leading.id);return;}
    leadIn.current=undefined;const i=targetAt(l.sentences,ms);if(i>=0)mark(l.sentences[i].id);
  };const timer=setInterval(()=>tick(performance.now()),25);return()=>clearInterval(timer);},[]);
  useEffect(()=>{const id=setInterval(()=>{const l=data.current,a=audio.current;if(l&&a)void window.api.call('progress',{id:l.id,positionMs:Math.round(a.currentTime*1000),rate:a.playbackRate,loop:mode.current,selectedId:current.current}).catch(()=>{});},2500);return()=>clearInterval(id);},[]);
  const onEnded=()=>{if(mode.current==='sentence')restartLoop();else setPlaying(false);};
  return {audio,playing,position,active,rate,loop,listeningMode:currentListeningMode(rate,loop),seek,jump,step,toggle,changeLoop,changeRate,changeListeningMode,events:{onPlay:()=>setPlaying(true),onPause:()=>{if(waiting.current===undefined)setPlaying(false);},onEnded,onError:()=>{cancelWait();setPlaying(false);onError('音频加载失败，请重新关联音频或查看任务结果。');}}};
}
