import {approveBoth} from './joint-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import os from 'node:os';import fs from 'node:fs';import path from 'node:path';import {EverlightCore} from '../core/engine.mjs';
test('photo summary: no unverified read, reviewed S12 is recalled in Chinese, revoked source disappears',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'everlight-photo-'));const core=new EverlightCore(path.join(dir,'test.sqlite'));
 try{core.source({scope:'demo',actor:'human',kind:'conversation',source_ref:'msg-1',source_id:'photo-1',body:{image:'media-1'}});
 const request={scope:'demo',event_id:'evt1',source_id:'photo-1',media_ref:'media:1',media_type:'image/jpeg',summary:'海边日落和一只橘猫',observed_at:'2026-11-23T12:00:00Z',model_request_ref:'req1',consumption_receipt:'receipt1',consumed:true};
 assert.throws(()=>core.capturePhotoSummary({...request,consumed:false}),/consumption/);
 const p=core.capturePhotoSummary(request);assert.equal(p.requires_review,true);assert.equal(core.list({scope:'demo',slot:'S12'}).length,0);
 core.review(p.id,{decision:'approve',reviewer:'test-reviewer'});const m=(approveBoth(core,p.id),core.commit(p.id));assert.equal(core.recall({scope:'demo',query:'橘猫在哪里'}).selected[0].id,m.id);
 core.revoke({scope:'demo',kind:'source',target:'photo-1',reason:'test revoke'});assert.equal(core.recall({scope:'demo',query:'橘猫'}).selected.length,0);
 }finally{core.close();fs.rmSync(dir,{recursive:true,force:true})}
});
