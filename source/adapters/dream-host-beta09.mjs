// Host must supply real idle status and actual permission. No model invocation is simulated.
export function dreamHost({baseUrl,token,hostToken,scope,fetchImpl=fetch}){
 if(!baseUrl||!token||!hostToken||!scope)throw Error('explicit trusted host config required');
 const base=new URL(baseUrl);if(base.username||base.password||!(base.protocol==='https:'||base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)))throw Error('invalid trusted core URL');
 const post=async(route,b)=>{const r=await fetchImpl(new URL('/api/v8/dream/'+route,base),{method:'POST',redirect:'error',headers:{authorization:'Bearer '+token,'x-everlight-host-token':hostToken,'content-type':'application/json'},body:JSON.stringify({...b,scope}),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);return j};
 return {opportunity:({idle,enabled})=>post('opportunity',{idle,enabled}),start:({idempotency_key,metadata,source_ids})=>{if(!Array.isArray(source_ids))throw Error('explicit evidence selection required');return post('start',{idempotency_key,metadata,source_ids})},advance:({id,expected_stage})=>post('advance',{id,expected_stage}),improvement:b=>post('improvement',b),revision:b=>post('revision',b),replay:b=>post('replay',b)};
}
