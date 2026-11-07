import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import kuromoji from 'kuromoji';import {segmentSentences} from '../shared/segmentation';import {validateTimeline} from '../shared/timeline';
const [input,output,root]=process.argv.slice(2);
kuromoji.builder({dicPath:path.join(root,'assets/kuromoji')}).build((error,tokenizer)=>{
 if(error)throw error;
 const request=JSON.parse(fs.readFileSync(input,'utf8'));
 const sentences=segmentSentences(request.sentences,text=>tokenizer.tokenize(text),randomUUID);
 validateTimeline(sentences,request.durationMs);
 fs.writeFileSync(output+'.tmp',JSON.stringify(sentences));fs.renameSync(output+'.tmp',output);
});
