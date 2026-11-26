import {syncSettings} from './settings-sync-h6y.mjs';
import {installInbox,readInbox,inboxKinds,recordConnectAcceptance} from './connect-inbox-w3e.mjs';
import {qualityAudit} from './quality-w1.mjs';
import {timingSafeEqual} from 'node:crypto';
// E12-A: metadata-only, durable change feed. It is not a tool dispatcher or proof of model delivery.
const definitions=[
 {id:'human.message',table:'shared_actions',op:'INSERT',when:"NEW.actor='human' AND NEW.kind IN ('remind_ai','task_nudge','dream_request')",ref:'NEW.id',state:'NEW.kind',at:'NEW.created_at'},
 {id:'review.human',table:'joint_decisions',op:'INSERT',when:"NEW.role='human' AND EXISTS(SELECT 1 FROM proposals p WHERE p.id=NEW.proposal_id AND p.scope=NEW.scope AND p.slot IN ('S03','S04','S05','S06','S07','S08','S09','S11'))",ref:'NEW.proposal_id',state:'NEW.decision',at:'NEW.at'},
 {id:'review.human',table:'joint_decisions',op:'UPDATE',when:"NEW.role='human' AND EXISTS(SELECT 1 FROM proposals p WHERE p.id=NEW.proposal_id AND p.scope=NEW.scope AND p.slot IN ('S03','S04','S05','S06','S07','S08','S09','S11')) AND (NEW.decision IS NOT OLD.decision OR NEW.digest IS NOT OLD.digest)",ref:'NEW.proposal_id',state:'NEW.decision',at:'NEW.at'},
 {id:'task.candidate',table:'proposals',op:'INSERT',when:"NEW.slot='S03'",ref:'NEW.id',state:'NEW.state',at:'NEW.created_at'},
 {id:'task.changed',table:'task_events',op:'INSERT',when:"NEW.actor='human'",ref:'NEW.memory_id',state:'NEW.state',at:'NEW.at'},
 {id:'task.committed',table:'memories',op:'INSERT',when:"NEW.slot='S03'",ref:'NEW.id',state:'NEW.state',at:'NEW.created_at'},
 {id:'dream.changed',table:'dreams',op:'INSERT',when:'1',ref:'NEW.id',state:'NEW.state',at:'NEW.updated_at'},
 {id:'dream.changed',table:'dreams',op:'UPDATE',when:'NEW.state IS NOT OLD.state OR NEW.stage IS NOT OLD.stage',ref:'NEW.id',state:'NEW.state',at:'NEW.updated_at'},
 // W2B: append trigger IDs (do not renumber installed E12A triggers).
 {id:'task.changed',table:'task_events',op:'INSERT',when:"NEW.actor IN ('ai','host') AND EXISTS(SELECT 1 FROM sources s WHERE s.id=NEW.source_id AND s.scope=NEW.scope AND s.revoked=0 AND COALESCE(json_extract(s.body,'$.private'),0)=0 AND COALESCE(json_extract(s.body,'$.sensitive'),0)=0 AND COALESCE(json_extract(s.body,'$.fiction'),0)=0)",ref:'NEW.memory_id',state:'NEW.state',at:'NEW.at'},
 {id:'person.changed',table:'relation_people',op:'INSERT',when:'1',ref:'NEW.id',state:"'registered'",at:'NEW.created_at'},
 {id:'person.changed',table:'relation_aliases',op:'INSERT',when:"NEW.state='confirmed'",ref:'NEW.person_id',state:"'identity_confirmed'",at:'NEW.created_at'},
 {id:'person.changed',table:'relation_names_d8',op:'UPDATE',when:"NEW.state IS NOT OLD.state AND NEW.state IN ('confirmed','retired')",ref:'NEW.person_id',state:'NEW.state',at:'NEW.reviewed_at'},
 {id:'memory.changed',table:'memories',op:'INSERT',when:"NEW.slot IN ('S04','S05','S06','S07','S08','S09','S11') AND NOT EXISTS(SELECT 1 FROM json_each(NEW.sources) j JOIN sources s ON s.id=j.value AND s.scope=NEW.scope WHERE json_extract(s.body,'$.private')=1 OR json_extract(s.body,'$.sensitive')=1 OR json_extract(s.body,'$.fiction')=1)",ref:'NEW.id',state:'NEW.slot',at:'NEW.created_at'},
 {id:'memory.changed',table:'memories',op:'UPDATE',when:"NEW.slot IN ('S04','S05','S06','S07','S08','S09','S11') AND NEW.state IS NOT OLD.state AND NOT EXISTS(SELECT 1 FROM json_each(NEW.sources) j JOIN sources s ON s.id=j.value AND s.scope=NEW.scope WHERE json_extract(s.body,'$.private')=1 OR json_extract(s.body,'$.sensitive')=1 OR json_extract(s.body,'$.fiction')=1)",ref:'NEW.id',state:'NEW.state',at:"strftime('%Y-%m-%dT%H:%M:%fZ','now')"},
 // W3: the same feed also wakes the host for system-originated work. No action body in feed.
 {id:'system.action',table:'shared_actions',op:'INSERT',when:"NEW.actor='host' AND NEW.kind IN ('memory_check','task_nudge','review_request')",ref:'NEW.id',state:'NEW.kind',at:'NEW.created_at'},
 {id:'system.action_state',table:'shared_actions',op:'UPDATE',when:"NEW.actor='host' AND NEW.kind IN ('memory_check','task_nudge','review_request') AND NEW.state IS NOT OLD.state",ref:'NEW.id',state:'NEW.state',at:'NEW.updated_at'},
 {id:'system.action',table:'shared_actions',op:'INSERT',when:"NEW.actor='host' AND NEW.kind='dream_request'",ref:'NEW.id',state:'NEW.kind',at:'NEW.created_at'},
 {id:'system.action_state',table:'shared_actions',op:'UPDATE',when:"NEW.actor='host' AND NEW.kind='dream_request' AND NEW.state IS NOT OLD.state",ref:'NEW.id',state:'NEW.state',at:'NEW.updated_at'},
];
export function installConnect(db){
 db.exec(`CREATE TABLE IF NOT EXISTS connect_events_e12(seq INTEGER PRIMARY KEY AUTOINCREMENT,scope TEXT NOT NULL,kind TEXT NOT NULL,ref TEXT NOT NULL,state TEXT NOT NULL,at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS connect_events_scope_e12 ON connect_events_e12(scope,seq);`);
 for(const [i,d] of definitions.entries())db.exec(`CREATE TRIGGER IF NOT EXISTS connect_e12_${i} AFTER ${d.op} ON ${d.table} WHEN ${d.when} BEGIN INSERT INTO connect_events_e12(scope,kind,ref,state,at) VALUES(NEW.scope,'${d.id}',${d.ref},${d.state},${d.at}); END;`);
}
const same=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
export function createConnectHandler(db,env=process.env,core=null){
 const scope=env.EVERLIGHT_BOUND_SCOPE||'',secret=env.EVERLIGHT_CONNECT_TOKEN||'';
 const enabled=env.EVERLIGHT_CONNECT_ENABLED==='1';
 if(enabled){if(!scope||secret.length<32||Object.entries(env).some(([k,v])=>k.startsWith('EVERLIGHT_')&&k!=='EVERLIGHT_CONNECT_TOKEN'&&k.endsWith('TOKEN')&&v===secret))throw Error('Connect requires bound scope and independent private token');installConnect(db);}else{for(const i of definitions.keys())db.exec(`DROP TRIGGER IF EXISTS connect_e12_${i}`);}
 const inboxEnabled=enabled&&env.EVERLIGHT_CONNECT_INBOX==='1'&&!!core;installInbox(db,inboxEnabled);
 return (req,url,respond)=>{
  if(!url.pathname.startsWith('/api/v8/connect/'))return false;
  if(!enabled)return respond(403,{error:'Connect disabled'}),true;
  if(!same(req.headers.authorization||'','Bearer '+secret))return respond(401,{error:'Unauthorized'}),true;
  if(url.searchParams.has('scope')&&url.searchParams.get('scope')!==scope)return respond(403,{error:'Scope denied'}),true;
  if(url.pathname==='/api/v8/connect/receipt'&&req.method==='POST'){if(!inboxEnabled)return respond(403,{error:'Connect inbox disabled'}),true;(async()=>{try{if(!(req.headers['content-type']||'').startsWith('application/json'))return respond(415,{error:'JSON required'});let chunks=[],n=0;for await(const chunk of req){n+=chunk.length;if(n>4096)return respond(413,{error:'Too large'});chunks.push(chunk);}const b=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!b||Object.keys(b).length!==1||!Object.hasOwn(b,'seq'))return respond(422,{error:'Only seq accepted'});return respond(200,recordConnectAcceptance(core,scope,b.seq));}catch(e){return respond(e.status||422,{error:e.status?e.message:'Invalid receipt'});}})();return true;}
  if(req.method!=='GET')return respond(405,{error:'Read-only Connect grant except scoped receipt'}),true;
  if(url.pathname==='/api/v8/connect/manifest')return respond(200,{version:'RC6.W3A',scope,grant:'connect.events.read',events:[...new Set(definitions.map(x=>x.id))],routes:{events:'/api/v8/connect/events',...(core?{quality:'/api/v8/connect/quality'}:{})},metadata_only:true,...(inboxEnabled?{inbox:{path:'/api/v8/connect/inbox',kinds:inboxKinds,grant:'connect.inbox.scoped_current_content',receipt:{path:'/api/v8/connect/receipt',method:'POST',fields:['seq'],host_attestation_only:true}}}:{}),model_delivery_verified:false,production_approved:false}),true;
  if(url.pathname==='/api/v8/connect/quality'&&core){const {items,...summary}=qualityAudit(core,scope,{limit:1});return respond(200,summary),true;}
  if(url.pathname==='/api/v8/connect/inbox'){if(!inboxEnabled)return respond(403,{error:'Connect inbox disabled'}),true;const after=Number(url.searchParams.get('after')??0),limit=Number(url.searchParams.get('limit')??50);if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>100)return respond(422,{error:'Invalid cursor or limit'}),true;syncSettings(core,scope,env);return respond(200,readInbox(core,scope,after,limit)),true;}
  if(url.pathname!=='/api/v8/connect/events')return respond(404,{error:'Not found'}),true;
  const after=Number(url.searchParams.get('after')??0),limit=Number(url.searchParams.get('limit')??50);
  if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>100)return respond(422,{error:'Invalid cursor or limit'}),true;
  const rows=db.prepare('SELECT seq,kind,ref,state,at FROM connect_events_e12 WHERE scope=? AND seq>? ORDER BY seq LIMIT ?').all(scope,after,limit+1);
  return respond(200,{items:rows.slice(0,limit),next_cursor:rows.slice(0,limit).at(-1)?.seq??after,has_more:rows.length>limit,model_delivery_verified:false}),true;
 };
}
