import { spawn } from 'node:child_process';
import path from 'node:path';
export async function backup(root:string,request:any):Promise<any>{return new Promise((resolve,reject)=>{
 const p=spawn(path.join(root,'runtime/python/python.exe'),[path.join(root,'worker/backup.py')],{env:process.env,cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let output='',error='';p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');p.stdout.on('data',data=>output+=data);p.stderr.on('data',data=>error+=data);p.on('error',reject);
 p.on('exit',code=>{try{const value=JSON.parse(output);if(code||value.error)reject(Error(value.error||error));else resolve(value);}catch{reject(Error(error||'课程备份失败'));}});
 p.stdin.end(JSON.stringify({root,...request}));
});}
