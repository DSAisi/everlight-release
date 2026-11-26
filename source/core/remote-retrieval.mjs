// Remote search is opt-in; only the query and scope leave the core.
export function remoteRetrieval(env=process.env,fetchImpl=fetch){
 if(!env.EVERLIGHT_VECTOR_URL)return null;
 if(env.EVERLIGHT_VECTOR_OPT_IN!=='1')throw Error('remote vector requires explicit data transfer opt-in');
 const url=new URL(env.EVERLIGHT_VECTOR_URL);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('invalid vector URL');
 if(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('remote vector requires HTTPS');
 const token=env.EVERLIGHT_VECTOR_TOKEN;if(!token||token.length<24)throw Error('vector credential required');
 const timeout=env.EVERLIGHT_D14C_INDEXED==='1'?Number(env.EVERLIGHT_D14C_VECTOR_TIMEOUT_MS||250):3000;
 if(!Number.isInteger(timeout)||timeout<50||timeout>3000)throw Error('vector timeout must be 50..3000ms');
 return async ({scope,query})=>{
  try{const r=await fetchImpl(new URL('/search',url),{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({scope,q:query,k:100}),signal:AbortSignal.timeout(timeout)});if(!r.ok)throw Error('vector HTTP failure');const j=await r.json();if(!Array.isArray(j.results)||j.results.length>100)throw Error('invalid vector response');const hits=j.results.filter(x=>typeof x.id==='string'&&Number.isInteger(x.revision)).map(({id,revision})=>({id,revision}));return {name:'remote-vector',search:()=>hits};}catch{return {name:'remote-vector',search:()=>{throw Error('remote vector unavailable')}};}
 };
}
