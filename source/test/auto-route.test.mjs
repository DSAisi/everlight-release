import {approveBoth} from './joint-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {EverlightCore} from '../core/engine.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'everlight-route-'));
const core=new EverlightCore(join(dir,'core.sqlite'));
test('host capture automatically routes, proposes, but cannot silently approve',()=>{
 const source={scope:'demo',actor:'human',kind:'conversation',source_ref:'conversation:42',body:{text:'我喜欢热茶'},source_id:'observed-42'};
 const event={scope:'demo',event_id:'42-preference',source_id:'observed-42',origin:'host_verified',signal:'explicit_preference',payload:{statement:'喜欢热茶',subject:'human',attribution:'direct_statement'}};
 const r=core.captureAndRoute({source,event});assert.equal(r.proposal.state,'proposed');assert.equal(r.auto_committed,false);assert.equal(core.list({scope:'demo'}).length,0);
 assert.equal(core.captureAndRoute({source,event}).proposal.idempotent,true);
 const p=r.proposal.proposal_id;core.review(p,{decision:'approve',reviewer:'authorized-human'});assert.throws(()=>core.commit(p),/共同批准/);approveBoth(core,p);core.commit(p);
 assert.equal(core.list({scope:'demo'}).length,1);
});
test('unverified photo stays held, never becomes a memory',()=>{
 const source={scope:'demo',actor:'human',kind:'media',source_ref:'photo:1',body:{image_id:'1'},source_id:'photo-source'};
 const event={scope:'demo',event_id:'photo-event',source_id:'photo-source',origin:'host_verified',signal:'consumed_media',payload:{path:'asset:1',version:'1',media_type:'image/png'}};
 const r=core.captureAndRoute({source,event});assert.equal(r.inbox.state,'held');assert.equal(r.proposal,null);
});
test('drain recovers queued events',()=>{
 core.source({scope:'demo',actor:'human',kind:'conversation',source_ref:'conversation:43',body:{text:'tea'},source_id:'s43'});
 core.ingestWriteEvent({scope:'demo',event_id:'e43',source_id:'s43',origin:'host_verified',signal:'explicit_fact',payload:{statement:'tea',subject:'human',attribution:'direct_statement'}});
 const r=core.drainWriteInbox({scope:'demo'});assert.equal(r.results.length,1);assert.equal(r.results[0].state,'proposed');
});
test('cleanup',()=>{core.close();rmSync(dir,{recursive:true,force:true})});
