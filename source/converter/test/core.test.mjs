import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepare,runChunks,approveCalibration,verifyResults,merge,readInput} from '../src/core.mjs';

async function fixture(count=240){
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'everlight-100k-'));
  const input=path.join(dir,'input.jsonl'), lines=[];
  for(let i=1;i<=count;i++)lines.push(JSON.stringify({id:`m${i}`,conversation_id:i<=120?'a':'b',actor:i%2?'user':'assistant',content:`message ${i}`,timestamp:`2026-01-01T00:${String(i%60).padStart(2,'0')}:00Z`}));
  await fsp.writeFile(input,lines.join('\n')+'\n');
  return {dir,config:{input,workDir:path.join(dir,'work'),format:'jsonl',maxRecords:100000,chunkSize:80,maxChunkChars:24000,contextOverlap:5,calibrationRecords:100,concurrency:4,maxConcurrency:12,retries:2,scope:'personal',fieldMap:{messageId:['id'],conversationId:['conversation_id'],actor:['actor'],text:['content'],happenedAt:['timestamp']},transport:{type:'mock'}}};
}

test('prepare streams and chunks without crossing 100k contract',async()=>{const {config}=await fixture();const plan=await prepare(config);assert.equal(plan.count,240);const chunks=await fsp.readdir(path.join(config.workDir,'chunks'));assert.equal(chunks.length,4);});
test('calibration gate blocks full run and permits it after review',async()=>{const {config}=await fixture();await prepare(config);await assert.rejects(()=>runChunks(config,'full'),/calibration is not approved/);const c=await runChunks(config,'calibration');assert.equal(c.failed,0);await approveCalibration(config,'reviewer','checked temporal and actor labels');const r=await runChunks(config,'full');assert.equal(r.failed,0);const v=await verifyResults(config);assert.equal(v.records,240);const m=await merge(config);assert.equal(m.records,240);});
test('top-level JSON array parser is streaming-compatible',async()=>{const {dir}=await fixture(1);const file=path.join(dir,'array.json');await fsp.writeFile(file,JSON.stringify([{text:'a'},{text:'b, c'},{text:'[x]'}]));const got=[];for await(const x of readInput(file,'json-array'))got.push(x.text);assert.deepEqual(got,['a','b, c','[x]']);});
test('the 100,000 ceiling cannot be configured away',async()=>{const {config}=await fixture(1);config.maxRecords=100001;await assert.rejects(()=>prepare(config),/fixed at 100000/);});

test('RC6 kind and evidence validation',async()=>{const {validateChunkResult}=await import('../src/core.mjs');const chunk={id:'x',primary_source_ids:['a'],messages:[{source_id:'a'}]};const c={slot:'S03',kind:'goal',payload:{summary:'test',owner:'u',intent:'test',state:'unknown'},reason:'source',source_refs:['a']};const result={format:'everlight.batch.result.v1',chunk_id:'x',items:[{source_id:'a',status:'classified',candidates:[c]}]};assert.equal(validateChunkResult(chunk,result),true);c.kind='task';assert.throws(()=>validateChunkResult(chunk,result),/kind\/slot/);c.kind='goal';c.source_refs=['fake'];assert.throws(()=>validateChunkResult(chunk,result),/evidence/);});
test('zero overlap never leaks previous chunk',async()=>{const {config}=await fixture();config.contextOverlap=0;await prepare(config);assert.equal((await fsp.readdir(path.join(config.workDir,'chunks'))).length,4);for(const f of await fsp.readdir(path.join(config.workDir,'chunks'))){const c=JSON.parse(await fsp.readFile(path.join(config.workDir,'chunks',f)));assert.equal(c.messages.length,c.primary_source_ids.length);}});
test('changed model configuration invalidates resume',async()=>{const {config}=await fixture();await prepare(config);config.transport.timeoutMs=100;await assert.rejects(()=>runChunks(config,'calibration'),/Configuration changed/);});
test('reject malformed JSON arrays',async()=>{const {dir}=await fixture(1);for(const input of ['[1,]','[,1]','[1,,2]','[1] garbage']){const file=path.join(dir,'bad.json');await fsp.writeFile(file,input);await assert.rejects(async()=>{for await(const x of readInput(file,'json-array')){} });}});
test('calibration approval binds actual result bytes',async()=>{const {config}=await fixture();await prepare(config);await runChunks(config,'calibration');await approveCalibration(config,'reviewer','checked');const dir=path.join(config.workDir,'calibration','results');const file=path.join(dir,(await fsp.readdir(dir))[0]);const r=JSON.parse(await fsp.readFile(file));r.items[0].status='needs_review';await fsp.writeFile(file,JSON.stringify(r));await assert.rejects(()=>runChunks(config),/evidence changed/);});
test('merge rejects missing plan chunks',async()=>{const {config}=await fixture();await prepare(config);await runChunks(config,'calibration');await approveCalibration(config,'reviewer','checked');await runChunks(config);const dir=path.join(config.workDir,'chunks');await fsp.unlink(path.join(dir,(await fsp.readdir(dir))[0]));await assert.rejects(()=>merge(config),/coverage mismatch/);});
