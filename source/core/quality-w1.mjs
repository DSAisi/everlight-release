import {createHash} from 'node:crypto';
import {errors as contractErrors} from '../protocol/write-contract-d9.mjs';
// Separate quality gate from the legacy API shape toggle. No inference or mutation in audit.
export const strictQuality=()=>process.env.EVERLIGHT_W1_CANONICAL_STRICT==='1';
export function historicalSource(s){try{const b=JSON.parse(s?.body||'{}');return b.historical===true||b.imported===true||b.replay===true||b.migration_provenance?.historical_candidate===true||['historical','import','replay','migration'].includes(b.origin)||/^(historical|legacy_import|migration|replay)(?:$|[:_-])/.test(s?.kind||'');}catch{return false}}
export function historicalTask(c,scope,p,refs){return p.migration_provenance?.historical_candidate===true||refs.some(id=>historicalSource(c.getSource(id,scope)));}
export function proposalQualityErrors(c,p){const payload=JSON.parse(p.payload),source_refs=JSON.parse(p.sources);return [...contractErrors({scope:p.scope,slot:p.slot,kind:p.kind,payload,source_refs,reason:p.reason,idempotency_key:p.idem,target_id:p.target,expected_revision:p.expected_revision}),...(p.slot==='S03'&&['todo','in_progress','blocked'].includes(payload.state)&&historicalTask(c,p.scope,payload,source_refs)?['historical task needs current evidence']:[])];}
export function qualityAudit(c,scope,{limit=50,offset=0}={}){
 if(!scope||!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)throw Object.assign(Error('invalid quality page'),{status:422});
 const db=c.db, counts={},items=[];let total=0,human=0,ai=0,ready=0,otherHuman=0;const owners={};const fingerprint=createHash('sha256');
 const add=(code,ref,slot,owner='system',detail=null)=>{counts[code]=(counts[code]||0)+1;owners[owner]=(owners[owner]||0)+1;fingerprint.update(JSON.stringify([code,ref,slot,owner,detail]));if(total>=offset&&items.length<limit)items.push({code,ref,slot,owner,detail});total++;};
 const envelope=p=>({scope:p.scope,slot:p.slot,kind:p.kind,payload:JSON.parse(p.payload),source_refs:JSON.parse(p.sources),reason:p.reason,idempotency_key:p.idem,target_id:p.target,expected_revision:p.expected_revision});
 for(const p of db.prepare("SELECT * FROM proposals WHERE scope=? AND state IN ('pending','approved_pending_commit') ORDER BY id").iterate(scope)){
  const e=envelope(p);if(!e.source_refs.every(id=>c.getSource(id,scope))){add('proposal_source_invalid',p.id,p.slot);continue;}
  const errors=contractErrors(e);if(errors.length){add('proposal_contract_invalid',p.id,p.slot,'system',errors);continue;}
  if(p.slot==='S03'&&['todo','in_progress','blocked'].includes(e.payload.state)&&historicalTask(c,scope,e.payload,e.source_refs)){add('historical_task_unresolved',p.id,p.slot);continue;}
  const j=c.jointStatus({scope,id:p.id});const valid=j.decisions.filter(d=>d.digest===j.digest);
  if(j.ready){ready++;add('approved_not_committed',p.id,p.slot);continue;}
  if(valid.some(d=>d.decision==='reject'))continue;
  if(!valid.some(d=>d.role==='human')){human++;add('human_review_needed',p.id,p.slot,'human');}
  if(!valid.some(d=>d.role==='ai')){ai++;add('ai_review_needed',p.id,p.slot,'ai');}
 }
 for(const m of db.prepare("SELECT m.*,p.reason,p.idem,p.target,p.expected_revision FROM memories m LEFT JOIN proposals p ON p.id=m.proposal_id AND p.scope=m.scope WHERE m.scope=? AND m.state='current' ORDER BY m.id").iterate(scope)){
  const e=envelope(m);if(!e.source_refs.every(id=>c.getSource(id,scope))){add('memory_source_invalid',m.id,m.slot);continue;}
  const errors=contractErrors(e);if(errors.length)add('memory_contract_invalid',m.id,m.slot,'system',errors);
  if(m.slot==='S03'){
   const t=c.taskBoard({scope,memory_id:m.id,limit:1})[0];if(!t)continue;
   if(t.state==='historical_unresolved')add('historical_task_unresolved',m.id,m.slot,'ai');
   if(['todo','in_progress','blocked'].includes(t.state)&&!t.reporting?.enabled)add('task_reporting_disabled',m.id,m.slot,'system');
   if(t.state==='in_progress'&&!t.events.length)add('task_progress_missing',m.id,m.slot,'ai');
   if(t.state==='done'&&!t.verified)add('task_completion_unverified',m.id,m.slot,'ai');
   if(t.revision>1&&!t.events.length&&db.prepare('SELECT 1 FROM task_events WHERE scope=? AND memory_id=? AND revision<? LIMIT 1').get(scope,m.id,m.revision))add('task_revision_history_needs_reconciliation',m.id,m.slot,'ai');
  }
 }
 for(const p of db.prepare('SELECT id FROM relation_people WHERE scope=? ORDER BY id').iterate(scope)){
  const hit=db.prepare(`SELECT 1 FROM memories m WHERE m.scope=? AND m.slot='S04' AND m.state='current' AND NOT EXISTS (SELECT 1 FROM json_each(m.sources) j WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.id=j.value AND s.scope=m.scope AND s.revoked=0)) AND (json_extract(m.payload,'$.person_id')=? OR json_extract(m.payload,'$.subject_person_id')=? OR EXISTS(SELECT 1 FROM json_each(m.payload,'$.person_ids') WHERE value=?) OR EXISTS(SELECT 1 FROM json_each(m.payload,'$.participant_person_ids') WHERE value=?)) LIMIT 1`).get(scope,p.id,p.id,p.id,p.id);
  if(!hit)add('person_episode_link_unverified',p.id,'S07','ai');
 }
 for(const [table,code] of [['relation_identity_reviews','identity_review_needed'],['relation_names_d8','name_review_needed']])for(const r of db.prepare(`SELECT id,source_id FROM ${table} WHERE scope=? AND state='pending' ORDER BY id`).iterate(scope))if(c.getSource(r.source_id,scope)){otherHuman++;add(code,r.id,'S07','human');}
 // A repeat is not independent canonical evidence. Flag a valid newer source if its
 // original proposal loses provenance, without reviving withdrawn memory or auto-voting.
 for(const r of db.prepare(`SELECT DISTINCT i.event_id,i.proposal_id FROM d11_items i JOIN d11_decisions d ON d.scope=i.scope AND d.event_id=i.event_id JOIN sources s ON s.scope=d.scope AND s.id=d.source_id AND s.revoked=0 LEFT JOIN proposals p ON p.scope=i.scope AND p.id=i.proposal_id WHERE i.scope=? AND i.state='exact_repeat' AND coalesce(p.state,'')<>'rejected' AND NOT EXISTS (SELECT 1 FROM joint_decisions j WHERE j.scope=i.scope AND j.proposal_id=i.proposal_id AND j.decision='reject') AND NOT EXISTS (SELECT 1 FROM memories m JOIN tombstones t ON t.scope=m.scope AND t.kind='memory' AND t.target=m.id WHERE m.scope=i.scope AND m.proposal_id=i.proposal_id) AND (p.id IS NULL OR p.state NOT IN ('pending','approved_pending_commit','committed') OR EXISTS (SELECT 1 FROM json_each(p.sources) j WHERE NOT EXISTS (SELECT 1 FROM sources x WHERE x.scope=i.scope AND x.id=j.value AND x.revoked=0)) OR (p.state='committed' AND NOT EXISTS (SELECT 1 FROM memories m WHERE m.scope=i.scope AND m.proposal_id=p.id AND m.state='current'))) ORDER BY i.event_id,i.proposal_id`).iterate(scope))add('repeat_evidence_needs_reconciliation',r.event_id,null,'ai',{proposal_id:r.proposal_id});
 // A normal classification queue is not a defect, and excluded/revoked sources
 // must not create actionable issues. The counters are dispositions, not semantic coverage.
 const waiting=db.prepare(`SELECT count(*) n FROM write_inbox w JOIN sources s ON s.scope=w.scope AND s.id=w.source_id AND s.revoked=0 WHERE w.scope=? AND w.state='held' AND json_extract(w.event,'$.signal') IN ('unclassified_client_request','unclassified_client_response','explicit_preference') AND NOT EXISTS(SELECT 1 FROM d11_decisions d WHERE d.scope=w.scope AND d.event_id=w.event_id) AND NOT EXISTS(SELECT 1 FROM semantic_results d WHERE d.scope=w.scope AND d.event_id=w.event_id)`).get(scope).n;
 for(const r of db.prepare("SELECT d.event_id,d.state FROM d11_decisions d JOIN sources s ON s.scope=d.scope AND s.id=d.source_id AND s.revoked=0 WHERE d.scope=? AND (d.state='retry' OR (d.state='held' AND d.reason NOT IN ('source_excluded','fiction_or_sensitive'))) ORDER BY d.event_id").iterate(scope))add('classification_'+r.state,r.event_id,null);
 for(const r of db.prepare(`SELECT w.event_id FROM write_inbox w JOIN sources s ON s.scope=w.scope AND s.id=w.source_id AND s.revoked=0 WHERE w.scope=? AND w.state='held' AND NOT EXISTS(SELECT 1 FROM d11_decisions d WHERE d.scope=w.scope AND d.event_id=w.event_id) AND NOT EXISTS(SELECT 1 FROM semantic_results d WHERE d.scope=w.scope AND d.event_id=w.event_id) AND coalesce(json_extract(w.event,'$.signal'),'') NOT IN ('unclassified_client_request','unclassified_client_response','explicit_preference') ORDER BY w.event_id`).iterate(scope))add('write_held',r.event_id,null);

 const dispositions=Object.fromEntries(db.prepare(`SELECT d.state,count(*) n FROM d11_decisions d JOIN sources s ON s.scope=d.scope AND s.id=d.source_id AND s.revoked=0 WHERE d.scope=? GROUP BY d.state`).all(scope).map(r=>[r.state,r.n]));
 const legacy=db.prepare(`SELECT count(*) n FROM semantic_results d JOIN write_inbox w ON w.scope=d.scope AND w.event_id=d.event_id JOIN sources s ON s.scope=w.scope AND s.id=w.source_id AND s.revoked=0 WHERE d.scope=?`).get(scope).n;
 return {scope,at:new Date().toISOString(),counts,owners,issue_fingerprint:fingerprint.digest('hex'),total,items,offset,limit,human_review_needed:human,other_human_review_needed:otherHuman,ai_review_needed:ai,approved_not_committed:ready,strict_quality:strictQuality(),classification_waiting:waiting,classification_dispositions:dispositions,classification_legacy:legacy,repeat_repaired:db.prepare("SELECT count(*) n FROM receipts WHERE scope=? AND op='h6u.repeat_repair' AND result='ok'").get(scope).n,semantic_coverage_verified:false,issue_count_is_not_memory_count:true};
}

// One outstanding aggregate request per scope. No automatic vote, repair, or model delivery claim.
export function queueQualityReview(c,scope){
 const a=qualityAudit(c,scope,{limit:1});const db=c.db;
 return c.tx(()=>{
 if(!a.owners.ai){for(const r of db.prepare("SELECT id FROM shared_actions WHERE scope=? AND idem LIKE 'w1-quality:%' AND state='queued'").all(scope)){db.prepare("UPDATE shared_actions SET state='rejected',updated_at=? WHERE scope=? AND id=?").run(new Date().toISOString(),scope,r.id);c.receipt('shared_action.expired',scope,r.id,'ok',{reason:'no_remaining_ai_quality_issues'});}return {status:'nothing_to_route',delivered:false};}
 const pending=db.prepare("SELECT id FROM shared_actions WHERE scope=? AND idem LIKE 'w1-quality:%' AND state IN ('queued','acknowledged') LIMIT 1").get(scope);
 if(pending)return {status:'existing_request',action_id:pending.id,delivered:false};
 const key='w1-quality:'+scope+':'+a.issue_fingerprint;
 if(db.prepare('SELECT 1 FROM shared_actions WHERE idem=?').get(key))return {status:'already_requested_same_snapshot',delivered:false};
 const r=c.createSharedAction({scope,kind:'memory_check',actor:'host',target:null,body:JSON.stringify({kind:'quality_review',route:'/api/v8/ui/quality',ai_issues:a.owners.ai||0,request:'Check current scoped audit, find original evidence, reconcile task status, report blockers. Do not invent memories, approvals or completion. Technical faults go to operator.'}),idempotency_key:key},true);
 return {status:'queued',action_id:r.id,delivered:false};});
}
