import {useEffect,useMemo,useRef,useState} from 'react';
import type {Sentence} from '../shared/types';
import type {VocabularySpan} from '../shared/vocabulary';

export function useVocabulary(sentences:Sentence[]|undefined,enabled:boolean){
  const cache=useRef(new Map<string,VocabularySpan[]>());
  const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const texts=useMemo(()=>[...new Set(sentences?.map(s=>s.text)||[])],[sentences]);
  useEffect(()=>{
    let cancelled=false;
    setError('');setBusy(false);
    if(!enabled)return;
    const missing=texts.filter(t=>!cache.current.has(t));if(!missing.length)return;
    setBusy(true);
    void (async()=>{
      try{
        for(let i=0;i<missing.length;){
          if(cancelled)return;
          const batch:string[]=[];let size=0;
          while(i<missing.length&&batch.length<16&&(size+missing[i].length<=24000||!batch.length)){const text=missing[i++];batch.push(text);size+=text.length;}
          let timer:ReturnType<typeof setTimeout>|undefined;
          const rows=await Promise.race([
            window.api.call<VocabularySpan[][]>('vocabulary',{texts:batch}),
            new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('词汇标注暂未完成，可重试；仍可正常播放。')),15000);}),
          ]).finally(()=>clearTimeout(timer));
          if(cancelled)return;
          batch.forEach((text,n)=>cache.current.set(text,rows[n]));
          while(cache.current.size>2000)cache.current.delete(cache.current.keys().next().value!);
          setRevision(n=>n+1);
        }
      }catch(e){if(!cancelled)setError((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /,''));}
      finally{if(!cancelled)setBusy(false);}
    })();
    return()=>{cancelled=true;};
  },[texts,enabled,retry]);
  return {annotations:useMemo(()=>new Map(cache.current),[revision]),busy,error,retry:()=>setRetry(n=>n+1)};
}
