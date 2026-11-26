// Policy never grants access: the remote adapter has already validated administrator opt-in.
// A trusted host may decline the built-in optional remote lane, never disable mandatory recall.
export function remoteMode(env=process.env){
 const mode=env.EVERLIGHT_RETRIEVAL_REMOTE_MODE??'auto';
 if(!['auto','off'].includes(mode))throw Error('invalid retrieval remote mode (auto/off)');return mode;
}
export function chooseRetrieval({remoteConfigured=false,mode='auto',hint}={}){
 if(!['auto','off'].includes(mode))throw Error('invalid retrieval mode');
 if(hint!==undefined&&!['auto','skip_remote_vector'].includes(hint))throw Object.assign(Error('invalid retrieval_hint'),{status:422});
 const reason=mode==='off'?'administrator_disabled':!remoteConfigured?'not_configured':hint==='skip_remote_vector'?'trusted_host_declined':'configured_default';
 return {mode, hint:hint??'auto',remote_vector:reason==='configured_default'?'attempt':'skip',reason,mandatory_recall:true};
}
export function retrievalInventory(core,{remoteConfigured=false,mode='auto',env=process.env}={}){
 return {mode:'automatic',mandatory_recall:true,remote_mode:mode,remote_configured:remoteConfigured,remote_allowed:remoteConfigured&&mode==='auto',provider_health:null,
  local_text:core.indexedRecall&&core.retrievalProviders.length===1?'indexed-bm25_with_fallback':'lexical_and_bm25',person_association:env.EVERLIGHT_W2_PERSON_RECALL==='1',raw_evidence_opt_in:!!core.rawRecallScope,context_budget_bytes:core.contextBudget??null,
  trusted_plugins:core.retrievalProviders.filter(p=>p.name!=='local-bm25').map(p=>({name:p.name,execution:'synchronous',transport:'not_declared'})),
  host_hint_supported:true,model_autonomous_hint_verified:false,remote_usage_measured:false};
}
export async function recallWithPolicy(core,body,remote,mode){
 const decision=chooseRetrieval({remoteConfigured:!!remote,mode,hint:body.retrieval_hint});
 // Never pass an untrusted routing object into the audit. The second argument is server-owned.
 return decision.remote_vector==='attempt'?core.recallParallel(body,remote,decision):core.recall(body,[],decision);
}
