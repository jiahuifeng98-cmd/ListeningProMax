// Deterministic 600-frame canvas render; pipe PNGs straight into FFmpeg, no frame dump.
import {chromium} from 'playwright';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';
import {createHash} from 'node:crypto';
const root=process.cwd(),dir=path.resolve('reports/share-20261106'),tmp=path.resolve('cache/promo-render');fs.mkdirSync(tmp,{recursive:true});
if(!process.argv.includes('--stills'))execFileSync(path.resolve('runtime/python/python.exe'),['scripts/design-promo-audio.py','--audio-only'],{cwd:root,windowsHide:true,stdio:'inherit'});
const audioRecord=JSON.parse(fs.readFileSync(path.join(dir,'sound-design.json'),'utf8'));
const edge=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const browser=await chromium.launchPersistentContext(path.join(tmp,'browser'),{executablePath:edge,headless:true,viewport:{width:1440,height:1080},deviceScaleFactor:1,env:{...process.env,TEMP:tmp,TMP:tmp,APPDATA:tmp,LOCALAPPDATA:tmp},args:['--no-first-run','--disable-background-networking','--allow-file-access-from-files']});
let ff;try{
 const page=await browser.newPage();page.on('pageerror',e=>console.error(e));await page.goto(pathToFileURL(path.join(root,'assets/promo/stage.html')).href);await page.evaluate(()=>window.ready);
 const posterTimes=[1.6,4.8,8.2,11.8,15.4,18.8];for(let i=0;i<posterTimes.length;i++){const b=await page.evaluate(t=>window.render(t),posterTimes[i]);fs.writeFileSync(path.join(dir,'film-'+(i+1)+'.png'),Buffer.from(b,'base64'));}
 if(process.argv.includes('--stills')){console.log('Six film preview frames rendered');}else{
 const exe=path.resolve('runtime/python/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
 const target=path.join(dir,'ListeningProMax-宣传片.mp4'),staged=path.join(tmp,'promo-next.mp4');
 const args=['-hide_banner','-y','-f','image2pipe','-framerate','30','-vcodec','png','-i','pipe:0','-i',path.resolve('cache/promo-sfx/master.wav'),'-map','0:v:0','-map','1:a:0','-t','20','-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-profile:v','high','-level','4.1','-r','30','-vf','setsar=1','-c:a','aac','-b:a','320k','-ar','48000','-movflags','+faststart','-metadata','title=ListeningProMax — 一句句听懂','-metadata','comment='+audioRecord.metadataComment,staged];
 ff=spawn(exe,args,{cwd:root,windowsHide:true,stdio:['pipe','ignore','pipe']});let log='';ff.stderr.on('data',b=>{log+=b.toString()});const done=once(ff,'close');ff.stdin.on('error',()=>{});
 for(let f=0;f<600;f++){const data=await page.evaluate(t=>window.render(t),f/30);if(!ff.stdin.write(Buffer.from(data,'base64')))await once(ff.stdin,'drain');if(f%90===0)console.log('FRAME',f,'/ 600');}
 ff.stdin.end();const [code]=await done;fs.writeFileSync(path.join(dir,'render.log'),log);if(code!==0)throw Error('FFmpeg failed: '+log.slice(-2000));fs.renameSync(staged,target);
 const soundFile=path.join(dir,'sound-design.json'),sound=JSON.parse(fs.readFileSync(soundFile,'utf8'));sound.videoSHA256=createHash('sha256').update(fs.readFileSync(target)).digest('hex');sound.videoPacketsUnchanged=false;fs.writeFileSync(soundFile,JSON.stringify(sound,null,2));
 console.log('Rendered 20 seconds, 600 frames, 1440×1080, 30 fps');
 }
}finally{if(ff&&ff.exitCode===null)ff.kill();await browser.close();}
