import {PROTOCOL_VERSION,checkProposalShape} from '../protocol/portable-v1.mjs';
/** Any host (DSH, OpenAI-compatible, Claude, local model, custom agent) supplies this boundary. */
export class EverlightHostAdapter{
 constructor({baseUrl,token,hostToken,fetchImpl=fetch,timeoutMs=30000}){if(!/^https?:\/\//.test(baseUrl))throw Error('baseUrl required');if(!token)throw Error('token required');this.url=baseUrl.replace(/\/$/,'');this.token=token;this.hostToken=hostToken;this.fetch=fetchImpl;this.timeoutMs=timeoutMs}
 async request(method,path,body){const res=await this.fetch(this.url+path,{method,signal:AbortSignal.timeout(this.timeoutMs),headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json',...(this.hostToken?{'x-everlight-host-token':this.hostToken}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await res.json();if(!res.ok)throw Object.assign(new Error(data.error||'HTTP '+res.status),{status:res.status,details:data});return data}
 guidance(scope,source_id,signals,privacy='normal',consent=false){return this.request('POST','/api/v8/guidance',{scope,source_id,signals,privacy,consent})}
 validate(candidate){return this.request('POST','/api/v8/proposal/validate',candidate)}
 hostHooks(){return this.request('GET','/api/v8/host/hooks')}
 capture(event){if(!event||!event.scope||!event.actor||!event.kind||!event.source_ref||event.body===undefined)throw Error('capture missing fields');return this.request('POST','/api/v8/source',event)}
 propose(candidate){const checked=checkProposalShape(candidate);if(!checked.ok)throw Error(checked.errors.join('; '));return this.request('POST','/api/v8/proposal',candidate)}
 review(scope,id,decision,reviewer,classification,review_reason,proposal_text=''){return this.request('POST','/api/v8/review/scoped',{scope,id,decision,reviewer,classification,review_reason,proposal_text})}
 commit(scope,id){return this.request('POST','/api/v8/commit/scoped',{scope,id})}
 revoke(scope,kind,target,reason){return this.request('POST','/api/v8/revoke',{scope,kind,target,reason})}
 recall(scope,query,limit=8,{rawEvidence=false,focusContext=null,retrievalHint,associationParent}={}){return this.request('POST','/api/v8/recall',{scope,query,limit,...(rawEvidence===true?{raw_evidence:true}:{}),...(focusContext?{focus_context:focusContext}:{}),...(retrievalHint!==undefined?{retrieval_hint:retrievalHint}:{}),...(associationParent?{association_parent:associationParent}:{})})}
 workContact(event){return this.request('POST','/api/v8/relations/work-contact',event)}
 searchSourceEvidence(scope,query,limit=8){return this.request('POST','/api/v8/s01/search',{scope,query,limit})}
 searchHistoricalVectorEvidence(scope,provider,dimensions,embedding,limit=5){return this.request('POST','/api/v8/s01/historical-vector-search',{scope,provider,dimensions,embedding,limit})}
 expandSourceEvidence(scope,id,hash,offset=0,limit=500){return this.request('POST','/api/v8/s01/expand',{scope,id,hash,offset,limit})}
 /** A caller-supplied snapshot is not a trusted provider receipt. */
 snapshotReadback(scope,run_id,messages,memoryMessageIndex=0){return this.request('POST','/api/v8/recall/readback',{scope,run_id,messages,...(memoryMessageIndex?{memory_message_index:memoryMessageIndex}:{})})}
 recallTransport(scope,run_id,request_hash,body_hash,upstream_status){return this.request('POST','/api/v8/recall/transport',{scope,run_id,request_hash,body_hash,upstream_status})}
 get protocol(){return PROTOCOL_VERSION}
}
