/* Photo Archive: explicit opt-in, verifiable provenance, no automatic access to private vault.
   Assets never live under the public static directory. Local isolated SQLite + files only. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const ALLOWED=new Set(['manual','human_message','ai_generated','tool_capture','ai_bookmarked']);
const MAX=12*1024*1024;
const TXT=(s,n=240)=>String(s||'').trim().slice(0,n);
const jsonHeaders={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const stamp=()=>new Date().toISOString();
function imageType(buf){if(buf.length>=8&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(buf.length>=3&&buf[0]===255&&buf[1]===216&&buf[2]===255)return 'image/jpeg';
 if(buf.length>=12&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')return 'image/webp';
 if(buf.length>=6&&['GIF89a','GIF87a'].includes(buf.toString('ascii',0,6)))return 'image/gif';
 return null;
}
function obj(db,id){return db.prepare(`SELECT r.*,a.mime,a.bytes,a.sha256,e.actor AS source_actor, (SELECT note FROM ui_photo_annotations p WHERE p.photo_id=r.id AND p.author_kind='ai_reported' ORDER BY p.created_at DESC LIMIT 1) AS ai_description, (SELECT created_at FROM ui_photo_annotations p WHERE p.photo_id=r.id AND p.author_kind='ai_reported' ORDER BY p.created_at DESC LIMIT 1) AS ai_read_at FROM ui_photo_items r JOIN ui_photo_assets a ON r.asset_id=a.id LEFT JOIN ui_source_events e ON e.id=r.event_id WHERE r.id=?`).get(id)}
function publicItem(r){return {id:r.id,assetId:r.asset_id,mime:r.mime,bytes:r.bytes,sha256:r.sha256,title:r.title,note:r.note,aiDescription:r.ai_description||null,aiReadAt:r.ai_read_at||null,descriptionSource:r.description_source,sourceKind:r.source_kind,sourceActor:r.source_actor||'手动上传者',sourceRef:r.source_ref,eventId:r.event_id,capturedAt:r.captured_at,createdAt:r.created_at,updatedAt:r.updated_at,revision:r.revision,album:r.album||'',favorite:!!r.favorite,tags:(()=>{try{return JSON.parse(r.tags||'[]')}catch{return []}})(),photoUrl:`/ui/api/v1/media/items/${encodeURIComponent(r.id)}/blob`,status:r.status};}
function settings(db){let x=db.prepare("SELECT * FROM ui_photo_settings WHERE owner='personal'").get();return x?{autoEnabled:!!x.enabled,human_message:!!x.human_message,ai_generated:!!x.ai_generated,tool_capture:!!x.tool_capture,ai_bookmarked:!!x.ai_bookmarked,updatedAt:x.updated_at}:{autoEnabled:false,human_message:false,ai_generated:false,tool_capture:false,ai_bookmarked:false,updatedAt:null};}
export function installMedia(db){db.exec(`
 CREATE TABLE IF NOT EXISTS ui_photo_deleted_events(event_id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS ui_photo_settings(owner TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,human_message INTEGER NOT NULL DEFAULT 0,ai_generated INTEGER NOT NULL DEFAULT 0,tool_capture INTEGER NOT NULL DEFAULT 0,ai_bookmarked INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS ui_photo_assets(id TEXT PRIMARY KEY,sha256 TEXT NOT NULL UNIQUE,mime TEXT NOT NULL,bytes INTEGER NOT NULL,file_name TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS ui_photo_items(id TEXT PRIMARY KEY,asset_id TEXT NOT NULL REFERENCES ui_photo_assets(id),title TEXT NOT NULL,note TEXT NOT NULL,description_source TEXT NOT NULL,source_kind TEXT NOT NULL,source_ref TEXT NOT NULL,event_id TEXT,captured_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'active');
 CREATE TABLE IF NOT EXISTS ui_photo_annotations(id TEXT PRIMARY KEY,photo_id TEXT NOT NULL,author_kind TEXT NOT NULL,note TEXT NOT NULL,event_id TEXT,source_ref TEXT,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS ui_photo_notes_photo ON ui_photo_annotations(photo_id);
 CREATE INDEX IF NOT EXISTS ui_photo_items_time ON ui_photo_items(created_at DESC);
 CREATE INDEX IF NOT EXISTS ui_photo_items_event ON ui_photo_items(event_id);
 CREATE INDEX IF NOT EXISTS ui_photo_items_asset ON ui_photo_items(asset_id);
 CREATE UNIQUE INDEX IF NOT EXISTS ui_photo_one_source ON ui_photo_items(asset_id,source_ref,source_kind);`);
 const cols=db.prepare('PRAGMA table_info(ui_photo_items)').all().map(x=>x.name);
 if(!cols.includes('album'))db.exec("ALTER TABLE ui_photo_items ADD COLUMN album TEXT NOT NULL DEFAULT ''");
 if(!cols.includes('favorite'))db.exec('ALTER TABLE ui_photo_items ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0');
 if(!cols.includes('tags'))db.exec("ALTER TABLE ui_photo_items ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
}

async function readBinary(req,bad){const rawLength=Number(req.headers['content-length']||0);if(rawLength>MAX)throw bad(413,'图片大于12MB限制');const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>MAX)throw bad(413,'图片大于12MB限制');chunks.push(c)}let bytes=Buffer.concat(chunks);if(bytes.length===0)throw bad(422,'图片不能为空');let mime=imageType(bytes);if(!mime)throw bad(415,'仅支持 JPEG、PNG、WEBP、GIF；拒绝 SVG 等主动内容');return {bytes,mime};}
export async function handleMedia({req,res,route,method,db,json,read,requireWrite,requireHost,audit,bad,newId,now,root}){
 const kind=TXT(req.headers['x-everlight-source-kind'],40)||'manual';
 const mediaHome=path.join(path.dirname(process.env.EVERLIGHT_UI_DB||path.join(root,'private-data','everlight-ui.sqlite')),'everlight-media');
 const completed=route==='/host/media/completed';
 const hostCapture=route==='/host/media/capture'||completed,hostEndpoint=route.startsWith('/host/media/');
 if(hostEndpoint){requireHost(req);}else{requireWrite(req);}
 if(route==='/media/settings'){
  if(method==='GET')return json(res,200,settings(db));
  if(method==='PUT'){const s=await read(req);const vals=['autoEnabled','human_message','ai_generated','tool_capture','ai_bookmarked'];if(vals.some(k=>typeof s[k]!=='boolean'))throw bad(422,'请明确提交五项授权开关');
   db.prepare(`INSERT INTO ui_photo_settings(owner,enabled,human_message,ai_generated,tool_capture,ai_bookmarked,updated_at) VALUES('personal',?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET enabled=excluded.enabled,human_message=excluded.human_message,ai_generated=excluded.ai_generated,tool_capture=excluded.tool_capture,ai_bookmarked=excluded.ai_bookmarked,updated_at=excluded.updated_at`).run(+s.autoEnabled,+s.human_message,+s.ai_generated,+s.tool_capture,+s.ai_bookmarked,now());
   audit(db,'human','media.settings','personal','ok',s);return json(res,200,settings(db));}
 }
 if(route==='/media/activity'&&method==='GET'){const rows=db.prepare("SELECT actor,action,target,at,result FROM ui_audit WHERE action LIKE 'media.%' ORDER BY at DESC LIMIT 100").all();return json(res,200,{items:rows});}
 if(route==='/media/albums'&&method==='GET'){
  const rows=db.prepare(`SELECT COALESCE(NULLIF(r.album,''),'未分类') AS name, COUNT(*) AS count,
   (SELECT z.id FROM ui_photo_items z LEFT JOIN ui_source_events ez ON ez.id=z.event_id
    WHERE COALESCE(NULLIF(z.album,''),'未分类')=COALESCE(NULLIF(r.album,''),'未分类') AND z.status='active' AND (z.event_id IS NULL OR ez.deleted=0)
    ORDER BY COALESCE(z.captured_at,z.created_at) DESC LIMIT 1) AS coverId
   FROM ui_photo_items r LEFT JOIN ui_source_events e ON e.id=r.event_id
   WHERE r.status='active' AND (r.event_id IS NULL OR e.deleted=0) GROUP BY COALESCE(NULLIF(r.album,''),'未分类') ORDER BY count DESC,name ASC`).all();
  return json(res,200,{items:rows.map(r=>({...r,coverUrl:r.coverId?`/ui/api/v1/media/items/${encodeURIComponent(r.coverId)}/blob`:null})),note:'相册名为人工归类；未分类为自动归档的默认位置'});
 }
 if(route==='/media/summary'&&method==='GET'){
  const rows=db.prepare(`SELECT r.source_kind AS k, COUNT(*) AS n FROM ui_photo_items r LEFT JOIN ui_source_events e ON e.id=r.event_id WHERE r.status='active' AND (r.event_id IS NULL OR e.deleted=0) GROUP BY r.source_kind`).all();
  const total=rows.reduce((n,r)=>n+r.n,0);
  const favorite=db.prepare(`SELECT COUNT(*) n FROM ui_photo_items r LEFT JOIN ui_source_events e ON e.id=r.event_id WHERE r.status='active' AND r.favorite=1 AND (r.event_id IS NULL OR e.deleted=0)`).get().n;
  const last=db.prepare(`SELECT MAX(COALESCE(r.captured_at,r.created_at)) AS at FROM ui_photo_items r LEFT JOIN ui_source_events e ON e.id=r.event_id WHERE r.status='active' AND (r.event_id IS NULL OR e.deleted=0)`).get();
  return json(res,200,{total,favorite,bySource:Object.fromEntries(rows.map(x=>[x.k,x.n])),lastPhotoAt:last.at,note:'不包含夜契内容'});
 }
 if(route==='/media/items'&&method==='GET'){
  const qs=new URL(req.url,'http://127.0.0.1').searchParams;
  const limit=qs.has('limit')?Math.min(100,Math.max(1,Math.floor(Number(qs.get('limit'))||60))):300;
  const offset=Math.min(50000,Math.max(0,Math.floor(Number(qs.get('offset'))||0)));
  const source=TXT(qs.get('source'),40),album=TXT(qs.get('album'),80),q=TXT(qs.get('q'),100),sort=qs.get('sort')==='oldest'?'ASC':'DESC';
  const conditions=["r.status='active'",'(r.event_id IS NULL OR e.deleted=0)'];const args=[];
  if(source){if(!ALLOWED.has(source))throw bad(422,'未知照片来源');conditions.push('r.source_kind=?');args.push(source)}
  if(album){conditions.push("COALESCE(NULLIF(r.album,''),'未分类')=?");args.push(album)}
  if(q){conditions.push(`(r.title LIKE ? ESCAPE '\\' OR r.note LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM ui_photo_annotations ann WHERE ann.photo_id=r.id AND ann.note LIKE ? ESCAPE '\\'))`);const like='%'+q.replace(/[\%_]/g,m=>'\\'+m)+'%';args.push(like,like,like)}
  if(qs.get('favorites')==='1')conditions.push('r.favorite=1');
  const where='WHERE '+conditions.join(' AND ');
  const from='FROM ui_photo_items r JOIN ui_photo_assets a ON a.id=r.asset_id LEFT JOIN ui_source_events e ON e.id=r.event_id';
  const total=db.prepare(`SELECT COUNT(*) n ${from} ${where}`).get(...args).n;
  const rows=db.prepare(`SELECT r.*,a.mime,a.bytes,a.sha256,e.actor AS source_actor,
    (SELECT note FROM ui_photo_annotations p WHERE p.photo_id=r.id AND p.author_kind='ai_reported' ORDER BY p.created_at DESC LIMIT 1) AS ai_description,
    (SELECT created_at FROM ui_photo_annotations p WHERE p.photo_id=r.id AND p.author_kind='ai_reported' ORDER BY p.created_at DESC LIMIT 1) AS ai_read_at
    ${from} ${where} ORDER BY COALESCE(r.captured_at,r.created_at) ${sort},r.created_at ${sort} LIMIT ? OFFSET ?`).all(...args,limit,offset);
  return json(res,200,{items:rows.map(publicItem),count:rows.length,total,limit,offset,hasMore:offset+rows.length<total,note:'仅含经授权收藏的照片；不含夜契私密照片'});
 }
 const upload=route==='/media/upload'||hostCapture;
 if(upload&&method==='POST'){
  const strict=process.env.EVERLIGHT_STRICT_WRITE_D9==='1';const albumRaw=decodeURIComponentSafe(req.headers['x-everlight-album']);const album=String(albumRaw||'').trim();
  if((strict||req.headers['x-everlight-album']!==undefined)&&(!album||album.length>60||album==='未分类'))throw bad(422,'需要明确相册名称（1–60字），不得使用未分类占位');
  if(process.env.EVERLIGHT_STRICT_WRITE_D9==='1'&&hostCapture&&!completed)throw bad(422,'D9 自动照片归档必须使用 completed 及真实读取回执');
  if(strict&&!req.headers['x-everlight-source-kind'])throw bad(422,'D9 需要明确来源分类');
  if(!ALLOWED.has(kind))throw bad(422,'不支持的照片来源');if(req.headers['x-everlight-private']==='true')throw bad(403,'私密照片必须使用夜契端侧加密，普通照片馆禁止接收');
  if(hostCapture&&kind==='manual')throw bad(422,'宿主不能冒充人类手动上传');
  if(!hostCapture&&kind!=='manual')throw bad(422,'聊天和工具图片由已授权宿主负责提交；手动上传请使用 manual');
  let sourceRef=TXT(req.headers['x-everlight-source-ref'],240),eventId=TXT(req.headers['x-everlight-event-id'],160);
  const capturedAt=TXT(req.headers['x-everlight-captured-at'],80)||null,title=TXT(decodeURIComponentSafe(req.headers['x-everlight-title']),120)||'未命名影像';
  if(capturedAt&&!Number.isFinite(Date.parse(capturedAt)))throw bad(422,'照片时间格式无效');
  if(hostCapture){const cfg=settings(db);if(!cfg.autoEnabled||!cfg[kind])throw bad(403,'该来源自动归档没有被开启');if(!eventId||!sourceRef)throw bad(422,'自动归档必须携带真实宿主事件 ID 和来源引用');
   const e=db.prepare('SELECT id,source_ref,kind FROM ui_source_events WHERE id=? AND deleted=0').get(eventId);if(!e||e.source_ref!==sourceRef||!['image_received','image_generated','tool_image','image_bookmarked'].includes(e.kind))throw bad(422,'来源事件不存在、已撤回或不匹配');
  }else{eventId=null;sourceRef=`manual:${crypto.randomUUID()}`;}
  // Complete only after the AI's actual response event is recorded by the trusted host.
  // Reject before writing any photo bytes if the model-reading receipt is absent.
  let analysis=null;
  if(completed){
   const responseEventId=TXT(req.headers['x-everlight-response-event-id'],160),responseRef=TXT(req.headers['x-everlight-response-source-ref'],240);
   const description=TXT(decodeURIComponentSafe(req.headers['x-everlight-ai-description']),1200);
   if(!responseEventId||!responseRef||!description)throw bad(422,'必须提供 AI 真实回复事件与读取后的描述');
   const e=db.prepare('SELECT id,kind,actor,subject,field,value,source_ref,deleted FROM ui_source_events WHERE id=? AND deleted=0').get(responseEventId);
   if(!e||e.source_ref!==responseRef||!['assistant_response','image_analysis_result'].includes(e.kind)||e.field!=='visual_input_consumed'||!String(e.value||'').split(',').includes(eventId))throw bad(422,'没有可信且指向这张图片的 AI 阅读/回复回执');
   analysis={eventId:responseEventId,sourceRef:responseRef,description};
  }
  const {bytes,mime}=await readBinary(req,bad);const sha=crypto.createHash('sha256').update(bytes).digest('hex');
  // Re-check after asynchronous body read, before touching disk.
  if(hostCapture){
   const cfg=settings(db);if(!cfg.autoEnabled||!cfg[kind])throw bad(403,'自动归档授权已关闭');
   const ev=db.prepare('SELECT * FROM ui_source_events WHERE id=? AND deleted=0').get(eventId);
   if(!ev||ev.source_ref!==sourceRef)throw bad(409,'图片来源已撤回');
   if(db.prepare('SELECT event_id FROM ui_photo_deleted_events WHERE event_id=?').get(eventId))throw bad(410,'已人工删除，不允许自动重放');
   if(completed&&(ev.field!=='image_sha256'||ev.value!==sha))throw bad(422,'原图字节与可信图片事件哈希不匹配');
   if(analysis&&!db.prepare('SELECT id FROM ui_source_events WHERE id=? AND deleted=0').get(analysis.eventId))throw bad(409,'阅读回执已撤回');
   const prev=db.prepare('SELECT a.sha256 FROM ui_photo_items r JOIN ui_photo_assets a ON r.asset_id=a.id WHERE r.event_id=?').get(eventId);
   if(prev&&prev.sha256!==sha)throw bad(409,'同一图片事件不能更换原图');
  }
  fs.mkdirSync(mediaHome,{recursive:true,mode:0o700});
  let asset=db.prepare('SELECT * FROM ui_photo_assets WHERE sha256=?').get(sha);
  let createdAsset=false;
  if(!asset){const id=newId('ASSET');const fileName=id+'.img',file=path.join(mediaHome,fileName);fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});asset={id,sha256:sha,mime,bytes:bytes.length,file_name:fileName,created_at:now()};createdAsset=true;
   try{db.prepare('INSERT INTO ui_photo_assets VALUES(?,?,?,?,?,?)').run(asset.id,asset.sha256,asset.mime,asset.bytes,asset.file_name,asset.created_at);}catch(e){fs.rmSync(file,{force:true});throw e;}}
  let item=db.prepare('SELECT * FROM ui_photo_items WHERE asset_id=? AND source_ref=? AND source_kind=?').get(asset.id,sourceRef,kind);
  if(item){if(album&&item.album&&item.album!==album)throw bad(409,'重复归档相册冲突，请使用人工修订');if(album&&!item.album)db.prepare('UPDATE ui_photo_items SET album=?,revision=revision+1,updated_at=? WHERE id=?').run(album,now(),item.id);if(analysis)saveAnalysis(db,item.id,analysis,newId,now,audit);return json(res,200,{item:publicItem(obj(db,item.id)),duplicate:true,analysisRecorded:!!analysis});}
  const id=newId('PHOTO'),t=now();
  try{db.prepare('INSERT INTO ui_photo_items(id,asset_id,title,note,description_source,source_kind,source_ref,event_id,captured_at,created_at,updated_at,revision,status,album) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,asset.id,title,'','human_or_host_title',kind,sourceRef,eventId,capturedAt,t,t,1,'active',album);}
  catch(e){if(createdAsset){db.prepare('DELETE FROM ui_photo_assets WHERE id=?').run(asset.id);fs.rmSync(path.join(mediaHome,asset.file_name),{force:true});}throw e;}
  if(analysis)saveAnalysis(db,id,analysis,newId,now,audit);
  audit(db,hostCapture?'trusted-host':'human','media.capture',id,'ok',{sourceKind:kind,sourceRef,assetHash:sha,eventId,analysisRecorded:!!analysis});
  return json(res,201,{item:publicItem({...obj(db,id)}),analysisRecorded:!!analysis,deduplicatedAsset:!createdAsset,canonicalMemoryChanged:false,note:'已保存原图与 AI 实际回复描述；不等于 S01/S12 正式写入'});
 }
 if(route==='/host/media/annotate'&&method==='POST'){
  requireHost(req);const x=await read(req);const photoId=TXT(x.photoId,120),eventId=TXT(x.eventId,160),sourceRef=TXT(x.sourceRef,240),note=TXT(x.note,1200);
  if(!note||!photoId||!eventId||!sourceRef)throw bad(422,'AI 照片注释缺少完整来源');
  const record=obj(db,photoId),ev=db.prepare('SELECT id,source_ref FROM ui_source_events WHERE id=? AND deleted=0').get(eventId);
  if(!record||!ev||ev.source_ref!==sourceRef)throw bad(422,'没有可信图片或来源事件');
  const id=newId('PHOTO-NOTE'),at=now();db.prepare('INSERT INTO ui_photo_annotations VALUES(?,?,?,?,?,?,?)').run(id,photoId,'ai_reported',note,eventId,sourceRef,at);
  audit(db,'trusted-host','media.annotate',photoId,'ok',{id,eventId});return json(res,201,{id,photoId,descriptionSource:'ai_reported',isVerifiedFact:false,createdAt:at});
 }
 const noteMatch=/^\/media\/items\/([A-Za-z0-9_-]{3,120})\/annotations$/.exec(route);
 if(noteMatch&&method==='POST'){
  const photo=obj(db,noteMatch[1]);if(!photo||photo.status!=='active'||(photo.event_id&&!db.prepare('SELECT id FROM ui_source_events WHERE id=? AND deleted=0').get(photo.event_id)))throw bad(404,'照片不存在');const x=await read(req);if(!TXT(x.note,1200))throw bad(422,'请填写记录');const id=newId('PHOTO-NOTE'),at=now();
  db.prepare('INSERT INTO ui_photo_annotations VALUES(?,?,?,?,?,?,?)').run(id,photo.id,'human_note',TXT(x.note,1200),null,`manual:${photo.id}`,at);
  audit(db,'human','media.annotate',photo.id,'ok',{id});return json(res,201,{id,descriptionSource:'human_note',createdAt:at});
 }
 const m=/^\/media\/items\/([A-Za-z0-9_-]{3,120})(\/blob)?$/.exec(route);
 if(m){const r=obj(db,m[1]);if(!r||r.status!=='active')throw bad(404,'照片不存在');
   if(r.event_id&&!db.prepare('SELECT id FROM ui_source_events WHERE id=? AND deleted=0').get(r.event_id))throw bad(410,'来源已撤回，照片暂停访问');
   if(m[2]&&method==='GET'){
    const stored=db.prepare('SELECT file_name FROM ui_photo_assets WHERE id=?').get(r.asset_id);const full=path.join(mediaHome,stored.file_name);if(!fs.existsSync(full))throw bad(410,'照片原件不可用');
    res.writeHead(200,{'content-type':r.mime,'content-length':r.bytes,...jsonHeaders,'content-security-policy':"default-src 'none'; sandbox"});return fs.createReadStream(full).pipe(res);
   }
   if(method==='GET')return json(res,200,{item:publicItem(r),annotations:db.prepare('SELECT * FROM ui_photo_annotations WHERE photo_id=? ORDER BY created_at DESC').all(r.id)});
   if(method==='POST'&&route.endsWith('/annotations')){throw bad(404,'仅支持通过专门注释路由写入');}
   if(method==='PATCH'){const x=await read(req);const current=obj(db,r.id);if(!current||current.revision!==r.revision||x.expectedRevision!==r.revision)throw bad(409,'照片记录版本冲突');
    if(x.favorite!==undefined&&typeof x.favorite!=='boolean')throw bad(422,'收藏状态必须为布尔值');
    if(x.album!==undefined&&(typeof x.album!=='string'||x.album.length>60||process.env.EVERLIGHT_STRICT_WRITE_D9==='1'&&(!x.album.trim()||x.album.trim()==='未分类')))throw bad(422,'相册名称不能超过60字');
    if(x.tags!==undefined&&(!Array.isArray(x.tags)||x.tags.length>8||x.tags.some(v=>typeof v!=='string'||v.length>24)))throw bad(422,'标签限8个，每个不超过24字');
    const title=x.title===undefined?r.title:(TXT(x.title,120)||r.title),note=x.note===undefined?r.note:TXT(x.note,1200),
      album=x.album===undefined?r.album:TXT(x.album,60),favorite=x.favorite===undefined?r.favorite:+x.favorite,
      tags=x.tags===undefined?r.tags:JSON.stringify([...new Set(x.tags.map(v=>v.trim()).filter(Boolean))]);
    const t=now();db.prepare('UPDATE ui_photo_items SET title=?,note=?,album=?,favorite=?,tags=?,description_source=?,revision=?,updated_at=? WHERE id=?').run(title,note,album,favorite,tags,'human_note',r.revision+1,t,r.id);
    audit(db,'human','media.edit',r.id,'ok',{revision:r.revision+1,fields:Object.keys(x).filter(k=>k!=='expectedRevision')});return json(res,200,{item:publicItem(obj(db,r.id))});}
   if(method==='DELETE'){const x=await read(req);const current=obj(db,r.id);if(!current||x.expectedRevision!==current.revision||x.confirm!==true)throw bad(409,'版本不一致或未确认删除');
    if(r.event_id)db.prepare('INSERT OR IGNORE INTO ui_photo_deleted_events VALUES(?,?)').run(r.event_id,now());
    db.prepare('DELETE FROM ui_photo_annotations WHERE photo_id=?').run(r.id);db.prepare('DELETE FROM ui_photo_items WHERE id=?').run(r.id);const count=db.prepare('SELECT COUNT(*) n FROM ui_photo_items WHERE asset_id=?').get(r.asset_id).n;
    if(!count){db.prepare('DELETE FROM ui_photo_assets WHERE id=?').run(r.asset_id);fs.rmSync(path.join(mediaHome,assetNameSafe(r.asset_id)),{force:true});}
    audit(db,'human','media.delete',r.id,'ok',{assetRemoved:!count});return json(res,200,{deleted:true,id:r.id});}
 }
 throw bad(404,'没有这个照片馆接口');
}
function saveAnalysis(db,photoId,{eventId,sourceRef,description},newId,now,audit){
 const existing=db.prepare("SELECT id FROM ui_photo_annotations WHERE photo_id=? AND event_id=? AND author_kind='ai_reported'").get(photoId,eventId);
 if(existing)return existing.id;
 const id=newId('PHOTO-NOTE');db.prepare('INSERT INTO ui_photo_annotations VALUES(?,?,?,?,?,?,?)').run(id,photoId,'ai_reported',description,eventId,sourceRef,now());
 audit(db,'trusted-host','media.ai_read_completed',photoId,'ok',{responseEventId:eventId,noteId:id,verifiedFact:false});return id;
}
function decodeURIComponentSafe(s){try{return decodeURIComponent(String(s||''));}catch{return ''}}
function assetNameSafe(id){return id+'.img'}

export function purgeMediaByEvent(db,eventId,root){
 const mediaHome=path.join(path.dirname(process.env.EVERLIGHT_UI_DB||path.join(root,'private-data','everlight-ui.sqlite')),'everlight-media');
 // If the AI response was revoked, remove only its AI description, leaving the independent image event intact.
 db.prepare("DELETE FROM ui_photo_annotations WHERE event_id=? AND author_kind='ai_reported'").run(eventId);
 const items=db.prepare('SELECT id,asset_id FROM ui_photo_items WHERE event_id=?').all(eventId);
 for(const item of items){db.prepare('DELETE FROM ui_photo_annotations WHERE photo_id=?').run(item.id);db.prepare('DELETE FROM ui_photo_items WHERE id=?').run(item.id);
  const n=db.prepare('SELECT COUNT(*) n FROM ui_photo_items WHERE asset_id=?').get(item.asset_id).n;
  if(n===0){const asset=db.prepare('SELECT file_name FROM ui_photo_assets WHERE id=?').get(item.asset_id);db.prepare('DELETE FROM ui_photo_assets WHERE id=?').run(item.asset_id);if(asset)fs.rmSync(path.join(mediaHome,asset.file_name),{force:true});}
 }
 return items.length;
}
