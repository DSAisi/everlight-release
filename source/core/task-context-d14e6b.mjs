// RC6 E6B: a host-captured request/response pair, never arbitrary transcript proximity.
export const enabled=()=>process.env.EVERLIGHT_D14E6B_TASK_CONTEXT==='1';
const excluded=/密码|口令|密钥|身份证|银行卡|私密|性爱|裸照|角色扮演|假装|剧情|假如|虚构|住址|病历|password|api.?key|secret|credit.?card|role.?play|pretend|fiction|hypothetical|private|medical/i;
const referent=/这个任务|该任务|这项任务|这项工作|这件事|this task|this work/i;
const past=/昨天|前天|上周|上个月|去年|当时|以前|曾经|历史|回放|回顾|那时|过去|yesterday|last (?:week|month|year)|previously|historical|replay/i;
export const hasReferent=text=>typeof text==='string'&&referent.test(text);
export const currentReport=text=>typeof text==='string'&&!past.test(text);
function body(s){if(!s)return null;try{return JSON.parse(s.body)}catch{return null}}
// Explicit event time is optional for live gateway captures, but invalid, historical or future timestamps fail closed.
export function effectiveTime(s){const b=body(s);if(!b)return NaN;const values=['happened_at','occurred_at','observed_at'].filter(k=>b[k]!=null).map(k=>b[k]);if(!values.length)return Date.parse(s.at);if(values.some(v=>typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(Date.UTC(Number(v.slice(0,4)),Number(v.slice(5,7))-1,Number(v.slice(8,10)))).toISOString().slice(0,10)!==v.slice(0,10)||Number(v.slice(11,13))>23||Number(v.slice(14,16))>59||Number(v.slice(17,19))>59))return NaN;const times=values.map(Date.parse);if(new Set(times).size!==1||times[0]>Date.parse(s.at))return NaN;return times[0];}
const continuationText=/^(?:继续(?:继续)?|接着做|继续吧|continue|go on)[。！!\s]*$/i;
function clean(b){return b&&b.purpose==='conversation'&&b.private!==true&&b.sensitive!==true&&b.fiction!==true&&b.auto_memory_allowed!==false&&typeof b.text==='string'&&b.text.trim()&&b.text.length<=4000&&!excluded.test(b.text)&&currentReport(b.text);}
function trusted(c,scope,s,kind){if(!s||s.kind!==kind||s.actor!==(kind==='client_request'?'gateway-client':'gateway-upstream')||s.id!==s.source_ref)return false;const row=c.db.prepare('SELECT event FROM write_inbox WHERE scope=? AND source_id=? AND event_id=?').get(scope,s.id,s.id);if(!row)return false;let e;try{e=JSON.parse(row.event)}catch{return false}return e.origin==='host_verified'&&e.source_id===s.id&&e.scope===scope&&e.sensitive!==true&&(kind==='client_request'?['unclassified_client_request','explicit_preference'].includes(e.signal):e.signal==='unclassified_client_response');}
function explicitProgress(p){return /进度|进展|状态|做到哪|做得怎样|status|progress/i.test(p.text)&&!/不要|别做|取消|改期|不是|如果|假设|或者|不用|cancel|instead|if |don.t/i.test(p.text);}
export function requestContext(c,scope,data){
 if(!enabled()||!hasReferent(data.text)||!currentReport(data.text)||data.followup)return null;
 const b=body(data.src);if(!b||b.context_kind!=='gateway_request_reply_v1'||typeof b.request_source_id!=='string')return null;
 const s=c.getSource(b.request_source_id,scope),p=body(s);if(!trusted(c,scope,s,'client_request')||!clean(p))return null;
 const a=effectiveTime(s),z=effectiveTime(data.src);if(!Number.isFinite(a)||!Number.isFinite(z)||a>z)return null;
 if(explicitProgress(p))return {src:s,text:p.text};
 // A continuation is not evidence on its own. It must follow a persisted, direct
 // progress request and a verified-gateway reply with a current task event.
 if(process.env.EVERLIGHT_D14E6C_CONTINUATION!=='1'||!continuationText.test(p.text.trim())||typeof b.prior_request_source_id!=='string'||typeof b.prior_reply_source_id!=='string')return null;
 const q=c.getSource(b.prior_request_source_id,scope),r=c.getSource(b.prior_reply_source_id,scope),qb=body(q),rb=body(r);
 if(!trusted(c,scope,q,'client_request')||!trusted(c,scope,r,'client_response')||!clean(qb)||!clean(rb)||!explicitProgress(qb)||rb.context_kind!=='gateway_request_reply_v1'||rb.request_source_id!==q.id||rb.awareness_request_ref||new Set([q.id,r.id,s.id,data.src.id]).size!==4)return null;
 const qt=effectiveTime(q),rt=effectiveTime(r);if(!Number.isFinite(qt)||!Number.isFinite(rt)||qt>rt||rt>a)return null;
 return {src:s,text:qb.text,anchor:q,priorReply:r,dependencies:[q.id,r.id,s.id]};
}
// Dependency is retained even if the feature is switched off later. Revoking the request hides the dependent task event.
export function validEvent(c,scope,e){if(!c.getSource(e.source_id,scope))return false;const dependencies=c.db.prepare('SELECT source_id FROM task_context_sources_d14e6b WHERE scope=? AND event_id=?').all(scope,e.id);return dependencies.every(d=>!!c.getSource(d.source_id,scope));}
