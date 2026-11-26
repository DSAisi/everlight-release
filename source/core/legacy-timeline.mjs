import {createHash} from 'node:crypto';
import {validateTemporal} from './temporal.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Legacy timestamps are evidence of recorded observations, not proof of validity.
export function planLegacyFacts(records,scope){
 if(!scope||!Array.isArray(records))throw Error('scope and records required');
 const seen=new Set();return records.map(r=>{
 if(!r||typeof r.key!=='string'||!r.key.trim()||typeof r.value!=='string'||!r.value.trim()||typeof r.source!=='string'||!r.source.trim())throw Error('legacy fact missing key/value/source');
 const digest=hash([scope,r]);if(seen.has(digest))return null;seen.add(digest);
 const temporal={key:'legacy:'+hash(r.key)};
 // at can be a default write time in V7; preserve it verbatim, never infer event_at or valid_from.
 if(r.event_at&&validateTemporal({...temporal,event_at:r.event_at}))temporal.event_at=r.event_at;
 return {source:{scope,actor:'legacy-import',kind:'legacy_record',source_ref:r.source,source_id:'legacy:'+digest,body:r},proposal:{scope,slot:'S05',kind:'fact',payload:{statement:r.value,subject:r.key,attribution:'legacy record; original evidence not independently verified',temporal,legacy_at:r.at??null,legacy_replaced_at:r.replaced_at??null},source_refs:['legacy:'+digest],reason:'Legacy timeline migration; review actual event and validity dates before approval',idempotency_key:'legacy:'+digest}};
 }).filter(Boolean);
}
export function stageLegacyFacts(core,plan){return plan.map(({source,proposal})=>{core.source(source);return core.propose(proposal);});}
