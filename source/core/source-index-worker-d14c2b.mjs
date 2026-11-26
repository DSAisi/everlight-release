import {Worker,isMainThread,workerData,parentPort} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {sourceIndexBatch} from './source-index-d14c2b.mjs';
import {setTimeout as sleep} from 'node:timers/promises';
export function startSourceIndex(file,scope,{onError=e=>console.error('S01 index:',e.message)}={}){const w=new Worker(new URL(import.meta.url),{workerData:{file,scope}});w.on('error',onError);w.on('message',m=>{if(m.error)onError(Error(m.error))});w.unref();return w}
if(!isMainThread){const db=new DatabaseSync(workerData.file);db.exec('PRAGMA busy_timeout=50');let running=true;parentPort.on('message',m=>{if(m==='stop')running=false});try{while(running){try{const n=sourceIndexBatch(db,workerData.scope);await sleep(n?100:1000)}catch(e){if(!/busy|locked/i.test(e.message)){parentPort.postMessage({error:e.message});break}await sleep(1000)}}}finally{db.close();parentPort.close()}}
