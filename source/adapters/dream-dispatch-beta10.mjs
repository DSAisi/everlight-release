// Call from the existing durable inbox consumer. Host provides real model dispatch,
// stable request ID, and the exact messages used; never synthesize delivery receipts.
export function dreamDispatch({baseUrl,token,hostToken,scope,enqueue,fetchImpl=fetch}){
 const base=new URL(baseUrl);if(base.username||base.password||!(base.protocol==='https:'||base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname))||!token||!hostToken||!scope||typeof enqueue!=='function')throw Error('trusted host config and durable enqueue required');
 async function post(route,b){const r=await fetchImpl(new URL('/api/v8/shared/'+route,base),{method:'POST',redirect:'error',headers:{authorization:'Bearer '+token,'x-everlight-host-token':hostToken,'content-type':'application/json'},body:JSON.stringify({...b,scope}),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);return j;}
 return {async handle(e,{idempotencyKey}={}){if(!e.active||!e.wake||e.kind!=='action'||e.content?.kind!=='dream_request')return false;const a=e.content,key='dream:'+scope+':'+a.id;
 // enqueue must durably dedup by action key, not by changing event seq.
 const queued=await enqueue({actionId:a.id,key,body:a.body,scope});if(queued?.durable!==true)throw Error('host queue did not attest durable receipt');
 await post('ack',{id:a.id,actor:'host',receipt_ref:key});return true;},
 async readback({actionId,requestRef,messages}){return post('delivery',{id:actionId,request_ref:requestRef,messages});},
 async resolve({actionId,sourceId,outcome,detail}){return post('resolve',{id:actionId,actor:'ai',source_id:sourceId,outcome,detail,idempotency_key:'dream-result:'+scope+':'+actionId});}};
}
