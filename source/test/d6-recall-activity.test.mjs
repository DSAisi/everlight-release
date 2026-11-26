import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {EverlightCore} from '../core/engine.mjs';import {approveBoth} from './joint-fixture.mjs';import {recallContent} from '../core/temporal.mjs';
test('D6 historical backfill, distinct indirect runs, live state, reopen and isolation',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'d6-')),file=path.join(dir,'db');let c=new EverlightCore(file);
 try{
  const src=(id,scope='a')=>c.source({scope,actor:'importer',kind:'raw_event',source_ref:id,source_id:id,body:{text:'raw only '+id,who:'human'}});
  src('source');src('unused');src('other','b');
  const add=(key)=>{const p=c.propose({scope:'a',slot:'S05',kind:'fact',payload:{statement:'shared project '+key,subject:key,attribution:'direct'},source_refs:['source'],reason:'fixture',idempotency_key:key});approveBoth(c,p.id);return c.commit(p.id);};
  const m=add('alpha'),m2=add('beta');const source=()=>c.ledgerDetail({scope:'a',slot:'S01',id:'source'}).display;const memory=()=>c.memoryDetail({scope:'a',slot:'S05',id:m.id,display:true}).display;
  assert.equal(source().indirect_selected_count,0);assert.equal(source().direct_status,'not_enabled');assert.equal(source().direct_count,null);
  // Simulate an existing D5 database, with historical recall runs but no D6 index.
  c.db.exec('DROP TRIGGER recall_activity_d6_insert; DROP TRIGGER recall_activity_d6_delete; DROP TRIGGER recall_activity_d6_change; DROP TABLE recall_activity_d6; DROP TABLE recall_activity_meta_d6;');
  const run=c.recall({scope:'a',query:'shared project'});assert.equal(run.selected.length,2);
  assert.equal(c.verifyActualRequest({scope:'a',run_id:run.run_id,messages:[{role:'system',content:recallContent(run.selected)}]}).verified,true);
  const before=c.db.prepare('SELECT id,body,hash,at FROM sources ORDER BY id').all();c.close();c=new EverlightCore(file);
  assert.equal(source().indirect_selected_count,1);assert.equal(source().indirect_snapshot_verified_count,1);assert.equal(memory().selected_count,1);assert.equal(memory().hit_count,1);
  assert.equal(source().recall_history[0].run_id,run.run_id);assert.ok(source().last_indirect_selected);
  assert.equal(c.ledgerDetail({scope:'a',slot:'S01',id:'unused'}).display.indirect_selected_count,0);assert.equal(c.ledgerDetail({scope:'b',slot:'S01',id:'other'}).display.indirect_selected_count,0);assert.throws(()=>c.ledgerDetail({scope:'b',slot:'S01',id:'source'}));
  const run2=c.recall({scope:'a',query:'shared project'});assert.equal(source().indirect_selected_count,2);assert.equal(source().indirect_snapshot_verified_count,1);
  for(let i=0;i<2;i++)assert.equal(c.verifyActualRequest({scope:'a',run_id:run2.run_id,messages:[{role:'system',content:recallContent(run2.selected)}]}).verified,true);
  assert.equal(source().indirect_snapshot_verified_count,2);assert.equal(memory().selected_count,2);
  c.verifyActualRequest({scope:'a',run_id:run2.run_id,messages:[]});assert.equal(source().indirect_snapshot_verified_count,1);
  c.close();c=new EverlightCore(file);assert.equal(source().indirect_selected_count,2);assert.deepEqual(c.db.prepare('SELECT id,body,hash,at FROM sources ORDER BY id').all(),before);
  // Indexed target lookup; no global JSON traversal on detail.
  const plan=c.db.prepare('EXPLAIN QUERY PLAN SELECT * FROM recall_activity_d6 WHERE scope=? AND kind=? AND target=? AND revision=?').all('a','source_indirect','source',0);assert.match(JSON.stringify(plan),/SEARCH/);
  c.revoke({scope:'a',kind:'source',target:'source',reason:'fixture'});assert.throws(()=>source());assert.throws(()=>memory());
 }finally{c.close();fs.rmSync(dir,{recursive:true,force:true})}
});
