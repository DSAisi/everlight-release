// Trusted host read-only projection. No notification is a memory or a review decision.
export function notificationFeed(core,q){
 const scope=q.get('scope'), after=q.get('after')||'', id=q.get('id'), limit=Number(q.get('limit')||50);
 if(!scope||!Number.isInteger(limit)||limit<1||limit>100||after.length>256)throw Object.assign(Error('invalid notification page'),{status:400});
 const db=core.db;
 const rows=id?db.prepare('SELECT * FROM shared_actions WHERE scope=? AND id=?').all(scope,id):db.prepare("SELECT * FROM shared_actions WHERE scope=? AND id>? AND state IN ('queued','acknowledged') ORDER BY id LIMIT ?").all(scope,after,limit+1);
 function active(a){if(!['queued','acknowledged'].includes(a.state)||!core.reviewReminderActive(a))return false;
  if(a.kind==='review_request'&&!a.idem.startsWith('review-reminder:'))return false;
  if(a.kind==='task_nudge'&&a.body.startsWith('定时进度检查')){try{const t=JSON.parse(a.body.slice(a.body.indexOf('：')+1));const task=core.taskBoard({scope,memory_id:a.target,limit:1})[0];return !!task&&!['done','verified','cancelled'].includes(task.state)&&task.revision===t.expected_revision;}catch{return false;}}
  if(a.kind==='memory_check'&&a.idem.startsWith('d7-write:'))return !!db.prepare("SELECT 1 FROM write_inbox w JOIN sources s ON s.id=w.source_id AND s.scope=w.scope AND s.revoked=0 WHERE w.scope=? AND w.event_id=? AND w.state='held'").get(scope,a.target);
  return true;
 }
 return {items:rows.slice(0,limit).map(a=>({id:a.id,scope:a.scope,kind:a.kind,target:a.target,actor:a.actor,state:a.state,body:a.body,created_at:a.created_at,ack_ref:a.ack_ref,active:active(a),delivery:db.prepare('SELECT request_ref FROM action_delivery WHERE scope=? AND action_id=? ORDER BY at DESC LIMIT 1').get(scope,a.id)||null})),next:!id&&rows.length>limit?rows[limit-1].id:null};
}
// Read-only current exceptional events. Never exports raw memory, photo or night content.
export function notificationEvents(core,q){
 const scope=q.get('scope'),after=q.get('after')||'',limit=Number(q.get('limit')||50);
 if(!scope||!Number.isInteger(limit)||limit<1||limit>100||after.length>512)throw Object.assign(Error('invalid event page'),{status:400});
 const db=core.db;
 const sql=`SELECT * FROM (
 SELECT 'dream:'||id||':'||state AS key,id AS ref,'dream_'||state AS type,updated_at AS at FROM dreams WHERE scope=? AND state IN ('awaiting_review','completed')
 UNION ALL SELECT 'identity:'||id,id,'identity_pending',created_at FROM relation_identity_reviews r WHERE scope=? AND state='pending' AND EXISTS (SELECT 1 FROM sources s WHERE s.scope=r.scope AND s.id=r.source_id AND s.revoked=0)
 UNION ALL SELECT 'name:'||id,id,'name_pending',created_at FROM relation_names_d8 r WHERE scope=? AND state='pending' AND EXISTS (SELECT 1 FROM sources s WHERE s.scope=r.scope AND s.id=r.source_id AND s.revoked=0)
 UNION ALL SELECT 'retry:'||event_id,event_id,'classification_retry',at FROM d11_decisions d WHERE scope=? AND state='retry' AND attempts>=3 AND EXISTS (SELECT 1 FROM sources s WHERE s.scope=d.scope AND s.id=d.source_id AND s.revoked=0)
 UNION ALL SELECT 'conflict:'||event_id,event_id,'classification_conflict',at FROM d11_decisions d WHERE scope=? AND state='held' AND reason='conflict' AND EXISTS (SELECT 1 FROM sources s WHERE s.scope=d.scope AND s.id=d.source_id AND s.revoked=0)
 ) WHERE key>? ORDER BY key LIMIT ?`;
 const rows=db.prepare(sql).all(scope,scope,scope,scope,scope,after,limit+1);
 return {items:rows.slice(0,limit),next:rows.length>limit?rows[limit-1].key:null};
}
