import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {EverlightCore} from '../core/engine.mjs';
test('status separates system ledgers from canonical counts and never truncates at 500',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'everlight-status-'));
 try{
  const core=new EverlightCore(path.join(dir,'db.sqlite'));
  const src=core.source({scope:'personal',actor:'tester',kind:'message',source_ref:'chat-1',body:{text:'hello'}});
  assert.equal(core.status('personal').ledger_counts.S01,1);
  assert.equal(core.status('other').ledger_counts.S01,0);
  assert.equal(core.status('personal').counts.S01,0);
  const stmt=core.db.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?)');
  for(let i=0;i<510;i++)stmt.run('m'+i,1,'S05','fact','personal',JSON.stringify({statement:'s',subject:'x',attribution:'user'}),JSON.stringify([src.id]),'current',new Date().toISOString(),'p'+i);
  assert.equal(core.status('personal').counts.S05,510);
  core.db.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});
