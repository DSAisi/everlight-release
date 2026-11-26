import {installSettingsSync,settingsProjection} from './settings-sync-h6y.mjs';
import {notificationFeed} from './notification-feed-d12.mjs';
// Transactional outbox: no body snapshot; current projections are resolved on read.
const stamp="strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const registry=[
 ['action','shared_actions','INSERT','NEW.id',"NEW.actor='human' OR (NEW.actor='host' AND NEW.kind IN ('memory_check','task_nudge','review_request'))"],
 ['action','shared_actions','UPDATE','NEW.id',"NEW.state IS NOT OLD.state AND NEW.state IN ('resolved','rejected') AND (NEW.actor='human' OR NEW.actor='host')"],
 ['task_candidate','proposals','INSERT','NEW.id',"NEW.slot='S03'"],
 ['proposal','proposals','UPDATE','NEW.id',"NEW.state IS NOT OLD.state"],
 ['review','joint_decisions','INSERT','NEW.proposal_id',"NEW.role='human'"],
 ['review','joint_decisions','UPDATE','NEW.proposal_id',"NEW.role='human' AND (NEW.decision IS NOT OLD.decision OR NEW.digest IS NOT OLD.digest OR NEW.reason IS NOT OLD.reason)"],
 ['task_assigned','memories','INSERT','NEW.id',"NEW.slot='S03'"],
 ['task','memories','UPDATE','NEW.id',"NEW.slot='S03' AND NEW.state IS NOT OLD.state"],
 ['task','task_events','INSERT','NEW.memory_id','1'],
 ['task','task_workflow_evidence','INSERT','NEW.memory_id','1'],
 ['task','task_reporting','INSERT','NEW.memory_id','1'],
 ['task','task_reporting','UPDATE','NEW.memory_id','NEW.enabled IS NOT OLD.enabled OR NEW.interval_minutes IS NOT OLD.interval_minutes'],
 ['annotation','dashboard_annotations','INSERT','NEW.record_id','1'],
 ['fact','proposals','INSERT','NEW.id',"NEW.slot='S05' AND NEW.target IS NOT NULL"],
 ['dream','dreams','INSERT','NEW.id','1'],
 ['dream','dreams','UPDATE','NEW.id','NEW.state IS NOT OLD.state OR NEW.stage IS NOT OLD.stage'],
 ['dream','dream_candidate_decisions','INSERT','NEW.job_id','1'],
 ['dream','dream_candidate_decisions','UPDATE','NEW.job_id','NEW.decision IS NOT OLD.decision OR NEW.digest IS NOT OLD.digest'],
 ['governance','governance','INSERT','NEW.scope','1'],
 ['governance','governance','UPDATE','NEW.scope','NEW.epoch IS NOT OLD.epoch'],
 ['person','relation_people','INSERT','NEW.id','1'],
 ['person','relation_names_d8','UPDATE','NEW.person_id','NEW.state IS NOT OLD.state'],
 ['person','relation_identity_reviews','UPDATE','NEW.person_id','NEW.state IS NOT OLD.state'],
 ['observation','cognitive_observations','INSERT','NEW.id',"NEW.module IN ('domains','env')"],
 ['observation','cognitive_observations','UPDATE','NEW.id',"NEW.module IN ('domains','env') AND NEW.withdrawn IS NOT OLD.withdrawn"],
 // Append only: preserve installed trigger identities. Ordinary memory writes are silent metadata sync.
 ['memory','memories','INSERT','NEW.id',"NEW.slot IN ('S04','S05','S06','S07','S08','S09','S11')"],
 ['memory','memories','UPDATE','NEW.id',"NEW.slot IN ('S04','S05','S06','S07','S08','S09','S11') AND NEW.state IS NOT OLD.state"],
 ['human_fact_revision','receipts','INSERT','NEW.subject',"NEW.op='dashboard.fact_revision' AND NEW.result='ok'"],
 ['memory_invalidate','tombstones','INSERT','NEW.scope',"NEW.kind IN ('source','memory')"],
 ['action','shared_actions','INSERT','NEW.id',"NEW.actor='host' AND NEW.kind='dream_request'"],
];
export const inboxKinds=[...new Set(registry.map(x=>x[0])),'settings'];
export function installInbox(db,enabled){
 installSettingsSync(db);
 db.exec(`CREATE TABLE IF NOT EXISTS connect_acceptance_h6w(scope TEXT NOT NULL,seq INTEGER NOT NULL,at TEXT NOT NULL,PRIMARY KEY(scope,seq));CREATE TABLE IF NOT EXISTS connect_inbox_w3e(seq INTEGER PRIMARY KEY AUTOINCREMENT,scope TEXT NOT NULL,kind TEXT NOT NULL,ref TEXT NOT NULL,at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS ix_connect_inbox_w3e ON connect_inbox_w3e(scope,seq);CREATE INDEX IF NOT EXISTS ix_connect_inbox_ref_w3e ON connect_inbox_w3e(scope,kind,ref,seq);`);
 for(const [i,[kind,table,op,ref,when]] of registry.entries()){if(!enabled){db.exec(`DROP TRIGGER IF EXISTS connect_inbox_w3e_${i}`);continue;}db.exec(`CREATE TRIGGER IF NOT EXISTS connect_inbox_w3e_${i} AFTER ${op} ON ${table} WHEN ${when} BEGIN INSERT INTO connect_inbox_w3e(scope,kind,ref,at) VALUES(NEW.scope,'${kind}',${ref},${stamp}); END;`);}
}
const parse=s=>JSON.parse(s);
const safeSlots=new Set(['S03','S04','S05','S06','S07','S08','S09','S11']);
function safeSources(db,scope,ids){return Array.isArray(ids)&&ids.length>0&&ids.every(id=>{const s=db.prepare('SELECT body,revoked FROM sources WHERE scope=? AND id=?').get(scope,id);if(!s||s.revoked)return false;const b=parse(s.body);return !b.private&&!b.sensitive&&!b.fiction&&!b.private_consent&&!b.night&&!b.historical;});}
const omitted=reason=>({active:false,reason,content:null});
function project(core,scope,e){const db=core.db;const get=(sql,...args)=>db.prepare(sql).get(scope,...args);const ready=(content,wake=false)=>({active:true,wake,content});
 if(e.kind==='action'){const a=notificationFeed(core,new URLSearchParams({scope,id:e.ref})).items[0];if(!a||!a.active||a.target==='human')return omitted('inactive_or_human_only');if(a.delivery)return omitted('model_request_already_verified');if(a.kind==='task_nudge'&&a.target){const t=core.taskBoard({scope,memory_id:a.target,limit:1})[0];if(t&&['historical_unresolved','done','verified','cancelled'].includes(t.state))return omitted('inactive_task');}return ready({id:a.id,kind:a.kind,body:a.body,target:a.target,state:a.state},true);}
 if(e.kind==='memory_invalidate')return ready({invalidate_cached_memories:true,refresh_required:true,reason:'privacy_or_source_revocation'},false);
 if(e.kind==='human_fact_revision'){
  const p=get('SELECT * FROM proposals WHERE scope=? AND id=?',e.ref);if(!p||p.slot!=='S05'||!p.target||!safeSources(db,scope,parse(p.sources)))return omitted('restricted_or_invalid_source');
  const m=get("SELECT revision,sources FROM memories WHERE scope=? AND id=? AND slot='S05' AND state='current'",p.target);
  if(!m||m.revision!==p.expected_revision||!safeSources(db,scope,parse(m.sources)))return omitted('target_changed_or_invalid');
  if(!['pending','approved_pending_commit'].includes(p.state))return omitted('proposal_closed');
  const joint=core.jointStatus({scope,id:p.id});const decisions=joint.decisions.filter(v=>v.digest===joint.digest);
  if(decisions.some(v=>v.decision==='reject'||v.role==='ai'))return omitted('decision_recorded');
  return ready({id:p.id,slot:p.slot,target_id:p.target,expected_revision:p.expected_revision,proposed_payload:parse(p.payload),reason:p.reason,source_refs:parse(p.sources),digest:joint.digest,requires_review:true,canonical_memory_changed:false},true);
 }
 if(['proposal','review','task_candidate','fact'].includes(e.kind)){const p=get('SELECT * FROM proposals WHERE scope=? AND id=?',e.ref);if(!p||!safeSlots.has(p.slot)||!safeSources(db,scope,parse(p.sources)))return omitted('restricted_or_invalid_source');if(p.target&&['pending','approved_pending_commit'].includes(p.state)){const current=get("SELECT revision FROM memories WHERE scope=? AND id=? AND state='current'",p.target);if(!current||current.revision!==p.expected_revision)return omitted('target_changed_or_invalid');}const vote=get("SELECT decision,reason,at FROM joint_decisions WHERE scope=? AND proposal_id=? AND role='human'",e.ref);const note=get('SELECT classification,reason,proposal_text FROM proposal_review_notes WHERE scope=? AND proposal_id=?',e.ref);return ready({id:p.id,slot:p.slot,state:p.state,kind:p.kind,payload:parse(p.payload),human_review:vote||note||null,requires_review:p.state==='pending',is_assignment:false},false);}
 if(['task','task_assigned'].includes(e.kind)){const m=get("SELECT * FROM memories WHERE scope=? AND id=? AND state='current' AND slot='S03'",e.ref);if(!m||!safeSources(db,scope,parse(m.sources)))return omitted('restricted_or_invalid_source');const t=core.taskBoard({scope,memory_id:e.ref,limit:1})[0];if(!t)return omitted('missing_task');const current=!['historical_unresolved','done','verified','cancelled'].includes(t.state);const last=t.events.at(-1);const evidence=t.workflow_evidence;const publicEvidence=v=>v&&safeSources(db,scope,[v.source_id]);const latest_event=publicEvidence(last)?{id:last.id,action:last.action,state:last.state,actor:last.actor,at:last.at,source_id:last.source_id,detail:last.detail}:null;const steps=evidence.steps.filter(publicEvidence),deliveries=evidence.deliveries.filter(publicEvidence);return ready({id:t.id,revision:t.revision,title:t.title,category:t.category,state:t.state,owner:t.owner,acceptance:t.acceptance,due_at:t.due_at,reporting:t.reporting,verified:t.verified,is_active_task:current,latest_event,evidence_summary:{steps:steps.length,verified_steps:steps.filter(v=>publicEvidence(v.verification)).length,deliveries:deliveries.length},refresh_required:true},current&&e.kind==='task_assigned');}
 if(e.kind==='memory'){const m=get('SELECT id,revision,slot,state,sources FROM memories WHERE scope=? AND id=? ORDER BY revision DESC LIMIT 1',e.ref);if(!m||!safeSlots.has(m.slot)||!safeSources(db,scope,parse(m.sources)))return omitted('restricted_or_invalid_source');return ready({id:m.id,slot:m.slot,revision:m.revision,state:m.state,refresh_required:true});}
 if(e.kind==='annotation'){const a=get('SELECT * FROM dashboard_annotations WHERE scope=? AND record_id=? ORDER BY updated_at DESC,revision DESC LIMIT 1',e.ref);const m=get("SELECT * FROM memories WHERE scope=? AND id=? AND state='current'",e.ref);if(!a||!m||!safeSlots.has(m.slot)||!safeSources(db,scope,parse(m.sources)))return omitted('restricted_or_invalid_source');return ready({id:e.ref,slot:a.slot,revision:a.revision,review_status:a.review_status,target_revision:a.target_revision,stale:a.target_revision!==m.revision,note:a.target_revision===m.revision?a.note:null},false);}
 if(e.kind==='dream'){const d=get('SELECT id,state,stage,updated_at FROM dreams WHERE scope=? AND id=?',e.ref);return d?ready({...d,private_body_omitted:true}):omitted('missing_dream');}
 if(e.kind==='settings'){const value=settingsProjection(db,scope,e.ref);return value?ready(value,false):omitted('missing_settings');}
 if(e.kind==='governance')return ready(core.governance(scope));
 if(e.kind==='person'){const p=get('SELECT id FROM relation_people WHERE scope=? AND id=?',e.ref);return p?ready({id:p.id,identity_changed:true}):omitted('missing_person');}
 if(e.kind==='observation'){const o=get('SELECT id,module,withdrawn,source_id FROM cognitive_observations WHERE scope=? AND id=?',e.ref);return o&&!o.withdrawn&&safeSources(db,scope,[o.source_id])?ready({id:o.id,module:o.module,changed:true}):omitted('restricted_or_invalid_source');}
 return omitted('unregistered');
}
export function readInbox(core,scope,after,limit){const db=core.db;const rows=db.prepare('SELECT seq,kind,ref,at FROM connect_inbox_w3e WHERE scope=? AND seq>? ORDER BY seq LIMIT ?').all(scope,after,limit+1);const items=rows.slice(0,limit).map(e=>{const newer=db.prepare('SELECT 1 FROM connect_inbox_w3e WHERE scope=? AND kind=? AND ref=? AND seq>? LIMIT 1').get(scope,e.kind,e.ref,e.seq);return {...e,...(newer?omitted('superseded_event'):project(core,scope,e)),model_delivery_verified:false};});return {items,next_cursor:items.at(-1)?.seq??after,has_more:rows.length>limit,model_delivery_verified:false};}

// Host acceptance is a narrow, scoped attestation, not a model or task completion receipt.
export function recordConnectAcceptance(core,scope,seq){const db=core.db;if(!Number.isSafeInteger(seq)||seq<1)throw Object.assign(Error('invalid event seq'),{status:422});return core.tx(()=>{const event=db.prepare('SELECT seq FROM connect_inbox_w3e WHERE scope=? AND seq=?').get(scope,seq);if(!event)throw Object.assign(Error('event not found'),{status:404});db.prepare('INSERT OR IGNORE INTO connect_acceptance_h6w VALUES(?,?,?)').run(scope,seq,new Date().toISOString());return {accepted:true,seq,host_attested:true,model_delivery_verified:false};});}
