import {proposeCanonical} from './write-compiler-w3h6e.mjs';
import {createHash} from 'node:crypto';
import {contract,VERSION as D9} from '../protocol/write-contract-d9.mjs';
import {VERSION as D7} from '../protocol/write-template-d7.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=(status,msg)=>{throw Object.assign(Error('E5B: '+msg),{status});};
const check=(ok,msg)=>{if(!ok)fail(422,msg);};
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const fields=(x,keys)=>obj(x)&&Object.keys(x).sort().join(',')===keys.split(' ').sort().join(',');
const safe=x=>typeof x==='string'&&x===x.trim()&&x.length>0&&x.length<=1200&&!/密码|密钥|口令|身份证|银行卡|私密|裸照|角色扮演|虚构|假装|病历|住址|password|api.?key|secret|credit.?card|role.?play|fiction|pretend|private|medical/i.test(x);
const ref=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(x)&&safe(x);
const stamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const first=/^(我|本人|I\b|my\b)/i;
const unsure=/如果|假如|假设|可能|也许|打算|将会|不是|并非|不再|别人说|曾经|以前|\b(if|maybe|might|would|used to|not)\b/i;
export const enabled=()=>process.env.EVERLIGHT_D14E5B_HOST_MEMORY==='1';
function auth(scope){if(!enabled()||process.env.EVERLIGHT_STRICT_WRITE_D9!=='1'||!scope||scope!==process.env.EVERLIGHT_BOUND_SCOPE)fail(403,'strict bound scope and opt-in required');}
function alias(c,scope,x){check(fields(x,'channel external_id')&&safe(x.channel)&&safe(x.external_id),'invalid confirmed identity lookup');const a=c.relationResolve({scope,...x});check(a.matched&&a.confidence==='human_confirmed_mapping','unconfirmed or revoked identity');return a;}
function conversation(c,b,d){const s=c.getSource(d.source_id,b.scope);check(s,'conversation missing or revoked');let x;try{x=JSON.parse(s.body)}catch{fail(422,'invalid conversation source');}check(obj(x)&&x.purpose==='conversation'&&x.private!==true&&x.sensitive!==true&&x.fiction!==true&&x.auto_memory_allowed!==false&&!x.awareness_request_ref&&safe(x.text)&&!unsure.test(x.text)&&safe(d.quote)&&first.test(d.quote)&&x.text.includes(d.quote),'explicit non-private current self-report required');check((s.actor==='gateway-client'&&s.kind==='client_request')||(s.actor==='gateway-upstream'&&s.kind==='client_response'),'verified conversation type required');return s;}
// Dedicated trusted callback. A host attestation is not independent proof of semantic truth.
export function recordHostMemory(c,b){auth(b?.scope);check(fields(b,'scope event_id kind category occurred_at evidence')&&ref(b.event_id)&&stamp(b.occurred_at)&&obj(b.evidence),'invalid envelope');const spec=contract(b.kind);check(['relationship','identity','document','media'].includes(b.kind)&&spec.categories.includes(b.category)&&b.category!=='custom','invalid kind/category');const d=b.evidence;
return c.tx(()=>{let payload={template_version:D7,contract_version:D9,category:b.category},sources=[],sourceKey=['event',b.event_id];
 if(b.kind==='relationship'||b.kind==='identity'){
  const rel=b.kind==='relationship';check(fields(d,rel?'source_id quote speaker object object_label':'source_id quote speaker authorization_ref')&&ref(d.source_id),'invalid attributed source fields');const s=conversation(c,b,d);const subject=alias(c,b.scope,d.speaker);const bound=s.kind==='client_response'?process.env.EVERLIGHT_D14E5B_AI_PERSON_ID:process.env.EVERLIGHT_D14E5B_USER_PERSON_ID;check(bound&&bound===subject.person.id,'source role must match configured single-pair speaker');sources.push(s.id,subject.source_id);sourceKey=['conversation',s.id,d.quote];
  if(rel){const other=alias(c,b.scope,d.object);check(subject.person.id!==other.person.id&&safe(d.object_label)&&d.object_label===other.person.label&&d.quote.includes(d.object_label),'explicit known object required');sources.push(other.source_id);Object.assign(payload,{subject:subject.person.label,object:d.object_label,relation:'当事人自述（待审核）：'+d.quote,circle:b.category,boundary:null,subject_person_id:subject.person.id,object_person_id:other.person.id});}
  else{check(s.kind==='client_response'&&ref(d.authorization_ref)&&process.env.EVERLIGHT_D14E5B_AI_PERSON_ID===subject.person.id,'authorized configured AI self-report required');Object.assign(payload,{subject:subject.person.label,subject_person_id:subject.person.id,statement:d.quote,basis:'宿主授权的 AI 自述（非独立验证）：'+d.authorization_ref,evidence_status:'reported'});}
 }else{
  const media=b.kind==='media';check(fields(d,media?'resource_ref version summary access_status model_request_ref consumption_receipt media_type archive_authorization_ref private_media':'resource_ref version summary access_status access_receipt')&&ref(d.resource_ref)&&ref(d.version)&&safe(d.summary),'invalid resource evidence');
  if(media){check(d.access_status==='consumed'&&d.private_media===false&&ref(d.model_request_ref)&&ref(d.consumption_receipt)&&ref(d.archive_authorization_ref)&&['image','audio','video'].includes(d.media_type)&&({photo:['image'],generated_image:['image'],tool_capture:['image'],audio:['audio'],video:['video'],other:['image','audio','video']}[b.category]||[]).includes(d.media_type),'non-private authorized actual consumption required');Object.assign(payload,{path:d.resource_ref,version:d.version,summary:'宿主消费回报（待审核）：'+d.summary,media_type:d.media_type,observed_at:b.occurred_at,model_request_ref:d.model_request_ref,consumption_receipt:d.consumption_receipt,private_media:false});sourceKey=['consumption',d.resource_ref,d.version,d.model_request_ref,d.consumption_receipt];}
  else{check(['received','read','referenced'].includes(d.access_status)&&ref(d.access_receipt),'actual document access receipt required');Object.assign(payload,{path:d.resource_ref,version:d.version,summary:'宿主'+({received:'接收',read:'阅读',referenced:'引用'}[d.access_status])+'回报（待审核）：'+d.summary,access_status:d.access_status});sourceKey=['access',d.resource_ref,d.version,d.access_receipt];}
 }
 const sourceId='e5b:'+hash([b.scope,b.kind,sourceKey]);const stableId='e5b:'+hash([b.scope,b.event_id]);const prior=c.db.prepare('SELECT id FROM proposals WHERE idem=?').get(stableId);
 const s=c.source({scope:b.scope,source_id:sourceId,actor:'host',kind:'host_memory_evidence',source_ref:stableId,body:b},true);sources=[...new Set([...sources,s.id])];
 const q=proposeCanonical(c,{scope:b.scope,slot:spec.slot,kind:b.kind,payload,source_refs:sources,reason:'E5B trusted host observation; existing independent governance required',idempotency_key:stableId},true);
 if(!prior)c.receipt('e5b.memory.candidate',b.scope,q.id,'pending_review',{source_id:s.id,kind:b.kind});
 return {event_id:b.event_id,source_id:s.id,proposal_id:q.id,slot:spec.slot,state:q.state,idempotent:!!prior,requires_review:true,canonicalMemoryChanged:false};
});}
