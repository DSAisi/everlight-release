import {recallContent,memoryLine,validateTemporal} from './temporal.mjs';
export const defaultContextBudgetBytes=12000;
export const budgetWarning='长明本轮召回受上下文资源限制，部分候选未注入；不得把未显示的信息视为不存在，必要时请求授权的精确证据查询。';
export function readContextBudget(value){if(value===undefined||value==='')return 0;const n=Number(value);if(!Number.isSafeInteger(n)||n<1024||n>22000)throw Error('D14C2 context budget must be 1024–22000 UTF-8 bytes');return n;}
const bytes=s=>Buffer.byteLength(s,'utf8');
// Stable object key order for exact duplicate payloads, not semantic equivalence.
function stable(x){if(Array.isArray(x))return x.map(stable);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])]));return x;}
export function selectContext({ranked,rows,limit,budget}){
 const groups=new Map(),seen=new Set(),duplicates=new Set(),selected=[],deduplicatedIds=[],budgetOmittedIds=[];
 const temporalKey=r=>{const t=r.payload.temporal;return t&&validateTemporal(t)?JSON.stringify([r.scope,t.key]):null;};
 for(const r of rows){const k=temporalKey(r);if(k){if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}}
 let used=bytes(recallContent([])),omitted=0,deduplicated=0;
 for(const hit of ranked){if(seen.has(hit.id))continue;
  const key=temporalKey(hit),peers=key?groups.get(key)||[]:[];
  // Keep active alternatives together even for a hit on an historical record.
  const active=peers.filter(r=>['effective','conflict','unverified_time'].includes(r.temporal_context?.status));
  const unit=[...new Map([...active,hit].map(r=>[r.id,r])).values()].filter(r=>!seen.has(r.id));
  // Never collapse distinct provenance, temporal observations, or association proofs.
  const signature=!key&&hit.slot==='S05'&&!hit.event_proof?JSON.stringify([hit.scope,hit.slot,hit.kind,stable(hit.payload),[...(hit.sources??[])].sort(),hit.temporal_context?.status,hit.temporal_context?.event_at??null,hit.temporal_context?.valid_from??null,hit.temporal_context?.valid_until??null]):null;
  if(signature&&duplicates.has(signature)){seen.add(hit.id);deduplicated++;deduplicatedIds.push(hit.id);continue;}
  const cost=unit.reduce((n,r,i)=>n+bytes(memoryLine(r))+(selected.length||i?1:0),0);
  if(selected.length+unit.length>limit||used+cost>budget){omitted++;budgetOmittedIds.push(...unit.map(r=>r.id));continue;}
  selected.push(...unit);used+=cost;for(const r of unit)seen.add(r.id);if(signature)duplicates.add(signature);
 }
 return {selected,lane:{name:'context-budget-d14c2',state:'ok',budget_bytes:budget,used_bytes:bytes(recallContent(selected)),omitted_groups:omitted,deduplicated,deduplicated_ids:deduplicatedIds,budget_omitted_ids:[...new Set(budgetOmittedIds)].filter(id=>!seen.has(id)),partial:omitted>0}};
}
export function contextWarnings(run){return run?.lanes?.some(l=>['context-budget-d14c2','raw-evidence-d14c3'].includes(l.name)&&l.partial===true)?[{role:'system',content:budgetWarning}]:[];}
