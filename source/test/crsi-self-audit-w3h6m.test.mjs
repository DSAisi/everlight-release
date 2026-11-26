import test from 'node:test';
import assert from 'node:assert/strict';
import {EverlightCore} from '../core/engine.mjs';
import {approveBoth} from './joint-fixture.mjs';
import {recallContent} from '../core/temporal.mjs';
const scope='personal';
function fact(c,id,key,from,until=null,s=scope){
 const ref=c.source({scope:s,actor:'human',kind:'conversation',source_ref:id,source_id:id,body:{text:id}}).id;
 const p=c.propose({scope:s,slot:'S05',kind:'fact',payload:{statement:id,subject:'project',attribution:'direct',temporal:{key,valid_from:from,valid_until:until}},source_refs:[ref],reason:'synthetic fixture',idempotency_key:id});approveBoth(c,p.id);return c.commit(p.id);
}
const msg=r=>[{role:'system',content:recallContent(r.selected)}];
for(const indexedRecall of [false,true])test('CRSI invalidates previously effective snapshot when same-key conflicting evidence arrives, indexed='+indexedRecall,()=>{
 const c=new EverlightCore(':memory:',{indexedRecall});try{
 const a=fact(c,'project alpha','project:version','2020-01-01T00:00:00Z');
 const r=c.recall({scope,query:'project alpha'});assert.equal(r.selected.find(x=>x.id===a.id).temporal_context.status,'effective');
 assert.equal(c.verifyActualRequest({scope,run_id:r.run_id,messages:msg(r)}).verified,true);
 fact(c,'foreign','project:version','2020-01-01T00:00:00Z',null,'other');
 assert.equal(c.verifyActualRequest({scope,run_id:r.run_id,messages:msg(r)}).verified,true);
 const b=fact(c,'project beta','project:version','2020-01-01T00:00:00Z');
 assert.equal(c.verifyActualRequest({scope,run_id:r.run_id,messages:msg(r)}).verified,false,'a new same-key conflict must invalidate an old effective snapshot');
 const next=c.recall({scope,query:'project'});assert.equal(next.selected.find(x=>x.id===a.id).temporal_context.status,'conflict');assert.equal(next.selected.find(x=>x.id===b.id).temporal_context.status,'conflict');assert.equal(c.verifyActualRequest({scope,run_id:next.run_id,messages:msg(next)}).verified,true);
 c.revoke({scope,kind:'source',target:'project beta',reason:'fixture'});
 assert.equal(c.verifyActualRequest({scope,run_id:next.run_id,messages:msg(next)}).verified,false);
 }finally{c.close();}
});
test('CRSI invalidates a fact that expires between selection and sending',()=>{
 const c=new EverlightCore(':memory:');try{
 const from=new Date(Date.now()-60000).toISOString(),until=new Date(Date.now()+60000).toISOString();
 const a=fact(c,'expiring project','expiry',from,until);const r=c.recall({scope,query:'expiring project'});assert.equal(r.selected.find(x=>x.id===a.id).temporal_context.status,'effective');
 const RealDate=globalThis.Date;const later=RealDate.parse(until)+1000;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[later]));}static now(){return later;}};
 try{assert.equal(c.verifyActualRequest({scope,run_id:r.run_id,messages:msg(r)}).verified,false);}finally{globalThis.Date=RealDate;}
 }finally{c.close();}
});
