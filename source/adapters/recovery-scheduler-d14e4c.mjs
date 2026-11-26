// Opt-in host lifecycle integration: never calls run/invoke, only record recovery.
export function startRecoveryScheduler({capture,enabled=false,intervalMs=5000,maxDelayMs=60000,limit=100,onReport=()=>{},onError=()=>{}}){
 if(typeof enabled!=='boolean'||!Number.isSafeInteger(intervalMs)||intervalMs<10||!Number.isSafeInteger(maxDelayMs)||maxDelayMs<intervalMs||!Number.isSafeInteger(limit)||limit<1||limit>1000||typeof capture?.recover!=='function'||typeof onReport!=='function'||typeof onError!=='function')throw Error('invalid recovery configuration');
 let timer=null,active=null,stopped=!enabled,delay=intervalMs,last=null,failures=0;
 const notify=(fn,x)=>{try{fn(x)}catch{/* reporting must not stop recovery */}};
 function schedule(ms){if(!stopped){timer=setTimeout(tick,ms);timer.unref?.();}}
 function tick(){timer=null;if(stopped)return;active=(async()=>{try{const r=await Promise.resolve().then(()=>capture.recover({limit}));const pending=r.pendingCount+(r.activityPendingCount??0);const stalled=r.results.some(x=>x.recording==='terminal_pending')||(r.activityResults??[]).some(x=>x.recording==='pending');last={at:new Date().toISOString(),pending,unresolved:r.unresolvedCount,conflicts:r.conflictCount+(r.activityConflictCount??0),failed:false};failures=stalled?failures+1:0;delay=stalled?Math.min(maxDelayMs,Math.max(intervalMs,delay*2)):intervalMs;notify(onReport,last);}catch{failures++;delay=Math.min(maxDelayMs,delay*2);last={at:new Date().toISOString(),failed:true};notify(onError,last);}finally{active=null;schedule(delay);}})();}
 if(enabled)schedule(0);
 return {status:()=>({enabled:!stopped,running:!!active,delayMs:delay,failures,last:last&&{...last}}),async stop(){stopped=true;clearTimeout(timer);if(active)await active;}};
}
