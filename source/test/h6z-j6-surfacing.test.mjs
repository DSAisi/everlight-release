import test from 'node:test';
import assert from 'node:assert/strict';
import {EverlightCore} from '../core/engine.mjs';
import {approveBoth} from './joint-fixture.mjs';
import {personRecallLane} from '../core/relations.mjs';
import {recallRequestContent} from '../core/recall-request-content-w3h6p.mjs';
for(const indexedRecall of [false,true])test(`J6 targeted natural surfacing does not pad with unrelated personal memories indexed=${indexedRecall}`,()=>{
 const old=process.env.EVERLIGHT_W2_PERSON_RECALL;process.env.EVERLIGHT_W2_PERSON_RECALL='1';const c=new EverlightCore(':memory:',{indexedRecall,contextBudget:12000});
 try{const scope='a',a=c.relationPerson({scope,label:'小明'});let n=0;
 const add=summary=>{const key='j6-'+ ++n;const s=c.source({scope,actor:'human',kind:'conversation',source_ref:key,body:{text:summary}});const p=c.propose({scope,slot:'S04',kind:'episode',payload:{summary,participants:['某人'],participant_person_ids:[a.id]},source_refs:[s.id],reason:'fixture',idempotency_key:key});approveBoth(c,p.id);return {...c.commit(p.id),source:s.id};};
 const target=add('数据库迁移'),noise=[add('一起喝茶'),add('海边散步'),add('买了围巾')];
 const q='小明 数据库迁移';const lane=personRecallLane(c,scope,q);assert.deepEqual(lane.rows.map(r=>r.id),[target.id]);assert.equal(lane.activation,'topic_evidence');assert.equal(lane.unfilled_slots,3);
 const run=c.recall({scope,query:q});assert.equal(run.checked.length,12);assert.deepEqual(run.selected.map(r=>r.id),[target.id]);assert.equal(c.verifyActualRequest({scope,run_id:run.run_id,messages:[{role:'system',content:recallRequestContent(run)}]}).verified,true);
 const audit=c.ledgerDetail({scope,slot:'S10',id:run.run_id}).selection_audit;assert.equal(audit.association_lane.activation,'topic_evidence');assert.equal(audit.association_lane.unfilled_slots,3);
 const broad=c.recall({scope,query:'小明'});assert.ok(noise.every(m=>broad.selected.some(r=>r.id===m.id)));assert.equal(broad.lanes.find(l=>l.name==='person-association-w2').activation,'broad_person');
 assert.ok(c.recall({scope,query:'天气'}).selected.length===0);assert.equal(c.recall({scope:'b',query:q}).selected.length,0);
 c.revoke({scope,kind:'source',target:target.source,reason:'withdraw'});assert.equal(c.verifyActualRequest({scope,run_id:run.run_id,messages:[{role:'system',content:recallRequestContent(run)}]}).verified,false);
 }finally{c.close();if(old===undefined)delete process.env.EVERLIGHT_W2_PERSON_RECALL;else process.env.EVERLIGHT_W2_PERSON_RECALL=old;}
});
