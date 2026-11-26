import {settingsSyncStatus} from './settings-sync-h6y.mjs';
import {continuityView} from './continuity-w3h6b.mjs';
import {qualityAudit} from './quality-w1.mjs';
import {notificationFeed} from './notification-feed-d12.mjs';
export function panelMainline(core,scope,name){
 const base={scope,read_at:new Date().toISOString(),production_approved:false};
 if(name==='notifications'){
  const q=qualityAudit(core,scope,{limit:1});
  const hasConnect=!!core.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='connect_acceptance_h6w'").get();
  const recent=core.db.prepare('SELECT id FROM shared_actions WHERE scope=? ORDER BY created_at DESC,id DESC LIMIT 50').all(scope);
  const items=recent.flatMap(({id})=>notificationFeed(core,new URLSearchParams({scope,id})).items).filter(a=>a.target!=='human').map(({id,kind,state,actor,created_at,active,delivery})=>({id,kind,state,actor,created_at,active,request_verified:!!delivery,connect_host_accepted:hasConnect&&!!core.db.prepare("SELECT 1 FROM connect_inbox_w3e i JOIN connect_acceptance_h6w a ON a.scope=i.scope AND a.seq=i.seq WHERE i.scope=? AND i.kind='action' AND i.ref=? LIMIT 1").get(scope,id)}));
  const memory_changes=hasConnect?core.db.prepare(`SELECT i.seq,i.kind,i.ref,i.at,a.at AS host_accepted_at,p.state AS proposal_state,p.target AS target_id,p.expected_revision FROM connect_inbox_w3e i LEFT JOIN connect_acceptance_h6w a ON a.scope=i.scope AND a.seq=i.seq LEFT JOIN proposals p ON i.kind='human_fact_revision' AND p.scope=i.scope AND p.id=i.ref WHERE i.scope=? AND i.kind IN ('human_fact_revision','memory_invalidate') ORDER BY i.seq DESC LIMIT 50`).all(scope).map(v=>({...v,model_delivery_verified:false})):[];
  return {...base,memory_changes,settings_sync:settingsSyncStatus(core.db,scope),continuity:continuityView(core,scope),quality:{human:q.human_review_needed,person:q.other_human_review_needed,ai:q.owners.ai||0,system:q.owners.system||0,total:q.total,classification_waiting:q.classification_waiting,classification_dispositions:q.classification_dispositions,classification_legacy:q.classification_legacy,repeat_repaired:q.repeat_repaired,semantic_coverage_verified:q.semantic_coverage_verified},items,limit:50};
 }
 throw Object.assign(Error('Unknown panel'),{status:404});
}
