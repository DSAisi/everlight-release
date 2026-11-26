// Synchronous local retrieval plug-in contract. Only canonical rows can be returned.
export function rankCandidates({rows,query,terms,providers=[]}){
 const byId=new Map(rows.map(r=>[r.id,r]));const scores=new Map();const support=new Map();const lanes=[];
 const lexical=rows.map(r=>({id:r.id,revision:r.revision,score:terms(query).reduce((n,t)=>n+(JSON.stringify(r.payload).toLowerCase().includes(t)?1:0),0)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
 const add=(name,hits)=>{if(!Array.isArray(hits))throw Error('invalid retrieval result');const seen=new Set();let rank=0;for(const h of hits){const row=byId.get(h?.id);if(!row||row.revision!==h.revision||seen.has(h.id))continue;seen.add(h.id);if(!support.has(h.id))support.set(h.id,new Set());support.get(h.id).add(name);rank++;scores.set(h.id,(scores.get(h.id)||0)+1/(60+rank));}lanes.push({name,state:'ok',hits:rank});};
 add('lexical',lexical);
 for(const p of providers){try{add(p.name,p.search({query,rows:structuredClone(rows)}));}catch{lanes.push({name:p.name,state:'failed'});}}
 return {ranked:[...scores].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([id,score])=>({...byId.get(id),score})),lanes,support};
}
