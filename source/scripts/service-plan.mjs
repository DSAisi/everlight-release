import path from 'node:path';
export function servicePlan(env){
 const plan=['../core/server.mjs','../dashboard/server.mjs','../automation/supervisor.mjs'];
 if(env.EVERLIGHT_TRIAL_D14==='1')throw Error('Internal cognition runtime not included');
 if(env.EVERLIGHT_TRIAL_VECTOR==='1'){
  if(env.EVERLIGHT_VECTOR_INDEX_OPT_IN!=='1'||env.EVERLIGHT_VECTOR_OPT_IN!=='1'||!env.EVERLIGHT_VECTOR_CONSUMER||!env.EVERLIGHT_VECTOR_DB||!(env.EVERLIGHT_VECTOR_TOKEN?.length>=24))throw Error('vector configuration incomplete');
  const port=Number(env.EVERLIGHT_VECTOR_PORT||8793);if(!Number.isInteger(port)||port<1024||port>65535||env.EVERLIGHT_VECTOR_URL!==`http://127.0.0.1:${port}`)throw Error('local vector URL mismatch');
  if([env.EVERLIGHT_CORE_DB,env.EVERLIGHT_UI_DB].some(p=>path.resolve(p)===path.resolve(env.EVERLIGHT_VECTOR_DB)))throw Error('vector database must be separate');
  plan.unshift('../vector/server.mjs');
 }
 if(env.EVERLIGHT_TRIAL_GATEWAY==='1'){
  if(!(env.EVERLIGHT_GATEWAY_KEY?.length>=24)||!env.EVERLIGHT_UPSTREAM_KEY||!env.EVERLIGHT_MODELS?.split(',').some(x=>x.trim()))throw Error('gateway configuration incomplete');
  const u=new URL(env.EVERLIGHT_UPSTREAM_URL);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('invalid upstream');
  plan.push('../gateway/server.mjs');
 }
 return plan;
}
