import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepare,verifyResults,runChunks,approveCalibration,merge,ABSOLUTE_MAX_RECORDS} from '../src/core.mjs';

const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'everlight-contract-100k-'));
const input=path.join(dir,'input.jsonl');
const handle=await fsp.open(input,'w');
for(let i=1;i<=ABSOLUTE_MAX_RECORDS;i++){
  await handle.write(`${JSON.stringify({id:`m${i}`,conversation_id:'full-100k',actor:i%2?'fixture-human':'partner',content:`synthetic contract record ${i}`,timestamp:new Date(1704067200000+i*1000).toISOString()})}\n`);
}
await handle.close();
const config={input,workDir:path.join(dir,'work'),format:'jsonl',maxRecords:100000,chunkSize:80,maxChunkChars:24000,contextOverlap:5,calibrationRecords:1000,concurrency:8,maxConcurrency:12,retries:3,fieldMap:{messageId:['id'],conversationId:['conversation_id'],actor:['actor'],text:['content'],happenedAt:['timestamp']},transport:{type:'mock'}};
const started=Date.now();
const plan=await prepare(config);
const chunkFiles=(await fsp.readdir(path.join(config.workDir,'chunks'))).filter(x=>x.endsWith('.json'));
assert.equal(plan.count,100000);
assert.equal(plan.max_records,100000);
assert.equal(chunkFiles.length,1250);
const normalized=(await fsp.readFile(path.join(config.workDir,'normalized.jsonl'),'utf8')).trim().split('\n');
assert.equal(normalized.length,100000);
assert.equal(JSON.parse(normalized[0]).seq,1);
assert.equal(JSON.parse(normalized.at(-1)).seq,100000);
const preRun=await verifyResults(config);
assert.equal(preRun.records,100000);
await runChunks(config,"calibration"); await approveCalibration(config,"synthetic-test","mock only"); const run=await runChunks(config); assert.equal(run.failed,0); assert.equal((await runChunks(config)).skipped,1250); assert.equal((await merge(config)).records,100000);
await handleFileAppend(input,JSON.stringify({id:'m100001',conversation_id:'full-100k',actor:'fixture-human',content:'must be rejected'})+'\n');
const overflowConfig={...config,workDir:path.join(dir,'overflow-work')};
await assert.rejects(()=>prepare(overflowConfig),/100001 > 100000/);
await assert.rejects(()=>fsp.access(path.join(overflowConfig.workDir,'normalized.jsonl')));
console.log(JSON.stringify({status:'PASS',records:plan.count,chunks:chunkFiles.length,first_seq:1,last_seq:100000,record_100001:'REJECTED_ATOMICALLY',elapsed_ms:Date.now()-started},null,2));

async function handleFileAppend(file,text){const h=await fsp.open(file,'a');try{await h.write(text);}finally{await h.close();}}
