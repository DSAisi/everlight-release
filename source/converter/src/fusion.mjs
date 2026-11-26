// Reciprocal rank fusion. Scores from different providers are not directly comparable.
export function fuseHints(lexical,embedding,{limit=5,k=60}={}){
 if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid fusion limit');
 const groups=new Map();
 for(const [method,hints] of [['lexical',lexical],['embedding',embedding]]){
  const by=new Map();for(const h of hints){const [a,b]=h.candidate_ids;if(a===b)continue;for(const [x,y] of [[a,b],[b,a]]){if(!by.has(x))by.set(x,new Map());const m=by.get(x);if(!m.has(y)||m.get(y).score<h.score)m.set(y,h);}}
  for(const [a,m] of by){const ranked=[...m].sort((x,y)=>y[1].score-x[1].score||x[0].localeCompare(y[0]));ranked.forEach(([b,h],i)=>{if(!groups.has(a))groups.set(a,new Map());const g=groups.get(a);if(!g.has(b))g.set(b,{candidate_ids:[a,b],source_refs:new Set(),ranks:{},score:0});const v=g.get(b);v.ranks[method]=i+1;v.score+=1/(k+i+1);for(const r of h.source_refs)v.source_refs.add(r);});}
 }
 return [...groups.values()].flatMap(g=>[...g.values()].sort((a,b)=>b.score-a.score||a.candidate_ids[1].localeCompare(b.candidate_ids[1])).slice(0,limit).map(v=>({...v,source_refs:[...v.source_refs].sort(),method:'reciprocal_rank_fusion',state:'unverified_hint',identity_confirmed:false,current_state:null})));
}
