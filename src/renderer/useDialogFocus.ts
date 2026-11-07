import {useEffect,useRef} from 'react';
/** Keep keyboard navigation inside the open dialog and restore its initiating control. */
export function useDialogFocus(kind:'editor'|'lookup'|'rename'|undefined,onEscape:()=>void){
 const close=useRef(onEscape);close.current=onEscape;
 useEffect(()=>{
  if(!kind)return;const dialog=document.querySelector<HTMLElement>(kind==='editor'?'.editor':kind==='rename'?'.rename-dialog':'.lookup-card');if(!dialog)return;
  const previous=document.activeElement as HTMLElement|null;
  const controls=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]')).filter(e=>e.getClientRects().length>0);
  (kind==='editor'?dialog.querySelector<HTMLElement>('textarea'):controls()[0])?.focus({preventScroll:true});
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current();return;}
   if(e.key!=='Tab')return;
   const items=controls(),first=items[0],last=items.at(-1);if(!first)return;
   if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last?.focus();}
   else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus();}
  };
  dialog.addEventListener('keydown',key);
  return()=>{dialog.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[kind]);
}
