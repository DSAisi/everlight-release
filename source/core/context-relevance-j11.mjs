// Narrow evidence-based selection policy. Candidate discovery is unchanged.
// A verified topical person association makes name-only local hits optional, not mandatory.
const local=new Set(['lexical','local-bm25','indexed-bm25']);
function values(x){if(typeof x==='string')return [x];if(Array.isArray(x))return x.flatMap(values);if(x&&typeof x==='object')return Object.values(x).flatMap(values);return [];}
export function chooseRelevant({ranked,association,support}){
 if(association?.activation!=='topic_evidence'||!association.topic_terms?.length)return {ranked,lane:null};
 const associated=new Set(association.rows.map(r=>r.id)),deferred=[];
 const kept=ranked.filter(r=>{
  if(associated.has(r.id))return true;
  const lanes=support.get(r.id);
  // A custom or semantic provider is independent evidence. Never reject it merely for no lexical overlap.
  if(!lanes?.size||[...lanes].some(n=>!local.has(n)))return true;
  const strings=values(r.payload).map(v=>v.normalize('NFKC').toLowerCase());
  if(association.topic_terms.some(t=>strings.some(v=>v.includes(t))))return true;
  deferred.push(r.id);return false;
 });
 return {ranked:kept,lane:{name:'context-relevance-j11',state:'ok',activation:'verified_person_topic',deferred_local_ids:deferred,deferred_local_count:deferred.length,eligible_count:kept.length,semantic_only_preserved:true}};
}
