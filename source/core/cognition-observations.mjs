import crypto from 'node:crypto';
const allowed=new Set(['domains','env','vitals']);
export const observationCategories={domains:['work','learning','skill','interest','custom'],env:['physical','digital','social','routine','custom'],vitals:['sleep','activity','nutrition','self_report','custom']};
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status})};
const check=(x,m)=>{if(!x)fail(m)};
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max;
const keyFor=secret=>crypto.createHash('sha256').update('everlight-vitals-v1:'+secret).digest();
const encode=(payload,secret,aad)=>{if(!secret)return JSON.stringify(payload);const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',keyFor(secret),iv);c.setAAD(Buffer.from(aad));const data=Buffer.concat([c.update(JSON.stringify(payload)),c.final()]);return JSON.stringify({iv:iv.toString('base64'),data:data.toString('base64'),tag:c.getAuthTag().toString('base64')})};
const decode=(row,secret)=>{if(row.module!=='vitals')return JSON.parse(row.payload);try{const x=JSON.parse(row.payload),d=crypto.createDecipheriv('aes-256-gcm',keyFor(secret),Buffer.from(x.iv,'base64'));d.setAAD(Buffer.from(JSON.stringify([row.scope,row.id])));d.setAuthTag(Buffer.from(x.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(x.data,'base64')),d.final()]).toString())}catch{fail('身体记录无法解密，请核对独立密钥',409)}};
export function installObservations(db){db.exec(`CREATE TABLE IF NOT EXISTS cognitive_observations(id TEXT PRIMARY KEY,scope TEXT NOT NULL,module TEXT NOT NULL,source_id TEXT,payload TEXT,idem TEXT NOT NULL,digest TEXT NOT NULL,created_at TEXT NOT NULL,withdrawn INTEGER NOT NULL DEFAULT 0,UNIQUE(scope,module,idem));CREATE INDEX IF NOT EXISTS ix_observations_scope ON cognitive_observations(scope,module,withdrawn,created_at);`)}
const filter=`scope=? AND module=? AND withdrawn=0 AND (source_id IS NULL OR EXISTS(SELECT 1 FROM sources s WHERE s.id=cognitive_observations.source_id AND s.scope=cognitive_observations.scope AND s.revoked=0))`;
export function observationPage(db,{scope,name,limit,offset,secret}){
 if(name==='vitals'&&!secret)return {available:false,total:null,rows:[],note:'身体读数默认关闭；需独立密钥、面板授权及逐条明确同意。'};
 const total=db.prepare(`SELECT count(*) n FROM cognitive_observations WHERE ${filter}`).get(scope,name).n;
 const rows=db.prepare(`SELECT * FROM cognitive_observations WHERE ${filter} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).all(scope,name,limit,offset).map(r=>({id:r.id,...decode(r,secret),source_id:r.source_id,at:r.created_at}));
 return {available:true,total,rows,note:name==='vitals'?'独立加密的人工自述读数；不进入普通检索、梦境或自动分类，不是医疗判断。':'有来源的独立观察记录；不是规范记忆，也不自动推断为当前事实。'};
}
export function observationWrite(core,b,secret){const {scope,name,action,idempotency_key}=b;check(text(scope,256)&&allowed.has(name),'模块或作用域无效');if(name==='vitals'&&!secret)fail('身体读数需独立授权',403);
 return core.tx(()=>{const db=core.db;if(action==='withdraw'){check(text(b.id,256),'缺少记录编号');const r=db.prepare('SELECT * FROM cognitive_observations WHERE scope=? AND module=? AND id=?').get(scope,name,b.id);if(!r)fail('记录不存在',404);db.prepare('UPDATE cognitive_observations SET withdrawn=1,payload=NULL WHERE id=?').run(r.id);return {id:r.id,withdrawn:true,readback_verified:db.prepare('SELECT withdrawn,payload FROM cognitive_observations WHERE id=?').get(r.id).payload===null};}
 check(action==='create'&&text(idempotency_key,128)&&text(b.title,120)&&text(b.detail,2000),'需要标题、内容及请求编号');check(typeof b.observed_at==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(b.observed_at)&&Number.isFinite(Date.parse(b.observed_at)),'需要明确观察时间');
 const strict=process.env.EVERLIGHT_STRICT_WRITE_D9==='1';
 if(strict||b.category!==undefined){check(observationCategories[name].includes(b.category),'观察分类必填且必须符合模块');check(b.category==='custom'?text(b.category_label,60):b.category_label==null||b.category_label==='','自定义分类名无效');}
 const observed_at=new Date(b.observed_at).toISOString();let payload={title:b.title.trim(),detail:b.detail.trim(),observed_at,attribution:name==='vitals'?'consented_self_report':'source_linked_annotation'},source_id=null;
 if(b.category!==undefined){payload.category=b.category;payload.category_label=b.category==='custom'?b.category_label.trim():null;}
 if(name==='vitals'){check(b.consent===true,'须逐条同意保存身体读数');check(text(b.source_ref,200),'需要自述或设备来源说明');payload.source_ref=b.source_ref.trim();}
 else {check(text(b.source_id,256)&&!!core.getSource(b.source_id,scope),'需要有效同域来源 ID');source_id=b.source_id;}
 const raw=JSON.stringify([payload,source_id]);const digest=name==='vitals'?crypto.createHmac('sha256',keyFor(secret)).update(raw).digest('hex'):crypto.createHash('sha256').update(raw).digest('hex');
 const old=db.prepare('SELECT * FROM cognitive_observations WHERE scope=? AND module=? AND idem=?').get(scope,name,idempotency_key);
 if(old){if(old.withdrawn||old.digest!==digest)fail('重复请求冲突或记录已撤回',409);return {id:old.id,idempotent:true,readback_verified:true};}
 const id=crypto.randomUUID(),stamp=new Date().toISOString();db.prepare('INSERT INTO cognitive_observations VALUES(?,?,?,?,?,?,?,?,0)').run(id,scope,name,source_id,encode(payload,name==='vitals'?secret:null,JSON.stringify([scope,id])),idempotency_key,digest,stamp);
 const stored=db.prepare('SELECT * FROM cognitive_observations WHERE id=? AND scope=?').get(id,scope);check(JSON.stringify(decode(stored,secret))===JSON.stringify(payload),'写入读回不一致');return {id,readback_verified:true,canonicalMemoryChanged:false};});}
