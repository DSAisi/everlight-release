import {createHash} from 'node:crypto';
import {selectContext,defaultContextBudgetBytes} from './context-budget-d14c2.mjs';
import {tokenizeD14} from './indexed-retrieval-d14c.mjs';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const str=(s,n=256)=>typeof s==='string'&&s.trim()===s&&s.length>0&&s.length<=n;
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status})};
const parse=s=>JSON.parse(s);
const privateKeys=['private','sensitive','fiction','night','private_media','consent_ref'];
const safe=b=>b&&typeof b==='object'&&!privateKeys.some(k=>b[k])&&b.auto_memory_allowed!==false;
const ids=p=>[p.person_id,p.subject_person_id,p.object_person_id,p.owner_person_id,...(p.person_ids||[]),...(p.participant_person_ids||[])].filter(Boolean);
const decode=r=>({...r,payload:parse(r.payload),sources:parse(r.sources)});
const tag=(c,scope,id)=>{const s=c.getSource(id,scope);if(!s)return null;try{const b=parse(s.body);return safe(b)?b.work_context:null;}catch{return null;}};
const projectTag=(t,p,j)=>t?.visibility==='client_project'&&t.person_id===p&&t.project_id===j;
const sharedTag=t=>t?.visibility==='shared_skill'&&t.person_id==null&&t.project_id==null&&t.sanitized===true;
const inProject=(c,scope,r,p,j)=>safe(r.payload)&&r.sources.length>0&&ids(r.payload).every(id=>id===p)&&r.sources.every(id=>projectTag(tag(c,scope,id),p,j));
const sharedSkill=(c,scope,r)=>['S06','S11'].includes(r.slot)&&safe(r.payload)&&!ids(r.payload).length&&r.sources.length>0&&r.sources.every(id=>sharedTag(tag(c,scope,id)))&&(r.slot==='S06'?['tested_once','repeatable'].includes(r.payload.verification):['tested_once','repeatable'].includes(r.payload.verified_level));
const sourceTime=r=>r.payload.happened_at||r.payload.temporal?.event_at||r.payload.observed_at||null;
// An explicit host-authorized project is required. This is a candidate context, NOT a verified model request.
export function workContact(c,{scope,channel,external_id,project_id,event_id,occurred_at,text,record_allowed,context_allowed,limit=8}={}){
 if(![scope,channel,external_id,project_id,event_id].every(v=>str(v))||!(typeof text==='string'&&text.trim()&&text.length<=16000)||!str(occurred_at,64)||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(occurred_at)||!Number.isFinite(Date.parse(occurred_at))||Date.parse(occurred_at)>Date.now()+300000||!Number.isInteger(limit)||limit<1||limit>20)fail('invalid trusted work contact');
 if(record_allowed!==true||context_allowed!==true)return {state:'not_authorized',selected:[],actual_request_verified:false};
 return c.tx(()=>{
 const resolved=c.relationResolve({scope,channel,external_id});if(!resolved.matched)return {state:'identity_unconfirmed',selected:[],actual_request_verified:false};
 const person=resolved.person.id;
 // Require at least one already-authorized project evidence record. No project guessed from words.
 const all=c.db.prepare("SELECT * FROM memories WHERE scope=? AND state='current' AND slot IN ('S03','S04','S05','S06','S07','S11','S12')").all(scope).map(decode);
 const project=all.filter(r=>inProject(c,scope,r,person,project_id)&&r.kind!=='media');
 if(!project.length)return {state:'project_unconfirmed',selected:[],actual_request_verified:false};
 const source_id='work-contact-j10:'+digest([scope,channel.toLowerCase(),event_id]);
 const at=new Date(occurred_at).toISOString();
 const prior=c.db.prepare("SELECT id,body FROM sources WHERE scope=? AND kind='host_work_contact_j10' AND revoked=0 AND id<>? AND json_extract(body,'$.occurred_at')<? AND json_extract(body,'$.work_context.person_id')=? AND json_extract(body,'$.work_context.project_id')=? ORDER BY json_extract(body,'$.occurred_at') DESC,id DESC LIMIT 1").get(scope,source_id,at,person,project_id);
 const body={text,occurred_at:at,channel:channel.toLowerCase(),event_id,work_context:{visibility:'client_project',person_id:person,project_id},direction:'inbound'};
 const receipt=c.source({scope,actor:'trusted-work-host',kind:'host_work_contact_j10',source_ref:source_id,source_id,body},true);
 const annotated=c.annotateRecall(scope,project);
 // Task progress is exposed only when its latest evidence belongs to the same authorized project.
 const tasks=annotated.filter(r=>r.slot==='S03').map(r=>{const t=c.taskBoard({scope,memory_id:r.id,limit:1})[0];const e=t?.events.at(-1);const valid=!e||projectTag(tag(c,scope,e.source_id),person,project_id);return {id:r.id,revision:r.revision,state:valid?t?.state:'unknown',last_event:valid&&e?{id:e.id,source_id:e.source_id,at:e.at,detail:e.detail}:null,verified:valid&&!!t?.verified};});
 const taskById=new Map(tasks.map(t=>[t.id,t]));
 const terms=[...new Set(tokenizeD14(text))].filter(t=>t.length>1);const score=r=>terms.reduce((n,t)=>n+Number(JSON.stringify(r.payload).toLowerCase().includes(t.toLowerCase())),0);
 const active=annotated.filter(r=>r.slot==='S03'&&['todo','in_progress','blocked'].includes(taskById.get(r.id)?.state));
 const compare=(a,b)=>score(b)-score(a)||(Date.parse(taskById.get(b.id)?.last_event?.at||sourceTime(b))||0)-(Date.parse(taskById.get(a.id)?.last_event?.at||sourceTime(a))||0)||a.id.localeCompare(b.id);
 const rest=annotated.filter(r=>r.slot!=='S03'&&r.temporal_context.status!=='future').sort(compare);
 const skill=c.annotateRecall(scope,all.filter(r=>sharedSkill(c,scope,r)&&score(r)>0)).sort(compare).slice(0,2);
 const ranked=[...active.sort(compare),...rest.filter(r=>score(r)>0),...skill,...rest.filter(r=>score(r)===0&&r.slot==='S04').slice(0,1)];
 const choice=selectContext({ranked,rows:[...annotated,...skill],limit,budget:c.contextBudget||defaultContextBudgetBytes});
 // Never disclose unvalidated task events via generic memory payload. Caller must treat these as internal evidence.
 const selected=choice.selected.map(r=>{if(r.slot!=='S03')return r;const t=taskById.get(r.id);return {...r,temporal_context:{...r.temporal_context,task_state:{state:t?.state||'unknown',verified:t?.verified||false}}};});
 const latest=c.db.prepare("SELECT id,body FROM sources WHERE scope=? AND kind='host_work_contact_j10' AND revoked=0 AND json_extract(body,'$.work_context.person_id')=? AND json_extract(body,'$.work_context.project_id')=? ORDER BY json_extract(body,'$.occurred_at') DESC,id DESC LIMIT 1").get(scope,person,project_id);
 return {state:'captured_context_selected',person_id:person,project_id,source_id,idempotent:receipt.idempotent,last_contact_at:parse(latest.body).occurred_at,previous_contact:prior?{source_id:prior.id,occurred_at:parse(prior.body).occurred_at}:null,selected,tasks:tasks.filter(t=>selected.some(r=>r.id===t.id)),budget:choice.lane,actual_request_verified:false,upstream_submitted:false,formal_memory_written:false};
 });
}
