// Separate worker thread keeps bulk tokenization off the HTTP event loop.
import {Worker,isMainThread,workerData,parentPort} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {indexBatch} from './indexed-retrieval-d14c.mjs';
import {setTimeout as sleep} from 'node:timers/promises';
export function startIndexMaintenance(file,{onError=e=>console.error('D14C index maintenance:',e.message)}={}){const worker=new Worker(new URL(import.meta.url),{workerData:{file}});worker.on('error',onError);worker.on('message',m=>{if(m.error)onError(Error(m.error));});worker.unref();return worker;}
if(!isMainThread){const db=new DatabaseSync(workerData.file);db.exec('PRAGMA busy_timeout=50');let running=true;parentPort.on('message',m=>{if(m==='stop')running=false;});try{while(running){try{const n=indexBatch(db,{limit:64});await sleep(n?100:1000);}catch(e){if(!/busy|locked/i.test(e.message)){parentPort.postMessage({error:e.message});break;}await sleep(1000);}}}finally{db.close();parentPort.close();}}
