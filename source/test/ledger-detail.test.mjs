import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {EverlightCore} from '../core/engine.mjs';
test('S01 S02 S10 exact details are scoped, read-only, and revoked S01 hidden',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'everlight-ledger-detail-'));
 const c=new EverlightCore(path.join(dir,'db.sqlite'));
 try{
  const s=c.source({scope:'personal',actor:'human',kind:'message',source_ref:'test:1',body:{text:'hello'}});
  const a=c.ledgerDetail({scope:'personal',slot:'S01',id:s.id});
  assert.equal(a.body.text,'hello');assert.equal(a.read_only,true);
  assert.throws(()=>c.ledgerDetail({scope:'another',slot:'S01',id:s.id}));
  const receipt=c.pageLedger({scope:'personal',slot:'S02'}).rows[0];
  assert.equal(c.ledgerDetail({scope:'personal',slot:'S02',id:receipt.id}).op,'source.ingest');
  const run=c.recall({scope:'personal',query:'hello'});
  const detail=c.ledgerDetail({scope:'personal',slot:'S10',id:run.run_id});
  assert.equal(detail.upstream_submitted,false);
  assert.equal(detail.actual_request_verified,false);
  assert.throws(()=>c.ledgerDetail({scope:'another',slot:'S10',id:run.run_id}));
  c.revoke({scope:'personal',kind:'source',target:s.id,reason:'withdrawn'});
  assert.throws(()=>c.ledgerDetail({scope:'personal',slot:'S01',id:s.id}));
 }finally{c.close();rmSync(dir,{recursive:true,force:true})}
});
