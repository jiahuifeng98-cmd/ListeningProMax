// Render the editable SVG through Chromium, then package Windows icon frames.
const {app,BrowserWindow}=require('electron');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),cache=path.join(root,'cache/icon-build');
for(const dir of ['tmp','browser','session','logs'])fs.mkdirSync(path.join(cache,dir),{recursive:true});
process.env.TEMP=process.env.TMP=path.join(cache,'tmp');app.setPath('temp',process.env.TEMP);app.setPath('userData',path.join(cache,'browser'));app.setPath('sessionData',path.join(cache,'session'));app.setAppLogsPath(path.join(cache,'logs'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const folder=path.join(root,'assets/branding'),svg=fs.readFileSync(path.join(folder,'listening-promax.svg'),'utf8');
 const win=new BrowserWindow({width:1024,height:1024,useContentSize:true,show:false,transparent:true,backgroundColor:'#00000000',webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false}});
 await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<style>html,body{margin:0;background:transparent;width:1024px;height:1024px;overflow:hidden}svg{display:block}</style>'+svg));
 const img=await win.webContents.capturePage();if(img.isEmpty())throw Error('Icon render is empty');
 fs.writeFileSync(path.join(folder,'listening-promax.png'),img.toPNG());
 const sizes=[16,24,32,48,64,128,256],frames=sizes.map(size=>img.resize({width:size,height:size,quality:'best'}).toPNG());
 const head=Buffer.alloc(6+sizes.length*16);head.writeUInt16LE(1,2);head.writeUInt16LE(sizes.length,4);let offset=head.length;
 sizes.forEach((size,i)=>{const p=6+i*16;head[p]=head[p+1]=size===256?0:size;head.writeUInt16LE(1,p+4);head.writeUInt16LE(32,p+6);head.writeUInt32LE(frames[i].length,p+8);head.writeUInt32LE(offset,p+12);offset+=frames[i].length;});
 fs.writeFileSync(path.join(folder,'listening-promax.ico'),Buffer.concat([head,...frames]));win.destroy();console.log('Icon PNG and ICO generated:',sizes.join(', '));app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
