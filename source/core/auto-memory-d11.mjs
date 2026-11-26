import {historicalSource} from './quality-w1.mjs';
import {proposeCanonical} from './write-compiler-w3h6e.mjs';
import {flag} from '../automation/settings-w3h6.mjs';
import * as engineContent from './engine-content-d14e5c2.mjs';
import * as e5a from './semantic-candidates-d14e5a.mjs';
import * as extraAuto from './auto-candidates-d14e2.mjs';
import * as taskAuto from './task-auto-d14e2.mjs';
import * as d13 from './awareness-d13.mjs';
import {createHash} from 'node:crypto';
import {contract,VERSION as D9} from '../protocol/write-contract-d9.mjs';
import {VERSION as D7} from '../protocol/write-template-d7.mjs';
export const PROTOCOL='everlight.auto-memory.d11';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const stamp=()=>new Date().toISOString();
const check=(ok,msg)=>{if(!ok)throw Object.assign(Error('D11: '+msg),{status:422});};
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,allowed)=>obj(v)&&Object.keys(v).every(k=>allowed.includes(k));
const SIGNALS=['unclassified_client_request','unclassified_client_response','explicit_preference'];
// Defense in depth, not a complete sensitive-content detector. Only explicitly opted-in single-pair scopes.
export const protectedText=/密码|口令|密钥|身份证|银行卡|私密|性爱|裸照|角色扮演|假装|剧情|假如|虚构|住址|病历|password|api.?key|secret|credit.?card|role.?play|pretend|fiction|hypothetical|private|medical/i;
export const enabled=()=>flag('EVERLIGHT_AUTO_MEMORY_D11');
function config(scope){check(enabled()&&process.env.EVERLIGHT_STRICT_WRITE_D9==='1'&&flag('EVERLIGHT_CLASSIFIER_OPT_IN')&&!!scope&&scope===process.env.EVERLIGHT_BOUND_SCOPE,'explicit bound scope and strict/transfer opt-in required');const user=process.env.EVERLIGHT_AUTO_MEMORY_D11_USER;const ai=process.env.EVERLIGHT_AUTO_MEMORY_D11_AI;check(user&&ai&&user!==ai&&user.length<=120&&ai.length<=120,'explicit distinct single-pair subject labels required');return {user,ai};}
export function install(db){db.exec(`CREATE TABLE IF NOT EXISTS d11_decisions(scope TEXT NOT NULL,event_id TEXT NOT NULL,source_id TEXT NOT NULL,state TEXT NOT NULL,result_hash TEXT,reason TEXT NOT NULL,attempts INTEGER NOT NULL,next_attempt TEXT,at TEXT NOT NULL,PRIMARY KEY(scope,event_id));
CREATE TABLE IF NOT EXISTS d11_items(scope TEXT NOT NULL,event_id TEXT NOT NULL,ordinal INTEGER NOT NULL,fingerprint TEXT NOT NULL,proposal_id TEXT,state TEXT NOT NULL,PRIMARY KEY(scope,event_id,ordinal));
CREATE INDEX IF NOT EXISTS ix_d11_fp ON d11_items(scope,fingerprint); CREATE INDEX IF NOT EXISTS ix_d11_state ON d11_decisions(scope,state,next_attempt); CREATE INDEX IF NOT EXISTS ix_d11_inbox ON write_inbox(scope,state,event_id); CREATE TABLE IF NOT EXISTS semantic_results(scope TEXT,event_id TEXT,result TEXT,derived_id TEXT,PRIMARY KEY(scope,event_id));`);}
function eligible(c,row){const src=c.getSource(row.source_id,row.scope);if(!src)return null;let body,event;try{body=JSON.parse(src.body);event=JSON.parse(row.event);}catch{return null;}
 const role=src.kind==='client_request'&&src.actor==='gateway-client'?'user':src.kind==='client_response'&&src.actor==='gateway-upstream'?'assistant':null;
 if(!role||!SIGNALS.includes(event.signal)||event.origin!=='host_verified'||event.scope!==row.scope||event.source_id!==row.source_id||body.purpose!=='conversation'||body.private===true||body.sensitive===true||body.fiction===true||body.night===true||!!body.private_consent||body.auto_memory_allowed===false||event.sensitive===true||typeof body.text!=='string'||!body.text.trim()||body.text.length>4000||protectedText.test(body.text))return null;
 if(role==='user'&&event.signal==='unclassified_client_response'||role==='assistant'&&event.signal!=='unclassified_client_response')return null;
 return {src,text:body.text,role,historical:historicalSource(src),followup:typeof body.awareness_request_ref==='string'&&body.awareness_request_ref.startsWith('d13-request:')};}
const record=(c,row,state,digest,reason,attempts=0,next=null)=>c.db.prepare('INSERT INTO d11_decisions VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(scope,event_id) DO UPDATE SET state=excluded.state,result_hash=excluded.result_hash,reason=excluded.reason,attempts=excluded.attempts,next_attempt=excluded.next_attempt,at=excluded.at').run(row.scope,row.event_id,row.source_id,state,digest,reason,attempts,next,stamp());
export function page(c,{scope,cursor='',limit=5}){config(scope);check(typeof cursor==='string'&&Number.isInteger(limit)&&limit>=1&&limit<=100,'invalid page');
 const rows=c.db.prepare(`SELECT w.* FROM write_inbox w LEFT JOIN d11_decisions d ON d.scope=w.scope AND d.event_id=w.event_id LEFT JOIN semantic_results s ON s.scope=w.scope AND s.event_id=w.event_id WHERE w.scope=? AND w.state='held' AND w.event_id>? AND (d.event_id IS NULL OR (d.state='retry' AND d.next_attempt<=?)) AND s.event_id IS NULL AND json_extract(w.event,'$.signal') IN ('unclassified_client_request','unclassified_client_response','explicit_preference') ORDER BY w.event_id LIMIT ?`).all(scope,cursor,stamp(),limit+1);
 const items=[];for(const row of rows.slice(0,limit)){const src=eligible(c,row);if(!src){c.tx(()=>{const existing=c.db.prepare('SELECT state FROM d11_decisions WHERE scope=? AND event_id=?').get(scope,row.event_id);if(!existing||existing.state==='retry')record(c,row,'held',null,'source_excluded');});continue;}items.push({event_id:row.event_id,text:src.text,role:src.role,historical:src.historical,awareness_followup:src.followup,...(taskAuto.enabled()?{task_candidates:taskAuto.candidates(c,scope,src).map(({key,title,state,match_kind})=>({key,title,state,...(match_kind?{match_kind}:{})}))}:{}),...(extraAuto.enabled()?{extra_features:{...extraAuto.features(),...(src.historical?{task_intent:false}:{})}}:{}),...(e5a.features(src.role,src.followup)?{semantic_features:e5a.features(src.role,src.followup)}:{}),result:null});}
 return {protocol:PROTOCOL,items,next_cursor:rows.length>limit?rows[limit-1].event_id:null};}
const firstPerson=/(我|本人|\bI\b|\bmy\b|\bme\b)/i;
const kinds=['fact','preference','affect'];
export function apply(c,{scope,event_id,result}){const labels=config(scope);check(typeof event_id==='string'&&event_id&&keys(result,['protocol','decision','reason','items',...(d13.enabled()?['awareness']:[]),...(taskAuto.enabled()?['task_reports']:[]),...(extraAuto.enabled()?['extra_candidates']:[]),...(e5a.enabled()?['semantic_candidates']:[])])&&result.protocol===PROTOCOL,'invalid result');
 const row=c.db.prepare("SELECT * FROM write_inbox WHERE scope=? AND event_id=? AND state='held'").get(scope,event_id);check(row,'held source required');const data=eligible(c,row);check(data,'source missing/revoked/excluded');
 const {src,text,role}=data;
 check(!data.historical||(!result.awareness?.length&&!result.task_reports?.length&&!result.extra_candidates?.some(x=>x.kind==='goal')),'historical source cannot emit live actions or goals');const digest=hash(result);const subject=labels[role];
 return c.tx(()=>{check(c.getSource(row.source_id,scope),'source unavailable at commit');check(!c.db.prepare('SELECT 1 FROM semantic_results WHERE scope=? AND event_id=?').get(scope,event_id),'legacy classification exists; preserve existing disposition');const prev=c.db.prepare('SELECT * FROM d11_decisions WHERE scope=? AND event_id=?').get(scope,event_id);if(prev&&prev.state!=='retry'){check(prev.result_hash===digest,'decision already recorded');return {state:prev.state,items:c.db.prepare('SELECT ordinal,state,proposal_id FROM d11_items WHERE scope=? AND event_id=? ORDER BY ordinal').all(scope,event_id),awareness:d13.list(c,scope,event_id),idempotent:true,canonicalMemoryChanged:false};}
 if(result.decision==='retry'){check(result.reason==='classifier_failed_or_invalid'&&!Object.hasOwn(result,'items')&&!Object.hasOwn(result,'awareness')&&!Object.hasOwn(result,'task_reports')&&!Object.hasOwn(result,'extra_candidates')&&!Object.hasOwn(result,'semantic_candidates'),'invalid retry');if(prev&&prev.next_attempt>stamp())return {state:'retry',canonicalMemoryChanged:false};const attempts=(prev?.attempts||0)+1;record(c,row,'retry',digest,'classifier_failed_or_invalid',attempts,new Date(Date.now()+Math.min(3600000,30000*2**Math.min(attempts-1,7))).toISOString());return {state:'retry',canonicalMemoryChanged:false};}
 check(['propose','hold','no_change'].includes(result.decision),'invalid decision');
 const awareness=Object.hasOwn(result,'awareness')?(check(result.decision!=='hold','held sources cannot emit reminders'),check(!data.followup||Array.isArray(result.awareness)&&!result.awareness.length,'reminder response must not generate recursive awareness'),d13.collect(c,row,data,result.awareness)):[];
 const task_reports=Object.hasOwn(result,'task_reports')?(check(result.decision!=='hold','held sources cannot report tasks'),taskAuto.applyReports(c,row,data,result.task_reports)):[];
 const extra_candidates=Object.hasOwn(result,'extra_candidates')?(check(result.decision!=='hold','held sources cannot create candidates'),extraAuto.applyCandidates(c,row,data,result.extra_candidates)):[];
 extra_candidates.push(...engineContent.reflectionFromAwareness(c,row,data,result.awareness,extra_candidates));
 const semantic_candidates=Object.hasOwn(result,'semantic_candidates')?(check(result.decision!=='hold','held sources cannot create semantic candidates'),e5a.applySemantic(c,row,data,subject,result.semantic_candidates)):[];
 if(result.decision!=='propose'){check(['no_new_information','ambiguous','fiction_or_sensitive','missing_evidence','conflict'].includes(result.reason)&&Array.isArray(result.items)&&!result.items.length,'invalid disposition');check(result.decision==='no_change'?result.reason==='no_new_information':result.reason!=='no_new_information','reason and disposition mismatch');const state=result.decision==='hold'?'held':[...extra_candidates,...semantic_candidates].some(x=>x.state==='proposed')?'proposed':awareness.length?'awareness_pending':task_reports.length?'task_reported':'no_change';record(c,row,state,digest,result.reason,prev?.attempts||0);c.receipt('d11.disposition',scope,event_id,state,{reason:result.reason});return {state,items:[],awareness,task_reports,extra_candidates,semantic_candidates,canonicalMemoryChanged:false};}
 check(result.reason==='literal_self_report'&&Array.isArray(result.items)&&result.items.length>=1&&result.items.length<=4,'one to four atomic candidates required');
 const seen=new Set(),items=[];
 for(const [ordinal,item] of result.items.entries()){check(keys(item,['kind','category','quote'])&&kinds.includes(item.kind)&&typeof item.quote==='string'&&item.quote.trim()===item.quote&&item.quote.length>=2&&item.quote.length<=800&&text.includes(item.quote)&&firstPerson.test(item.quote),'literal first-person source span required');check(role==='user'||item.kind==='affect','assistant-generated claims not eligible as facts/preferences');const spec=contract(item.kind);check(spec.categories.includes(item.category)&&item.category!=='custom','known category required');const normalized=item.quote.normalize('NFC').replace(/\s+/g,' ').trim();const fp=hash([scope,role,subject,item.kind,normalized,...(item.kind==='affect'?[event_id]:[])]);check(!seen.has(fp),'duplicate within classification');seen.add(fp);
 const prior=c.db.prepare('SELECT i.proposal_id,p.state AS proposal_state FROM d11_items i JOIN proposals p ON p.id=i.proposal_id AND p.scope=i.scope WHERE i.scope=? AND i.fingerprint=? AND i.state=\'proposed\' ORDER BY p.created_at DESC,p.rowid DESC LIMIT 1').get(scope,fp);
 let proposal_id=null,state='proposed';if(prior){proposal_id=prior.proposal_id;state='repeat_requires_review';if(['pending','approved_pending_commit'].includes(prior.proposal_state)){const p=c.proposalDetail({scope,id:proposal_id});if(p.source_valid)state='exact_repeat';}else if(prior.proposal_state==='committed'){const m=c.db.prepare("SELECT sources FROM memories WHERE scope=? AND proposal_id=? AND state='current'").get(scope,proposal_id);if(m&&JSON.parse(m.sources).every(ref=>c.getSource(ref,scope)))state='exact_repeat';}}
 else{const attribution=role==='user'?'User literal self-report; not independently verified':'Generated assistant expression; not independent evidence of emotion';const base={template_version:D7,contract_version:D9,category:item.category,subject,attribution,evidence_status:'reported'};
 const payload=item.kind==='affect'?{...base,expression:item.quote,observed_at:src.at,context:null}:{...base,statement:item.quote,temporal:{key:'d11:'+fp,event_at:null,valid_from:null,valid_until:null}};
 const p=proposeCanonical(c,{scope,slot:spec.slot,kind:item.kind,payload,source_refs:[src.id],reason:'D11 literal source candidate; independent review, not verified fact; observation time is capture time where applicable',idempotency_key:'d11:'+hash([scope,event_id,ordinal,fp])},true);proposal_id=p.id;}
 c.db.prepare('INSERT INTO d11_items VALUES(?,?,?,?,?,?)').run(scope,event_id,ordinal,fp,proposal_id,state);items.push({ordinal,state,proposal_id});}
 const state=[...extra_candidates,...semantic_candidates].some(x=>x.state==='proposed')||items.some(i=>i.state==='proposed')?'proposed':items.some(i=>i.state==='repeat_requires_review')?'held':'exact_repeat';record(c,row,state,digest,'literal_self_report',prev?.attempts||0);c.receipt('d11.disposition',scope,event_id,state,{items:items.map(i=>({state:i.state,proposal_id:i.proposal_id}))});return {state,items,awareness,task_reports,extra_candidates,semantic_candidates,canonicalMemoryChanged:false,requires_review:true};});}
export function status(c,scope){const counts=Object.fromEntries(c.db.prepare('SELECT state,count(*) n FROM d11_decisions WHERE scope=? GROUP BY state').all(scope).map(r=>[r.state,r.n]));const latest=c.db.prepare('SELECT max(at) at FROM d11_decisions WHERE scope=?').get(scope).at;let configured=false;try{config(scope);configured=true;}catch{}return {enabled:enabled(),configured,counts,task_progress:{enabled:taskAuto.enabled()&&configured,events:c.db.prepare("SELECT count(*) n FROM task_events e JOIN sources s ON s.id=e.source_id AND s.scope=e.scope AND s.revoked=0 JOIN memories m ON m.id=e.memory_id AND m.scope=e.scope AND m.revision=e.revision AND m.state='current' WHERE e.scope=? AND e.idem LIKE 'e2-report:%' AND NOT EXISTS (SELECT 1 FROM task_context_sources_d14e6b d WHERE d.scope=e.scope AND d.event_id=e.id AND NOT EXISTS (SELECT 1 FROM sources p WHERE p.scope=d.scope AND p.id=d.source_id AND p.revoked=0))").get(scope).n},engine_content:{enabled:configured&&engineContent.enabled(),coverage:'explicit_authorized_observation_reflection_pair_only'},extra_features:configured?extraAuto.features():{task_intent:false,reflection:false},semantic_features:configured&&e5a.enabled()?{episode:true,skills:true}:{episode:false,skills:false},last_activity:latest,canonical_auto_commit:false,worker_delivery_verified:false,awareness:d13.status(c,scope)};}

// H6U: recover a still-uncommitted literal preference from an independently
// classified exact repeat. Never restore a withdrawn memory or transfer votes.
export function repairRepeatEvidence(c,scope,{limit=20}={}){
 let labels;try{labels=config(scope);}catch{return {repaired:0,enabled:false};}
 if(!flag('EVERLIGHT_W1_QUALITY_NUDGE'))return {repaired:0,enabled:false};
 check(Number.isInteger(limit)&&limit>=1&&limit<=100,'invalid repair limit');
 return c.tx(()=>{
 const db=c.db;let repaired=0;
 const rows=db.prepare(`SELECT i.event_id,i.ordinal,i.fingerprint,i.proposal_id,d.source_id,p.payload,p.sources,p.kind,p.slot,w.event,w.state AS inbox_state
 FROM d11_items i JOIN d11_decisions d ON d.scope=i.scope AND d.event_id=i.event_id
 JOIN write_inbox w ON w.scope=i.scope AND w.event_id=i.event_id AND w.source_id=d.source_id
 JOIN sources s ON s.scope=i.scope AND s.id=d.source_id AND s.revoked=0
 JOIN proposals p ON p.scope=i.scope AND p.id=i.proposal_id
 WHERE i.scope=? AND i.state='exact_repeat' AND p.kind='preference' AND p.slot='S05' AND p.target IS NULL AND p.state IN ('pending','approved_pending_commit')
 AND EXISTS (SELECT 1 FROM json_each(p.sources) j WHERE NOT EXISTS(SELECT 1 FROM sources x WHERE x.scope=p.scope AND x.id=j.value AND x.revoked=0))
 AND NOT EXISTS(SELECT 1 FROM joint_decisions j WHERE j.scope=p.scope AND j.proposal_id=p.id AND j.decision='reject')
 AND NOT EXISTS(SELECT 1 FROM memories m WHERE m.scope=p.scope AND m.proposal_id=p.id)
 ORDER BY d.at,i.event_id,i.ordinal`).all(scope);
 const handled=new Set();
 for(const r of rows){if(repaired>=limit)break;if(handled.has(r.proposal_id))continue;
  const data=eligible(c,{scope,source_id:r.source_id,event:r.event});if(!data||data.role!=='user'||data.historical||data.followup||r.inbox_state!=='held')continue;
  const b=JSON.parse(r.payload),old=JSON.parse(r.sources);if(old.length!==1||old.includes(r.source_id)||b.subject!==labels.user||typeof b.statement!=='string'||!data.text.includes(b.statement)||!firstPerson.test(b.statement)||protectedText.test(b.statement)||b.evidence_status!=='reported'||b.temporal?.event_at!=null||b.temporal?.valid_from!=null||b.temporal?.valid_until!=null)continue;
  const fp=hash([scope,'user',labels.user,'preference',b.statement.normalize('NFC').replace(/\s+/g,' ').trim()]);if(fp!==r.fingerprint||b.temporal?.key!=='d11:'+fp)continue;
  const original=db.prepare("SELECT 1 FROM d11_items WHERE scope=? AND fingerprint=? AND proposal_id=? AND state='proposed'").get(scope,fp,r.proposal_id);if(!original)continue;
  // A previous explicit rejection for this fingerprint is never bypassed by recovery.
  if(db.prepare(`SELECT 1 FROM d11_items i JOIN proposals p ON p.scope=i.scope AND p.id=i.proposal_id WHERE i.scope=? AND i.fingerprint=? AND (p.state='rejected' OR EXISTS(SELECT 1 FROM joint_decisions j WHERE j.scope=p.scope AND j.proposal_id=p.id AND j.decision='reject') OR EXISTS(SELECT 1 FROM memories m WHERE m.scope=p.scope AND m.proposal_id=p.id)) LIMIT 1`).get(scope,fp))continue;
  const p=proposeCanonical(c,{scope,slot:r.slot,kind:r.kind,payload:b,source_refs:[r.source_id],reason:'H6U independently classified surviving literal preference; fresh review required',idempotency_key:'h6u:'+hash([scope,r.proposal_id,r.event_id,r.ordinal,fp])},true);
  db.prepare("UPDATE d11_items SET proposal_id=? WHERE scope=? AND fingerprint=? AND proposal_id=? AND state='exact_repeat'").run(p.id,scope,fp,r.proposal_id);
  db.prepare("UPDATE d11_items SET state='proposed' WHERE scope=? AND event_id=? AND ordinal=?").run(scope,r.event_id,r.ordinal);
  db.prepare("UPDATE d11_decisions SET state='proposed' WHERE scope=? AND event_id=? AND state='exact_repeat'").run(scope,r.event_id);
  c.receipt('h6u.repeat_repair',scope,p.id,'ok',{previous_proposal_id:r.proposal_id,event_id:r.event_id,source_id:r.source_id,review_required:true});handled.add(r.proposal_id);repaired++;
 }
 return {repaired,enabled:true,canonicalMemoryChanged:false};});
}
