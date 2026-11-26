// Trusted host integration; NEVER provide the receipt token to the model.
export function notificationClient({url,aiToken,receiptToken}){
 const base=new URL(url);if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||!['http:','https:'].includes(base.protocol)||base.username||base.password||!aiToken||!receiptToken||aiToken===receiptToken)throw Error('explicit local trusted host configuration required');
 async function call(p,token,body){const r=await fetch(new URL(p,base),{method:body?'POST':'GET',redirect:'error',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('notification HTTP '+r.status);return r.json();}
 return {async pending(){const items=[];let after='';do{const r=await call('/v1/inbox?'+new URLSearchParams({after,limit:'100'}),aiToken);items.push(...r.items.filter(x=>x.active&&x.action_body&&!x.ai_request_ref));after=r.next;}while(after);return items;},
 // Host calls AFTER sending the real outbound model request. Do not reconstruct messages from reminder.
 attest({id,request_ref,receipt_ref,messages}){return call('/v1/ai/receipt',receiptToken,{id,request_ref,receipt_ref,messages});}};
}
