import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {EverlightCore} from '../core/engine.mjs';
test('reminder is not delivered until actual model request readback, then source-backed resolution',()=>{const dir=mkdtempSync(path.join(tmpdir(),'everlight87-'));const c=new EverlightCore(path.join(dir,'db.sqlite'));try{
 const a=c.createSharedAction({scope:'personal',kind:'task_nudge',actor:'human',body:'Report task progress with evidence',idempotency_key:'a1'});
 assert.equal(c.sharedActions({scope:'personal'})[0].delivery,null);
 assert.throws(()=>c.proveActionDelivery({scope:'personal',id:a.id,request_ref:'req1',messages:[{role:'system',content:'Report task progress with evidence'}]}));
 c.acknowledgeSharedAction({scope:'personal',id:a.id,actor:'host',receipt_ref:'ack1'});
 assert.throws(()=>c.proveActionDelivery({scope:'personal',id:a.id,request_ref:'req1',messages:[{role:'system',content:'unrelated'}]}));
 assert.throws(()=>c.resolveSharedAction({scope:'personal',id:a.id,actor:'ai',outcome:'reported',source_id:'unknown',idempotency_key:'res1'}));
 const proof=c.proveActionDelivery({scope:'personal',id:a.id,request_ref:'req1',messages:[{role:'system',content:'Report task progress with evidence'}]});assert.equal(proof.host_attested_in_request,true);assert.equal(proof.independently_verified,false);
 assert.equal(c.proveActionDelivery({scope:'personal',id:a.id,request_ref:'req1',messages:[{role:'system',content:'Report task progress with evidence'}]}).idempotent,true);
 assert.throws(()=>c.proveActionDelivery({scope:'personal',id:a.id,request_ref:'req1',messages:[{role:'user',content:'Report task progress with evidence'}]}));
 const source=c.source({scope:'personal',actor:'host',kind:'execution_log',source_ref:'host:log:1',body:{status:'no progress'}});
 const done=c.resolveSharedAction({scope:'personal',id:a.id,actor:'ai',outcome:'no_progress',source_id:source.id,detail:'No execution evidence',idempotency_key:'res1'});
 assert.equal(done.state,'resolved');assert.equal(done.task_state_changed,false);assert.equal(c.sharedActions({scope:'personal'})[0].result.outcome,'no_progress');
 assert.throws(()=>c.resolveSharedAction({scope:'personal',id:a.id,actor:'ai',outcome:'completed',source_id:source.id,idempotency_key:'res2'}));
}finally{c.close();rmSync(dir,{recursive:true,force:true})}});
