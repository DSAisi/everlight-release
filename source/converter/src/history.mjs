// Evidence-preserving pairwise history review. No transitive identity or current-state inference.
export function historyReview(candidates, judgments, records){
 const by=new Map(candidates.map(c=>[c.candidate_id,c])), sources=new Map(records.map(r=>[r.source_id,r]));
 const items=[];
 for(const j of judgments.items??[]){
  if(!['state_change','conflict','hypothesis_vs_event'].includes(j.relation))continue;
  const cs=j.candidate_ids.map(id=>by.get(id));
  if(cs.length!==2||cs.some(c=>!c))throw Error('Unknown history candidate');
  const versions=cs.map(c=>({candidate_id:c.candidate_id,kind:c.kind,payload:c.payload,source_refs:c.source_refs,message_times:c.source_refs.map(id=>{if(!sources.has(id))throw Error('Unknown history evidence');return sources.get(id).happened_at??null;}),effective_time:null}));
  const supported=versions.every(v=>v.source_refs.some(id=>j.source_refs.includes(id)));
  items.push({relation:j.relation,versions,source_refs:j.source_refs,reason:j.reason,evidence_covers_both:supported,state:supported?'pending_review':'insufficient_evidence',chronology:'unverified',current_state:null,identity_confirmed:false,production_approved:false});
 }
 return {status:judgments.status,remaining:judgments.remaining,items};
}

// Connected review groups are not identity clusters or ordered effective-time chains.
export function historyGroups(review){
 const parent=new Map();
 function root(x){if(!parent.has(x))parent.set(x,x);let r=x;while(parent.get(r)!==r)r=parent.get(r);while(x!==r){const n=parent.get(x);parent.set(x,r);x=n;}return r;}
 for(const e of review.items){if(e.state!=='pending_review'||e.relation!=='state_change')continue;const [a,b]=e.versions.map(v=>v.candidate_id);parent.set(root(a),root(b));}
 const groups=new Map();
 for(const e of review.items){if(e.state!=='pending_review'||e.relation!=='state_change')continue;const r=root(e.versions[0].candidate_id);if(!groups.has(r))groups.set(r,{versions:new Map(),edges:[]});const g=groups.get(r);for(const v of e.versions)g.versions.set(v.candidate_id,v);g.edges.push(e);}
 return [...groups.values()].map(g=>({versions:[...g.versions.values()],edges:g.edges,chronology:'unverified',current_state:null,identity_confirmed:false,state:'pending_review',production_approved:false}));
}

// Explicit human confirmation, never inferred from report timestamps or graph connectivity.
export function confirmHistory(group,input){
 if(!group||group.state!=='pending_review')throw Error('Unknown history group');
 if(typeof input.reviewer!=='string'||!input.reviewer.trim()||typeof input.note!=='string'||!input.note.trim())throw Error('Reviewer and evidence explanation required');
 const versions=new Map(group.versions.map(v=>[v.candidate_id,v]));
 if(!Array.isArray(input.order)||input.order.length!==versions.size||new Set(input.order).size!==versions.size||input.order.some(id=>!versions.has(id)))throw Error('Order must contain every version exactly once');
 if(input.identity_confirmed!==true)throw Error('Explicit same-subject confirmation required');
 const edges=new Set(group.edges.map(e=>e.versions.map(v=>v.candidate_id).sort().join('\0')));
 for(let i=1;i<input.order.length;i++)if(!edges.has([input.order[i-1],input.order[i]].sort().join('\0')))throw Error('Adjacent versions lack direct evidence');
 return {versions:input.order.map(id=>versions.get(id)),reviewer:input.reviewer,note:input.note,reviewed_at:new Date().toISOString(),chronology:'human_confirmed_relative_order',identity_confirmed:true,current_state:null,state:'locally_confirmed',production_approved:false};
}
