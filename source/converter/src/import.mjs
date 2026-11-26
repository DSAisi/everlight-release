import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {createWriteStream} from 'node:fs';
export async function importFile(configPath,name,stream,limit=512*1024*1024){
 const ext=String(name).match(/\.(jsonl|json|txt|csv)(\.gz)?$/i)?.[0].toLowerCase();
 if(!ext)throw Error('仅支持 JSON、JSONL、TXT、CSV 及其 GZ 文件');
 const config=JSON.parse(await fs.readFile(configPath,'utf8'));
 const base=path.dirname(configPath), work=path.resolve(base,config.workDir);
 try{await fs.access(path.join(work,'plan.json'));throw Error('已有转换计划，请使用新工作目录')}catch(e){if(e.code!=='ENOENT')throw e}
 const dir=path.join(base,'imports');await fs.mkdir(dir,{recursive:true,mode:0o700});
 const target=path.join(dir,randomUUID()+ext), temp=target+'.part', ct=configPath+'.'+randomUUID()+'.tmp';let bytes=0;
 try{await pipeline(stream,new Transform({transform(chunk,enc,cb){bytes+=chunk.length;cb(bytes>limit?Error('文件超过上传限制'):null,chunk)}}),createWriteStream(temp,{flags:'wx',mode:0o600}));if(!bytes)throw Error('空文件');await fs.rename(temp,target);config.input=path.relative(base,target);config.format='auto';await fs.writeFile(ct,JSON.stringify(config,null,2),{flag:'wx',mode:0o600});await fs.rename(ct,configPath);return {name:path.basename(name),bytes,input:config.input};}catch(e){await Promise.all([temp,target,ct].map(p=>fs.rm(p,{force:true})));throw e}
}
