import {createHash} from 'node:crypto';
import {engineOf,validEngineEvent} from '../protocol/engine-events-d14e5c.mjs';
const hash=b=>createHash('sha256').update(JSON.stringify(b)).digest('hex');
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export function recordEngineEvent(c,b){
 if(process.env.EVERLIGHT_D14E5C_ENGINE_CAPTURE!=='1'||!process.env.EVERLIGHT_BOUND_SCOPE||b?.scope!==process.env.EVERLIGHT_BOUND_SCOPE)fail(403,'E5C disabled or scope unauthorized');
 if(!validEngineEvent(b))fail(422,'invalid engine audit metadata');
 const data={scope:b.scope,instance:b.instance,audit_id:b.audit_id,event:b.event,occurred_at:b.occurred_at},engine=engineOf[data.event],key='e5c:'+hash([data.scope,data.instance,data.audit_id]),digest=hash(data);
 return c.tx(()=>{const old=c.db.prepare('SELECT * FROM sources WHERE id=?').get(key);if(old&&(old.revoked||old.hash!==digest||old.scope!==data.scope||old.kind!=='host_engine_event'||old.actor!=='host'||old.source_ref!==key))fail(409,'engine event replay conflict or revoked evidence');
 const s=c.source({scope:data.scope,actor:'host',kind:'host_engine_event',source_id:key,source_ref:key,body:data},true);
 let r;if(old){r=c.db.prepare("SELECT * FROM receipts WHERE scope=? AND subject=? AND op='e5c.engine.observed'").get(data.scope,key);if(!r||r.result!==data.event||JSON.parse(r.details).digest!==digest)fail(409,'engine receipt mismatch');}else{r=c.receipt('e5c.engine.observed',data.scope,key,data.event,{engine,digest});}
 return {instance:data.instance,audit_id:data.audit_id,event:data.event,occurred_at:data.occurred_at,engine,source_id:s.id,receipt_id:r.id,idempotent:!!old,canonicalMemoryChanged:false,task_verified:false};});
}
