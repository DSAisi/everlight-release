// Local BM25 lane; no external transmission or persistent stale index.
export function localBM25(terms){return {name:'local-bm25',search({query,rows}){
 const q=[...new Set(terms(query))];if(!q.length||!rows.length)return [];
 const docs=rows.map(r=>({id:r.id,revision:r.revision,tokens:terms(JSON.stringify(r.payload))}));
 const avg=docs.reduce((s,d)=>s+d.tokens.length,0)/docs.length||1;
 const df=new Map(q.map(t=>[t,docs.filter(d=>d.tokens.includes(t)).length]));
 return docs.map(d=>{const counts=new Map();for(const t of d.tokens)counts.set(t,(counts.get(t)||0)+1);let score=0;for(const t of q)if(counts.has(t)){const n=df.get(t),tf=counts.get(t);score+=Math.log(1+(docs.length-n+.5)/(n+.5))*tf*2.2/(tf+1.2*(.25+.75*d.tokens.length/avg));}return {id:d.id,revision:d.revision,score};}).filter(d=>d.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}};}
