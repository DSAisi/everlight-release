import {compileCanonical,eventEvidenceLinks} from './write-compiler-w3h6e.mjs';
// Current-state projection over S01 sources, not a new canonical memory library.
import {flag,preferenceChangedAt} from '../automation/settings-w3h6.mjs';
import {createHash} from 'node:crypto';
import {historicalSource} from './quality-w1.mjs';
import {preferences} from '../automation/settings-w3h6.mjs';
const H=3600000;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function enabled(scope){return scope===process.env.EVERLIGHT_BOUND_SCOPE&&flag('EVERLIGHT_H6_CONTINUITY');}
export function installContinuity(db){db.exec(`CREATE TABLE IF NOT EXISTS continuity_w3h6b(scope TEXT NOT NULL,dimension TEXT NOT NULL,source_id TEXT NOT NULL,kind TEXT NOT NULL,state TEXT NOT NULL,observed_at INTEGER NOT NULL,due_at INTEGER,expires_at INTEGER NOT NULL,episode_id TEXT NOT NULL,PRIMARY KEY(scope,dimension)); CREATE TABLE IF NOT EXISTS continuity_runs_w3h6b(run_id TEXT PRIMARY KEY,scope TEXT NOT NULL,query TEXT NOT NULL,snapshot TEXT NOT NULL); CREATE TABLE IF NOT EXISTS continuity_transitions_h6c(scope TEXT NOT NULL,source_id TEXT NOT NULL,episode_id TEXT NOT NULL,kind TEXT NOT NULL,state TEXT NOT NULL,observed_at INTEGER NOT NULL,due_at INTEGER,dependencies TEXT NOT NULL,PRIMARY KEY(scope,source_id));`);}
// Intentionally conservative initial recognizer. It does not infer identity, medical facts,
// promises, location or completion from hypotheticals or arbitrary classifier text.
const definitions=[
 {kind:'work',dimension:'activity',start:/^(?:我(?:现在|正在)?(?:在|正)?上班(?:中|呢)?|我正在工作)(?:[，,](?:还有|再)([1-9]|1[0-2])小时下班)?[。！!]?$/u,end:/^(?:我(?:已经|刚刚|刚)?下班了|我工作结束了)[。！!]?$/u,cue:/上班|下班|工作/u,label:'上班'},
 {kind:'travel',dimension:'activity',start:/^我(?:现在|正在)?(?:在路上|在出差|正在出行)(?:呢)?[。！!]?$/u,end:/^我(?:已经|刚刚|刚)?(?:到家了|到了|到目的地了|结束出差了)[。！!]?$/u,cue:/路上|出行|到家|出差|到了/u,label:'出行'},
 {kind:'study',dimension:'activity',start:/^我(?:现在|正在)?(?:在学习|在上课|在复习)(?:呢)?[。！!]?$/u,end:/^我(?:已经|刚刚|刚)?(?:下课了|学完了|复习完了)[。！!]?$/u,cue:/学习|上课|下课|复习/u,label:'学习'},
 {kind:'waiting',dimension:'waiting',start:/^我(?:现在|正在)?(?:在等结果|在等消息|在等回复)(?:呢)?[。！!]?$/u,end:/^我(?:已经|刚刚|刚)?(?:收到结果了|收到回复了|收到消息了|不等了)[。！!]?$/u,cue:/等结果|等消息|等回复|收到|结果|回复/u,label:'等待结果'}
];
const def=k=>definitions.find(x=>x.kind===k);
function parseBody(s){try{return JSON.parse(s?.body)}catch{return null}}
function safe(s){if(!s||s.revoked||historicalSource(s)||s.actor!=='gateway-client'||s.kind!=='client_request')return null;const b=parseBody(s);if(!b||typeof b!=='object'||b.continuity_live!==true||b.purpose!=='conversation'||b.attribution!=='configured_conversation_unverified'||typeof b.text!=='string'||['private','sensitive','fiction','historical','night','private_consent','happened_at','occurred_at','observed_at'].some(k=>b[k]))return null;return b;}
// A short answer is only interpreted after a persisted, bound gateway question.
const questions={work:/^(?:你)?(?:还有多久下班|还有几小时下班|多久下班)[？?]$/u,travel:/^(?:你)?(?:还有多久到|还有几小时到)[？?]$/u,study:/^(?:你)?(?:还有多久学完|还有几小时学完)[？?]$/u,waiting:/^(?:你)?(?:还要等多久|还有几小时出结果)[？?]$/u};
const duration=/^(?:还有|再|大概|约)?([1-9]|1[0-2]|一|二|两|三|四|五|六|七|八|九|十|十一|十二)(?:个)?小时(?:左右)?[。！!]?$/u;
function dependencies(c,scope,source){const row=c.db.prepare('SELECT dependencies FROM continuity_transitions_h6c WHERE scope=? AND source_id=?').get(scope,source);return row?JSON.parse(row.dependencies):[];}
function validRow(c,r){return !!safe(c.getSource(r.source_id,r.scope))&&dependencies(c,r.scope,r.source_id).every(id=>!!c.getSource(id,r.scope));}
function contextUpdate(c,scope,b,at){const m=duration.exec(b.text.trim()),ctx=b.continuity_context;if(!m||!ctx||typeof ctx.request_source_id!=='string'||typeof ctx.reply_source_id!=='string')return null;
 const q=c.getSource(ctx.request_source_id,scope),reply=c.getSource(ctx.reply_source_id,scope),qb=safe(q),rb=parseBody(reply);
 if(!qb||!reply||reply.actor!=='gateway-upstream'||reply.kind!=='client_response'||rb?.purpose!=='conversation'||rb.continuity_reply_to!==q.id||rb.awareness_request_ref||typeof rb.text!=='string'||Date.parse(q.at)>Date.parse(reply.at)||Date.parse(reply.at)>at||at-Date.parse(reply.at)>30*60000)return null;
 const matches=rows(c,scope).filter(r=>r.source_id===q.id&&r.state==='reported_active'&&r.expires_at>at&&questions[r.kind]?.test(rb.text.trim()));if(matches.length!==1)return null;
 const old=matches[0];return {old,hours:Number(m[1])||({一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,十一:11,十二:12})[m[1]],deps:[...new Set([...dependencies(c,scope,q.id),q.id,reply.id])]};
}
function save(c,scope,sourceId,d,old,at,{end=false,hours=null,deps=[],same=false}={}){
 const episode=same?old.episode_id:hash([scope,d.dimension,sourceId]);const due=end?null:hours?at+hours*H:same?old.due_at:at+4*H;const expires=end?at+12*H:Math.max(at+12*H,due+2*H,same?old.expires_at:0);
 const state=end?'reported_ended':'reported_active';
 c.db.prepare('INSERT INTO continuity_w3h6b VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(scope,dimension) DO UPDATE SET source_id=excluded.source_id,kind=excluded.kind,state=excluded.state,observed_at=excluded.observed_at,due_at=excluded.due_at,expires_at=excluded.expires_at,episode_id=excluded.episode_id').run(scope,d.dimension,sourceId,d.kind,state,at,due,expires,episode);
 c.db.prepare('INSERT INTO continuity_transitions_h6c VALUES(?,?,?,?,?,?,?,?)').run(scope,sourceId,episode,d.kind,state,at,due,JSON.stringify(deps));
 c.receipt('continuity.observe',scope,sourceId,'ok',{dimension:d.dimension,kind:d.kind,state,episode_id:episode,dependencies:deps,canonical_memory_changed:false});
 if(end&&same)archiveEpisode(c,scope,episode,sourceId,d,deps);
}
// Evidence-preserving episode compilation. Only current, explicitly closed episodes;
// no invented time, no automatic task completion, no bypass of normal review.
function archiveEpisode(c,scope,episode,endId,d,deps){
 const subject=process.env.EVERLIGHT_AUTO_MEMORY_D11_USER;
 if(!subject||subject.length>120||!flag('EVERLIGHT_AUTO_MEMORY_D11')||!flag('EVERLIGHT_CLASSIFIER_OPT_IN')||!preferences(scope).find(x=>x.key==='memory')?.effective)return;
 const refs=[...new Set([...deps,endId])];
 const reports=refs.map(id=>c.getSource(id,scope)).filter(s=>safe(s));
 if(reports.length<2||refs.some(id=>!c.getSource(id,scope)))return;
 const summary='当事人自述（未独立核验）：'+reports.map(s=>safe(s).text).join(' → ');
 c.db.exec('SAVEPOINT continuity_archive');
 try{
  const p=c.propose(compileCanonical(c,{scope,kind:'episode',fields:{category:d.kind==='work'?'work':d.kind==='study'?'learning':'daily',summary,participants:[subject],happened_at:null,time_unknown_reason:'只知道自述记录时间，不推断实际开始及结束时间',outcome:'当事人自述：'+safe(c.getSource(endId,scope)).text},source_refs:refs,reason:'H6D automatic closed continuity episode; normal governance required',idempotency_key:'continuity-archive:'+episode}),true);
  c.receipt('continuity.archive',scope,episode,'ok',{proposal_id:p.id,canonical_memory_changed:false});
  c.db.exec('RELEASE continuity_archive');
 }catch(e){c.db.exec('ROLLBACK TO continuity_archive; RELEASE continuity_archive');c.receipt('continuity.archive',scope,episode,'held',{reason:'archive compilation failed',canonical_memory_changed:false});}
}
// Read through existing proposal, memory and task state, not a duplicate state store.
function episodeLinks(c,scope,episode){
 const transitions=c.db.prepare('SELECT source_id,dependencies FROM continuity_transitions_h6c WHERE scope=? AND episode_id=?').all(scope,episode);
 const refs=[...new Set(transitions.flatMap(r=>[r.source_id,...JSON.parse(r.dependencies)]))].filter(id=>!!c.getSource(id,scope));
 const p=c.db.prepare('SELECT id,state,sources FROM proposals WHERE scope=? AND idem=?').get(scope,'continuity-archive:'+episode);
 const valid=p&&JSON.parse(p.sources).every(id=>!!c.getSource(id,scope));
 const {items,has_more}=eventEvidenceLinks(c,scope,refs);
 return {archive:!p?'not_compiled':!valid?'source_invalid':p.state==='committed'?(c.db.prepare("SELECT 1 FROM memories WHERE scope=? AND proposal_id=? AND state='current'").get(scope,p.id)?'committed':'not_current'):p.state,proposal_id:valid?p.id:null,items,has_more,semantic_coverage_verified:false};
}
// Called in the same transaction as original source ingest. Duplicate sources never reactivate old episodes.
export function observeContinuity(c,scope,sourceId){if(!enabled(scope))return;const s=c.getSource(sourceId,scope),b=safe(s);if(!b)return;const at=Date.parse(s.at);if(!Number.isFinite(at))return;
 const update=contextUpdate(c,scope,b,at);if(update){save(c,scope,sourceId,def(update.old.kind),update.old,at,{hours:update.hours,deps:update.deps,same:true});return;}
 for(const d of definitions){const start=d.start.exec(b.text.trim()),end=d.end.test(b.text.trim());if(!start&&!end)continue;
  const old=c.db.prepare('SELECT * FROM continuity_w3h6b WHERE scope=? AND dimension=?').get(scope,d.dimension);
  if(old&&(old.observed_at>at||old.source_id===sourceId))return;
  if(end&&old?.kind!==d.kind)return;
  const same=!!(old?.kind===d.kind&&old.observed_at>preferenceChangedAt('continuity')&&old.state==='reported_active'&&old.expires_at>at&&validRow(c,old));
  save(c,scope,sourceId,d,old,at,{end,hours:start?.[1]?Number(start[1]):null,same,deps:same?[...new Set([...dependencies(c,scope,old.source_id),old.source_id])]:[]});return;
 }
}
function rows(c,scope){return c.db.prepare('SELECT * FROM continuity_w3h6b WHERE scope=? ORDER BY dimension').all(scope).filter(r=>r.observed_at>preferenceChangedAt('continuity')&&validRow(c,r));}
function project(r,now){return {kind:r.kind,label:def(r.kind).label,dimension:r.dimension,source_id:r.source_id,observed_at:new Date(r.observed_at).toISOString(),followup_at:r.due_at===null?null:new Date(r.due_at).toISOString(),expires_at:new Date(r.expires_at).toISOString(),state:now>=r.expires_at?'unknown_stale':r.state==='reported_ended'?'reported_ended':now>=r.due_at?'needs_confirmation':'last_reported_active',certainty:'human_self_report_not_live_observation'};}
export function continuityView(c,scope,now=Date.now()){return {enabled:enabled(scope),items:enabled(scope)?rows(c,scope).map(r=>({...project(r,now),links:episodeLinks(c,scope,r.episode_id),followup_state:c.db.prepare('SELECT state FROM shared_actions WHERE scope=? AND (idem=? OR idem LIKE ?) ORDER BY created_at DESC,rowid DESC LIMIT 1').get(scope,'continuity:'+r.episode_id,'continuity:'+r.episode_id+':%')?.state??null})):[],history:enabled(scope)?c.db.prepare('SELECT * FROM continuity_transitions_h6c WHERE scope=? ORDER BY observed_at DESC,rowid DESC LIMIT 50').all(scope).filter(r=>!!safe(c.getSource(r.source_id,scope))&&JSON.parse(r.dependencies).every(id=>!!c.getSource(id,scope))).map(r=>({kind:r.kind,label:def(r.kind).label,state:r.state,source_id:r.source_id,episode_id:r.episode_id,observed_at:new Date(r.observed_at).toISOString(),followup_at:r.due_at===null?null:new Date(r.due_at).toISOString()})):[],real_host_verified:false};}
export function selectContinuity(c,scope,query,now=Date.now()){if(!enabled(scope))return [];return rows(c,scope).filter(r=>r.expires_at>now&&def(r.kind).cue.test(query)).map(r=>project(r,now));}
export function saveContinuityRecall(c,scope,query,runId,items){if(items.length)c.db.prepare('INSERT INTO continuity_runs_w3h6b VALUES(?,?,?,?)').run(runId,scope,query,JSON.stringify(items));}
export function verifyContinuityRecall(c,scope,runId){const r=c.db.prepare('SELECT * FROM continuity_runs_w3h6b WHERE scope=? AND run_id=?').get(scope,runId);if(!r)return {valid:true,items:[]};const items=selectContinuity(c,scope,r.query);return {valid:JSON.stringify(items)===r.snapshot,items};}
export function continuityActionActive(c,a,now=Date.now()){if(!a.idem.startsWith('continuity:'))return true;if(!enabled(a.scope))return false;const r=rows(c,a.scope).find(r=>('continuity:'+r.episode_id===a.idem||'continuity:'+r.episode_id+':'+hash(r.source_id)===a.idem));return !!r&&r.state==='reported_active'&&r.source_id===a.target&&r.due_at<=now&&now<r.expires_at;}
export function runContinuity(c,scope,now=Date.now()){return c.tx(()=>{let queued=0,expired=0;for(const a of c.db.prepare("SELECT * FROM shared_actions WHERE scope=? AND idem LIKE 'continuity:%' AND state IN ('queued','acknowledged')").all(scope)){if(!continuityActionActive(c,a,now)){c.db.prepare("UPDATE shared_actions SET state='rejected',updated_at=? WHERE id=? AND scope=?").run(new Date(now).toISOString(),a.id,scope);c.receipt('continuity.followup.expired',scope,a.id,'ok');expired++;}}
 if(enabled(scope)){for(const r of rows(c,scope)){if(r.state!=='reported_active'||r.due_at>now||r.expires_at<=now)continue;const prefix='continuity:'+r.episode_id;const idem=prefix+':'+hash(r.source_id);if(c.db.prepare('SELECT 1 FROM shared_actions WHERE idem=?').get(idem)||c.db.prepare("SELECT 1 FROM shared_actions a WHERE scope=? AND (idem=? OR idem LIKE ?) AND (state IN ('queued','acknowledged','resolved') OR ack_by IS NOT NULL OR EXISTS(SELECT 1 FROM action_delivery d WHERE d.scope=a.scope AND d.action_id=a.id))").get(scope,prefix,prefix+':%'))continue;const body=JSON.stringify({kind:'continuity_followup',activity:r.kind,source_id:r.source_id,last_reported_at:new Date(r.observed_at).toISOString(),rule:'这是上次自述，不是实时状态。若情境适合且未得知更新，可自然询问近况一次；不要假定仍在进行或已结束，不要重复催问。'});c.createSharedAction({scope,kind:'memory_check',actor:'host',target:r.source_id,body,idempotency_key:idem},true);queued++;}}
 return {queued,expired,delivery_verified:false};});}
export function continuityMessage(items=[]){return items.length?'\nRelevant continuity projections (last self-report only, not live facts; do not assume completion):\n'+items.map(x=>JSON.stringify(x)).join('\n'):'';}
