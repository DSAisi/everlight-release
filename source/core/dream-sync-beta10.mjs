import {createHash} from 'node:crypto';
import {eligibleDreamSource,DREAM_INVITATION} from './dream-host-beta09.mjs';
const fail=(m,status=422)=>{throw Object.assign(Error(m),{status})};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const text=(v,n=256)=>typeof v==='string'&&v.trim()&&v.length<=n;
// Same contract in public and internal profiles. Never enable internal modules here.
export function inviteDream(core,{scope,idempotency_key}){
 if(!text(scope)||!text(idempotency_key,128))fail('invalid invitation');
 return core.tx(()=>{
 const existing=core.db.prepare("SELECT id,state FROM shared_actions WHERE scope=? AND kind='dream_request' AND state IN ('queued','acknowledged') ORDER BY created_at DESC LIMIT 1").get(scope);
 if(existing)return {...existing,reused:true,model_delivery_verified:false};
 const prior=core.db.prepare('SELECT id,state FROM shared_actions WHERE scope=? AND idem=?').get(scope,'dream-sync:'+hash([scope,idempotency_key]));
 if(prior)return {...prior,reused:true,model_delivery_verified:false};
 return core.createSharedAction({scope,kind:'dream_request',actor:'human',body:DREAM_INVITATION.replace('现在是宿主提供的空闲整理机会','人类邀请你在合适的空闲时间整理记忆'),idempotency_key:'dream-sync:'+hash([scope,idempotency_key])},true);
 });
}
export function dreamInvitationStatus(core,scope){
 if(!text(scope))fail('scope required');
 const rows=core.db.prepare("SELECT id,state,created_at,updated_at FROM shared_actions WHERE scope=? AND kind='dream_request' ORDER BY created_at DESC,rowid DESC LIMIT 10").all(scope);
 return {inbox_configured:process.env.EVERLIGHT_CONNECT_ENABLED==='1'&&process.env.EVERLIGHT_CONNECT_INBOX==='1',items:rows.map(r=>({...r,host_request_readback:!!core.db.prepare('SELECT 1 FROM action_delivery WHERE scope=? AND action_id=? LIMIT 1').get(scope,r.id),outcome:core.db.prepare('SELECT outcome FROM action_results WHERE scope=? AND action_id=? ORDER BY at DESC LIMIT 1').get(scope,r.id)?.outcome||null,model_delivery_verified:false}))};
}
// A dream may actually revise a canonical memory, but only through existing proposal,
// independent decision and commit machinery. Never manufacture a human approval.
export function dreamRevision(core,{scope,id,target_id,expected_revision,payload,source_refs,reason,idempotency_key}){
 if(![scope,id,target_id,idempotency_key].every(x=>text(x))||!text(reason,1500)||!Number.isInteger(expected_revision)||expected_revision<1||!payload||typeof payload!=='object'||Array.isArray(payload)||!Array.isArray(source_refs)||!source_refs.length||source_refs.length>30||new Set(source_refs).size!==source_refs.length||!source_refs.every(x=>text(x)))fail('invalid revision');
 return core.tx(()=>{
 const job=core.db.prepare('SELECT * FROM dreams WHERE scope=? AND id=?').get(scope,id);if(!job)fail('dream missing',404);
 const snap=JSON.parse(job.snapshot);if(!['completed','awaiting_review','running'].includes(job.state)||job.stage<3||!snap.category||snap.category==='imagined')fail('analyzed evidence dream required',409);
 if(!source_refs.every(s=>snap.source_ids.includes(s)&&eligibleDreamSource(core,scope,s)))fail('revision evidence outside authorized snapshot');
 const idem='dream-revision:'+hash([scope,id,idempotency_key]);
 const old=core.db.prepare('SELECT * FROM proposals WHERE scope=? AND idem=?').get(scope,idem);
 if(old){if(old.target!==target_id||old.expected_revision!==expected_revision||old.payload!==JSON.stringify(payload)||old.sources!==JSON.stringify(source_refs)||old.reason!=='梦境 '+id+'：'+reason)fail('revision request conflict',409);return {id:old.id,state:old.state,idempotent:true,canonicalMemoryChanged:false};}
 const m=core.db.prepare("SELECT * FROM memories WHERE scope=? AND id=? AND revision=? AND state='current'").get(scope,target_id,expected_revision);if(!m)fail('target revision changed',409);
 if(!['S04','S05','S06','S07','S08','S11'].includes(m.slot)||!JSON.parse(m.sources).every(s=>eligibleDreamSource(core,scope,s)))fail('protected target or source',403);
 if(!JSON.parse(m.sources).every(s=>source_refs.includes(s)))fail('retain original provenance');
 if(JSON.stringify(payload)===m.payload)fail('no revision needed');
 const p=core.propose({scope,slot:m.slot,kind:m.kind,payload,source_refs,reason:'梦境 '+id+'：'+reason,target_id,expected_revision,idempotency_key:idem},true);
 core.receipt('dream.revision',scope,p.id,'ok',{job_id:id,target_id,expected_revision});
 return {...p,canonicalMemoryChanged:false,decision:core.jointStatus({scope,id:p.id})};
 });
}
