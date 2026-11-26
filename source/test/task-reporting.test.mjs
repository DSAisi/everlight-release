import {approveBoth} from './joint-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EverlightCore} from '../core/engine.mjs';
test('durable task reporting schedules nudges but never fabricates task progress',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'everlight-report-'));const file=path.join(dir,'db.sqlite');let c=new EverlightCore(file);
 try{
  const src=c.source({scope:'personal',actor:'human',kind:'conversation',source_ref:'test:1',body:{text:'Please test'}});
  const p=c.propose({scope:'personal',slot:'S03',kind:'goal',reason:'test',idempotency_key:'task-report-proposal',source_refs:[src.id],payload:{summary:'测试任务',owner:'AI',intent:'交付',state:'todo',acceptance:'通过测试'}});
  c.review(p.id,{decision:'approve',reviewer:'human'});const t=(approveBoth(c,p.id),c.commit(p.id));
  for(let i=0;i<105;i++)c.db.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?)').run('fixture-'+i,1,'S03','goal','personal',JSON.stringify({summary:'fixture',owner:'AI',intent:'fixture',state:'todo'}),JSON.stringify([src.id]),'current','2099-01-01T00:00:00.000Z','fixture-'+i);
  assert.ok(!c.taskBoard({scope:'personal'}).some(x=>x.id===t.id));
  assert.throws(()=>c.setTaskReporting({scope:'personal',memory_id:t.id,interval_minutes:1}));
  c.setTaskReporting({scope:'personal',memory_id:t.id,interval_minutes:5});
  assert.equal(c.runTaskReporting({scope:'personal',at:'2100-01-01T00:00:00.000Z'}).processed,1);
  assert.equal(c.sharedActions({scope:'personal'}).length,1);
  assert.equal(c.sharedActions({scope:'personal'})[0].state,'queued');
  assert.equal(c.taskBoard({scope:'personal',memory_id:t.id})[0].state,'todo');
  c.close();c=new EverlightCore(file);assert.equal(c.taskReporting({scope:'personal'})[0].enabled,true);
  assert.equal(c.runTaskReporting({scope:'personal',at:'2100-01-01T00:00:00.000Z'}).processed,0);
  c.taskEvent({scope:'personal',memory_id:t.id,expected_revision:1,action:'complete',state:'done',actor:'ai',source_id:src.id,idempotency_key:'task-done'});
  assert.equal(c.runTaskReporting({scope:'personal',at:'2100-01-01T00:10:00.000Z'}).items[0].status,'disabled_finished_or_missing');
 }finally{c.close();fs.rmSync(dir,{recursive:true,force:true})}
});
