import {runRecovery} from './commit-recovery.mjs';
const {EVERLIGHT_CORE_URL,EVERLIGHT_CORE_TOKEN,EVERLIGHT_SHARED_HOST_TOKEN,EVERLIGHT_BOUND_SCOPE}=process.env;
if(!EVERLIGHT_BOUND_SCOPE||!EVERLIGHT_CORE_TOKEN||!EVERLIGHT_SHARED_HOST_TOKEN)throw Error('explicit scope and credentials required');
const c=new AbortController();for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>c.abort());
await runRecovery({baseUrl:EVERLIGHT_CORE_URL||'http://127.0.0.1:8790',token:EVERLIGHT_CORE_TOKEN,hostToken:EVERLIGHT_SHARED_HOST_TOKEN,scope:EVERLIGHT_BOUND_SCOPE,operation:'reminders'},{signal:c.signal,onCycle:r=>console.log(JSON.stringify(r))});
