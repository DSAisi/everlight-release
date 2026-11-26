/* Everlight Night Vault v6 — password-encrypted human records + public-key sealed host capture.
 * Server NEVER accepts plaintext intimacy records and cannot decrypt ciphertext.
 * Human grants and revokes channel-specific ongoing permission while unlocked.
 */
export function installVault(db){
 db.exec(`CREATE TABLE IF NOT EXISTS ui_night_vault (
  scope TEXT PRIMARY KEY, salt TEXT NOT NULL, rounds INTEGER NOT NULL,
  proof TEXT NOT NULL, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS ui_night_records (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL, envelope TEXT NOT NULL,
  revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS ui_night_scope ON ui_night_records(scope,updated_at);
 CREATE TABLE IF NOT EXISTS ui_night_auto (
  scope TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0,
  channels_json TEXT NOT NULL, public_jwk TEXT NOT NULL, private_envelope TEXT NOT NULL,
  updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS ui_night_deleted_events(event_id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS ui_night_private_evidence(event_id TEXT PRIMARY KEY, source_ref TEXT NOT NULL, channel_id TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS ui_night_capture_sources (
  record_id TEXT NOT NULL UNIQUE, event_id TEXT NOT NULL UNIQUE, channel_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS ui_night_capture_event ON ui_night_capture_sources(event_id);`);
}
const scope='personal',b64=/^[A-Za-z0-9+/]+={0,2}$/;
const validB64=(v,min=12,max=5500000)=>typeof v==='string'&&b64.test(v)&&v.length>=min&&v.length<=max;
function envelopeValid(v){return v&&Object.keys(v).every(k=>['v','iv','cipher'].includes(k))&&v.v===1&&validB64(v.iv,16,64)&&validB64(v.cipher,24,5500000);}
function sealedValid(v){return v&&Object.keys(v).every(k=>['v','alg','key','iv','cipher','tag'].includes(k))&&v.v===2&&v.alg==='RSA-OAEP-256+A256GCM'&&validB64(v.key,340,1500)&&validB64(v.iv,16,32)&&validB64(v.cipher,4,55000)&&validB64(v.tag,20,40);}
const channelValid=s=>typeof s==='string'&&s.length>=3&&s.length<=160&&/^[\w!@.#:\-]+$/.test(s);
function jwkValid(k){return k&&k.kty==='RSA'&&k.alg==='RSA-OAEP-256'&&k.key_ops?.includes('encrypt')&&typeof k.n==='string'&&k.n.length>=380&&k.n.length<1000&&k.e==='AQAB'&&!k.d;}
function getAuto(db){const a=db.prepare('SELECT * FROM ui_night_auto WHERE scope=?').get(scope);return a?{enabled:!!a.enabled,channels:JSON.parse(a.channels_json),publicJwk:JSON.parse(a.public_jwk),privateEnvelope:JSON.parse(a.private_envelope),updatedAt:a.updated_at}:{enabled:false,channels:[],publicJwk:null,privateEnvelope:null,updatedAt:null};}
const archivePrompt='长明夜契已由档案主人授权此私密频道。仅当本轮明确发生了双方自愿的亲密经历、当事人明确表达的亲密偏好变化、边界更正或事后交流，才在正常回答完成后给宿主提交一条【候选】。用一小段准确记录，包含 title、kind(moment/preference/promise/reflection)、reality(real/fiction)、note、sourceRef、happenedAt（已知真实时间或空值）。不得默认选 moment；偏好、约定、反思各用自身分类；密封前必须使用明确类别、非空标题和正文、真实来源引用、实际时间或明确未知；宿主本地验证后仅提交密文。服务器不具备密文语义验证能力。虚构角色扮演必须标 fiction；无法确定发生了什么就不提交。不得复制无关聊天、不得把猜测写成事实，过去的同意不能替代本轮同意。无需向人类重复询问是否逐条保存；若本轮明确拒绝保存或撤销许可，则本轮不提交。';
export async function handleVault(ctx){
 const {req,res,route,method,db,json,read,requireWrite,requireHost,transaction,audit,bad,newId,now}=ctx;
 const row=db.prepare('SELECT * FROM ui_night_vault WHERE scope=?').get(scope);
 if(route==='/host/night/reminder'&&method==='GET'){
  requireHost(req);const a=getAuto(db),channel=req.headers['x-everlight-channel-id'];
  const allowed=!!row&&a.enabled&&req.headers['x-everlight-chat-is-private']==='true'&&channelValid(channel)&&a.channels.includes(channel);
  return json(res,200,{shouldRemind:allowed,enabled:allowed, ...(allowed?{prompt:archivePrompt,publicJwk:a.publicJwk}:{}),note:allowed?'仅在授权私密频道允许提议，宿主须自行判定本轮有没有合格候选':'未授权、未配置或非允许频道'});
 }
 if(route==='/host/night/evidence'&&method==='POST'){
  requireHost(req);const x=await read(req),a=getAuto(db);
  if(!row||!a.enabled||x.chatIsPrivate!==true||x.userAuthorized!==true||!channelValid(x.channelId)||!a.channels.includes(x.channelId))throw bad(403,'未授权私密来源');
  const id=x.sourceEventId,ref=x.sourceRef;
  if(typeof id!=='string'||!id||id.length>160||typeof ref!=='string'||!ref||ref.length>300)throw bad(422,'来源字段无效');
  const old=db.prepare('SELECT * FROM ui_night_private_evidence WHERE event_id=?').get(id);
  if(old){if(old.deleted||old.source_ref!==ref||old.channel_id!==x.channelId)throw bad(409,'私密来源冲突或已撤回');return json(res,200,{id,duplicate:true});}
  db.prepare('INSERT INTO ui_night_private_evidence(event_id,source_ref,channel_id) VALUES(?,?,?)').run(id,ref,x.channelId);
  return json(res,201,{id,recorded:true});
 }
 if(route==='/host/night/revoke'&&method==='POST'){
  requireHost(req);const x=await read(req);const n=transaction(db,()=>{
   const changed=db.prepare('UPDATE ui_night_private_evidence SET deleted=1 WHERE event_id=? AND deleted=0').run(String(x.sourceEventId||'')).changes;
   if(!changed)throw bad(404,'私密来源不存在或已撤回');return purgeNightByEvent(db,x.sourceEventId);
  });return json(res,200,{revoked:true,removedNight:n});
 }
 if(route==='/host/night/capture'&&method==='POST'){
  requireHost(req);if(!row)throw bad(409,'夜契没有初始化');
  const x=await read(req),a=getAuto(db);
  if(!a.enabled||x.chatIsPrivate!==true||!channelValid(x.channelId)||!a.channels.includes(x.channelId))throw bad(403,'此聊天频道未获自动保存授权');
  if(x.adultAndConsenting!==true||x.userAuthorized!==true)throw bad(403,'缺少当前授权及成年人声明');
  if(!sealedValid(x.envelope))throw bad(422,'只接收公钥密封的亲密记忆，不接收明文');
  const eventId=String(x.sourceEventId||'').slice(0,160),ref=String(x.sourceRef||'').slice(0,300);
  if(!eventId||!ref)throw bad(422,'缺少真实来源事件');
  const ev=db.prepare('SELECT * FROM ui_night_private_evidence WHERE event_id=? AND deleted=0').get(eventId);
  if(!ev||ev.source_ref!==ref||ev.channel_id!==x.channelId)throw bad(422,'缺少可核对的私密对话事件');
  if(db.prepare('SELECT event_id FROM ui_night_deleted_events WHERE event_id=?').get(eventId))throw bad(410,'已人工删除，不允许自动重放');
  const existed=db.prepare('SELECT record_id FROM ui_night_capture_sources WHERE event_id=?').get(eventId);
  if(existed)return json(res,200,{id:existed.record_id,duplicate:true,sealed:true,canonicalMemoryChanged:false});
  const id=newId('N'),t=now();
  transaction(db,()=>{
   db.prepare('INSERT INTO ui_night_records VALUES(?,?,?,?,?,?)').run(id,scope,JSON.stringify(x.envelope),1,t,t);
   db.prepare('INSERT INTO ui_night_capture_sources VALUES(?,?,?,?)').run(id,eventId,x.channelId,t);
   audit(db,'trusted-host','night.sealed_capture',id,'ok',{sourceEventId:eventId,channelId:x.channelId,sealed:true});
  });
  return json(res,201,{id,sealed:true,autoRecorded:true,canonicalMemoryChanged:false});
 }
 requireWrite(req);
 if(route==='/vault/status'&&method==='GET'){
  const a=getAuto(db);return json(res,200,{configured:!!row,salt:row?.salt||null,rounds:row?.rounds||null,proof:row?JSON.parse(row.proof):null,privacy:'client_side_encrypted',hostRecallConnected:false,automaticCaptureConnected:a.enabled});
 }
 if(route==='/vault/setup'&&method==='POST'){
  if(row)throw bad(409,'私密档案已启用，不能覆盖密钥配置');
  const x=await read(req);
  if(!validB64(x.salt,22,64)||x.rounds!==250000||!envelopeValid(x.proof)||x.ackAdultAndConsent!==true)throw bad(422,'档案设置不完整');
  transaction(db,()=>{
   db.prepare('INSERT INTO ui_night_vault VALUES(?,?,?,?,?)').run(scope,x.salt,x.rounds,JSON.stringify(x.proof),now());
   audit(db,'vault-owner','night.configure','private','ok',{scope});
  });return json(res,201,{configured:true});
 }
 if(!row)throw bad(409,'尚未启用独立私密档案');
 if(route==='/vault/auto'&&method==='GET'){
  return json(res,200,{...getAuto(db),note:'公钥可以供授权宿主加密；私钥仅以口令加密包保存'});
 }
 if(route==='/vault/auto'&&method==='PUT'){
  const x=await read(req),old=getAuto(db);
  if(x.enabled!==true&&x.enabled!==false)throw bad(422,'必须明确传入启用或关闭');
  if(x.enabled){
   if(!Array.isArray(x.channels)||x.channels.length<1||x.channels.length>10||x.channels.some(c=>!channelValid(c)))throw bad(422,'至少选择一个有效的私密频道 ID');
   if(!old.publicJwk&&(!jwkValid(x.publicJwk)||!envelopeValid(x.privateEnvelope)))throw bad(422,'初次启用必须在已解锁浏览器生成并加密公私钥');
   // Key rotation without re-encrypting older sealed memories would make them unreadable.
   if(old.publicJwk&&x.publicJwk&&JSON.stringify(x.publicJwk)!==JSON.stringify(old.publicJwk))throw bad(409,'不支持直接轮换密钥，避免旧记忆无法解锁');
   const pub=old.publicJwk||x.publicJwk,priv=old.privateEnvelope||x.privateEnvelope;
   db.prepare(`INSERT INTO ui_night_auto VALUES(?,?,?,?,?,?) ON CONFLICT(scope) DO UPDATE SET enabled=excluded.enabled,channels_json=excluded.channels_json,public_jwk=excluded.public_jwk,private_envelope=excluded.private_envelope,updated_at=excluded.updated_at`).run(scope,1,JSON.stringify([...new Set(x.channels)]),JSON.stringify(pub),JSON.stringify(priv),now());
  }else{
   if(old.publicJwk)db.prepare('UPDATE ui_night_auto SET enabled=0,updated_at=? WHERE scope=?').run(now(),scope);
  }
  audit(db,'vault-owner','night.auto_settings','private','ok',{enabled:x.enabled,channelCount:x.enabled?x.channels.length:0});
  return json(res,200,{enabled:getAuto(db).enabled,channels:getAuto(db).channels,hasSealingKey:!!getAuto(db).publicJwk});
 }
 if(route==='/vault/entries'&&method==='GET'){
  const rows=db.prepare('SELECT id,envelope,revision,created_at,updated_at FROM ui_night_records WHERE scope=? ORDER BY updated_at DESC LIMIT 300').all(scope);
  return json(res,200,{items:rows.map(x=>({id:x.id,envelope:JSON.parse(x.envelope),revision:x.revision,createdAt:x.created_at,updatedAt:x.updated_at})),note:'服务器仅保存密文；自动入库同样是密文'});
 }
 if(route==='/vault/entries'&&method==='POST'){
  const x=await read(req);if(!envelopeValid(x.envelope))throw bad(422,'密文包格式不正确');
  const id=newId('N'),t=now();transaction(db,()=>{
   db.prepare('INSERT INTO ui_night_records VALUES(?,?,?,?,?,?)').run(id,scope,JSON.stringify(x.envelope),1,t,t);
   audit(db,'vault-owner','night.create',id,'ok',{encrypted:true});
  });return json(res,201,{id,revision:1,createdAt:t,updatedAt:t});
 }
 const match=/^\/vault\/entries\/([A-Za-z0-9_-]{3,100})$/.exec(route);
 if(match){
  const id=match[1],old=db.prepare('SELECT * FROM ui_night_records WHERE scope=? AND id=?').get(scope,id);
  if(!old)throw bad(404,'档案不存在');
  if(method==='PATCH'||method==='DELETE'){
   const x=await read(req);const current=db.prepare('SELECT revision FROM ui_night_records WHERE scope=? AND id=?').get(scope,id);if(!current||current.revision!==old.revision||!Number.isSafeInteger(x.expectedRevision)||x.expectedRevision!==old.revision)throw bad(409,'档案已被更新，请刷新后重试');
   if(method==='PATCH'){
    if(!envelopeValid(x.envelope))throw bad(422,'密文包格式不正确');const t=now();
    transaction(db,()=>{
     db.prepare('UPDATE ui_night_records SET envelope=?,revision=?,updated_at=? WHERE scope=? AND id=?').run(JSON.stringify(x.envelope),old.revision+1,t,scope,id);
     audit(db,'vault-owner','night.update',id,'ok',{revision:old.revision+1,encrypted:true});
    });return json(res,200,{id,revision:old.revision+1,updatedAt:t});
   }
   if(x.confirm!==true)throw bad(422,'请明确确认删除');
   transaction(db,()=>{
    db.prepare('INSERT OR IGNORE INTO ui_night_deleted_events SELECT event_id,? FROM ui_night_capture_sources WHERE record_id=?').run(now(),id);
    db.prepare('DELETE FROM ui_night_capture_sources WHERE record_id=?').run(id);
    db.prepare('DELETE FROM ui_night_records WHERE scope=? AND id=?').run(scope,id);
    audit(db,'vault-owner','night.delete',id,'ok',{deleted:true});
   });return json(res,200,{deleted:true,id,notice:'当前档案已删除；生产备份策略需要单独配置'});
  }
 }
 if(route==='/vault/reset'&&method==='POST'){
  const x=await read(req);if(x.confirm!=='DELETE-NIGHT-VAULT')throw bad(422,'需要输入完整销毁确认文字');
  transaction(db,()=>{
   db.prepare('INSERT OR IGNORE INTO ui_night_deleted_events SELECT event_id,? FROM ui_night_capture_sources').run(now());
   db.prepare('UPDATE ui_night_private_evidence SET deleted=1').run();
   db.prepare('DELETE FROM ui_night_capture_sources').run();
   db.prepare('DELETE FROM ui_night_auto WHERE scope=?').run(scope);
   db.prepare('DELETE FROM ui_night_records WHERE scope=?').run(scope);
   db.prepare('DELETE FROM ui_night_vault WHERE scope=?').run(scope);
   audit(db,'vault-owner','night.reset','private','ok',{scope});
  });return json(res,200,{reset:true,note:'当前数据库记录已清除；不包含独立备份或存储快照'});
 }
 throw bad(404,'没有这个私密档案接口');
}
export function purgeNightByEvent(db,eventId){
 const r=db.prepare('SELECT record_id FROM ui_night_capture_sources WHERE event_id=?').get(eventId);
 if(!r)return 0;
 db.prepare('DELETE FROM ui_night_records WHERE id=?').run(r.record_id);
 db.prepare('DELETE FROM ui_night_capture_sources WHERE event_id=?').run(eventId);
 return 1;
}
