/** Read-only probe. A successful models route proves only local gateway readiness. */
export async function gatewayHealth(env=process.env,fetchImpl=fetch){
 const checked_at=new Date().toISOString();const base={checked_at,upstream_verified:false,provider_delivery_verified:false};
 if(env.EVERLIGHT_TRIAL_GATEWAY!=='1')return {...base,state:'disabled'};
 const port=Number(env.EVERLIGHT_GATEWAY_PORT||8792),key=env.EVERLIGHT_GATEWAY_KEY||'';
 if(!Number.isSafeInteger(port)||port<1024||port>65535||key.length<24)return {...base,state:'configuration_error'};
 try{const r=await fetchImpl(`http://127.0.0.1:${port}/v1/models`,{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(2500),redirect:'error'});
 if(!r.ok)return {...base,state:'unavailable',http_status:r.status};const d=await r.json();if(d.object!=='list'||!Array.isArray(d.data))return {...base,state:'invalid_response'};
 return {...base,state:'ready',model_count:d.data.length};}catch{return {...base,state:'unavailable'};}
}
