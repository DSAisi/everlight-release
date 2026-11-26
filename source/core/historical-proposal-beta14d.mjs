// Deduplicate only exact structured content and the same immutable source IDs.
// Do not merge similar memories, distinct events, revoked records or different revisions.
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const stable=x=>JSON.stringify(canonical(x));
export function historicalProposal(core,p){
 if(p.scope!=='personal'||p.target_id!=null||p.expected_revision!=null)throw Object.assign(Error('New historical proposals only'),{status:422});
 core.validate(p.slot,p.kind,p.payload,p.source_refs,p.scope);
 if(!p.source_refs.every(id=>core.getSource(id,p.scope)?.kind==='historical_import'))throw Object.assign(Error('Historical sources only'),{status:422});
 const refs=[...new Set(p.source_refs)].sort();const exact=stable(p.payload);
 return core.tx(()=>{core.db.exec('CREATE INDEX IF NOT EXISTS beta14d_proposal_exact ON proposals(scope,slot,kind,sources) WHERE target IS NULL');
 const matches=core.db.prepare('SELECT id,state,payload,sources FROM proposals WHERE scope=? AND slot=? AND kind=? AND target IS NULL AND sources IN (?,?) ORDER BY created_at,id').all(p.scope,p.slot,p.kind,JSON.stringify(refs),JSON.stringify(p.source_refs)).filter(r=>stable(JSON.parse(r.payload))===exact);
 // Never evade an earlier rejection, even if a duplicate proposal was already committed.
 const previous=matches.find(r=>r.state==='rejected')??matches.find(r=>r.state==='committed')??matches[0];
 if(previous)return {id:previous.id,state:previous.state,idempotent:true,historical_duplicate:true};
 return core.propose({...p,source_refs:refs},true);});
}
