import {proposeCanonical} from './write-compiler-w3h6e.mjs';
import {flag} from '../automation/settings-w3h6.mjs';
import {createHash} from 'node:crypto';
import {contract,VERSION as D9} from '../protocol/write-contract-d9.mjs';
import {VERSION as D7} from '../protocol/write-template-d7.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const norm=x=>x.normalize('NFC').replace(/\s+/g,' ').trim();
const check=(ok,msg)=>{if(!ok)throw Object.assign(Error('E5A: '+msg),{status:422});};
export const enabled=()=>flag('EVERLIGHT_D14E5A_SEMANTIC_AUTO');
const first=/(我|本人|\bI\b|\bmy\b)/i;
const uncertain=/(如果|假如|假设|虚构|假装|计划|打算|将会|我会|我将|尚未|没有发生|未发生|没发生|没完成|没有完成|并未|不是我|别人说|引用|\b(?:if|would|will|might|fiction|pretend|plan to)\b)/i;
const occurred=/(已经|刚刚|完成了|参加了|去了|做了|遇到了|发生了|昨天|上周|\b(?:did|went|attended|finished|completed|visited|yesterday)\b)/i;
export function features(role,followup){return enabled()&&!followup?{episode:role==='user',skills:true}:undefined;}
export function applySemantic(c,row,data,subject,items){
 check(enabled()&&!data.followup&&Array.isArray(items)&&items.length<=4,'feature disabled, followup or invalid list');
 const exact=(v,n=800)=>typeof v==='string'&&v.trim()===v&&v.length>=2&&v.length<=n&&data.text.includes(v);
 const seen=new Set(),out=[];
 for(const [i,x] of items.entries()){
  check(x&&typeof x==='object'&&!Array.isArray(x)&&['episode','procedure','code'].includes(x.kind),'invalid kind');
  const spec=contract(x.kind);check(spec.categories.includes(x.category)&&x.category!=='custom','invalid category');
  const p={template_version:D7,contract_version:D9,category:x.category};let fp;
  if(x.kind==='episode'){
   check(data.role==='user'&&Object.keys(x).sort().join(',')==='category,kind,quote'&&exact(x.quote)&&first.test(x.quote)&&occurred.test(x.quote)&&!uncertain.test(data.text),'explicit user report of past experience required');
   // No inferred companions, exact event time, or result. Preserve report attribution even after review.
   Object.assign(p,{summary:'当事人自述（未独立核验）：'+x.quote,participants:[subject],happened_at:null,time_unknown_reason:'自动提取不推断实际事件时间；保留原话及来源等待审核',outcome:null});
   // Do not conflate two distinct occurrences of the same wording.
   fp=hash(['e5a',row.scope,subject,x.kind,row.event_id,norm(x.quote)]);
  }else{
   check(Object.keys(x).sort().join(',')==='category,environment,kind,problem,solution'&&[x.problem,x.solution,x.environment].every(v=>exact(v))&&new Set([x.problem,x.solution,x.environment].map(norm)).size===3,'distinct literal problem, solution and environment required');
   Object.assign(p,{problem:x.problem,solution:x.solution,environment:x.environment,verification:'untested',verification_detail:null});
   fp=hash(['e5a',row.scope,subject,x.kind,...[x.problem,x.solution,x.environment].map(norm)]);
  }
  check(!seen.has(fp),'duplicate within source');seen.add(fp);
  const prior=c.db.prepare("SELECT i.proposal_id FROM d11_items i JOIN proposals p ON p.scope=i.scope AND p.id=i.proposal_id WHERE i.scope=? AND i.fingerprint=? AND p.state IN ('pending','approved_pending_commit','committed') ORDER BY p.created_at DESC LIMIT 1").get(row.scope,fp);
  if(prior){const q=c.proposalDetail({scope:row.scope,id:prior.proposal_id});if(q.source_valid&&(q.state!=='committed'||q.committed_record?.state==='current')){out.push({kind:x.kind,state:'exact_repeat',proposal_id:prior.proposal_id});continue;}}
  const q=proposeCanonical(c,{scope:row.scope,slot:spec.slot,kind:x.kind,payload:p,source_refs:[data.src.id],reason:'E5A automatic literal source candidate; no independent verification; existing governance required',idempotency_key:'e5a:'+hash([row.scope,row.event_id,i,fp])},true);
  c.db.prepare('INSERT INTO d11_items VALUES(?,?,?,?,?,?)').run(row.scope,row.event_id,200+i,fp,q.id,'proposed');out.push({kind:x.kind,state:'proposed',proposal_id:q.id});
 }
 return out;
}
