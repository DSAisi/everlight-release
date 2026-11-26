#!/usr/bin/env node
import {importProgressView} from './import-progress-beta14d.mjs';
import {DREAM_INVITATION} from '../core/dream-host-beta09.mjs';
import {inviteProfile} from '../contracts/invite-profile-beta08.mjs';
import {resolveUnified,forwardConnect} from './unified-api-w3h5.mjs';
import {settingsView,settingsChange} from './settings-w3h6.mjs';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
/* Everlight mobile gateway: original 2026-11-21 Lampkin UI + auditable add-ons.
   This is a local/isolated gateway by default. NO production writes or host impersonation. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openDatabase,now,newId,bad,trimmed,parse,transaction,audit,getTask,allTasks,putTask,getDream,allDreams,putDream,getProposal,putProposal,getTaskActivity,recordTaskEvent,getSettings} from './storage.mjs';
import {processDream} from './dream-engine.mjs';
import {submitApprovedCandidate} from './bridge.mjs';
import {installVault,handleVault,purgeNightByEvent} from './vault-api.mjs';
import {installMedia,handleMedia,purgeMediaByEvent} from './media-api.mjs';
import {gatewayHealth} from './gateway-health.mjs';
import {createUpdateChecker} from './update-check.mjs';
import {createUpdateJobs} from './update-jobs.mjs';
import {verifyStagedRelease} from '../scripts/update-release.mjs';
import {verifyRollback,verifySnapshot} from '../scripts/update-snapshot.mjs';
const updateChecker=createUpdateChecker({repo:process.env.EVERLIGHT_UPDATE_REPO||'',channel:process.env.EVERLIGHT_UPDATE_CHANNEL||'beta',auto:process.env.EVERLIGHT_UPDATE_AUTO==='1' && (process.env.EVERLIGHT_UI_TOKEN||'').length>=16});
updateChecker.start();
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const HOST='127.0.0.1',PORT=Number(process.env.PORT||8787);
const UI_TOKEN=process.env.EVERLIGHT_UI_TOKEN||'', HOST_TOKEN=process.env.EVERLIGHT_HOST_TOKEN||'';
const CORE_URL=process.env.EVERLIGHT_CORE_URL||'';
const CORE_TOKEN=process.env.EVERLIGHT_CORE_TOKEN||'';
const DB_FILE=process.env.EVERLIGHT_UI_DB||path.join(ROOT,'private-data','everlight-ui.sqlite');
const UI_SCOPE=process.env.EVERLIGHT_UI_SCOPE||'personal';
const db=openDatabase(DB_FILE);
// Legacy local stores are single-scope; never expose them under another identity.
const legacyLocalEnabled=UI_SCOPE==='personal';
const coreWorkflowMode=process.env.EVERLIGHT_CORE_ADAPTER==='v8';
installVault(db);
installMedia(db);
const updateJobs=createUpdateJobs(db,{checker:updateChecker,enabled:legacyLocalEnabled&&coreWorkflowMode&&process.env.EVERLIGHT_REVIEW_WRITES==='1'&&UI_TOKEN.length>=16&&HOST_TOKEN.length>=20&&updateChecker.view().configured&&fs.existsSync(path.join(path.dirname(DB_FILE),'release-public.pem')),notify:x=>v8TrustedWrite('/api/v8/shared/actions',{scope:UI_SCOPE,...x}),verifyBackup:j=>verifySnapshot(path.resolve(ROOT,'..'),j.id),verifyRelease:j=>verifyStagedRelease(path.resolve(ROOT,'..'),j),verifyRollback:j=>verifyRollback(path.resolve(ROOT,'..'),j.id)});
const updateRetry=setInterval(()=>{const j=updateJobs.active();if(j?.state==='authorized')void updateJobs.dispatch(j);},30000);updateRetry.unref();
const secureCompare=(a,b)=>{const x=Buffer.from(String(a??'')),y=Buffer.from(String(b??''));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const cookieValue=()=>crypto.createHmac('sha256',UI_TOKEN||'disabled').update('everlight-lampkin-ui-v4').digest('hex');
const authed=req=>UI_TOKEN.length>=16&&(secureCompare((req.headers.authorization||'').replace(/^Bearer\s+/i,''),UI_TOKEN)||secureCompare((req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('everlight_ui='))?.slice(13),cookieValue()));
const hostAuthed=req=>HOST_TOKEN.length>=20 && secureCompare((req.headers.authorization||'').replace(/^Bearer\s+/i,''),HOST_TOKEN);
const json=(res,status,x,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers});res.end(JSON.stringify(x));};
const fail=(res,e)=>json(res,e.status||500,{error:e.status?e.message:'服务器执行失败',code:e.status||500});
const sendCsv=(res,content)=>{res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="everlight-tasks.csv"','cache-control':'no-store'});res.end('\ufeff'+content)};
async function read(req){const max=String(req.url||'').includes('/vault/entries')?5*1024*1024:48*1024;if(!String(req.headers['content-type']||'').startsWith('application/json'))throw bad(415,'请求必须使用 JSON');let chunks=[],n=0;for await (const c of req){n+=c.length;if(n>max)throw bad(413,'请求超过上限');chunks.push(c)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}catch{throw bad(400,'JSON 格式错误')}}
const isMutating=req=>['POST','PUT','PATCH','DELETE'].includes(req.method);
function requireWrite(req){if(UI_TOKEN.length<16)throw bad(403,'未配置 UI 认证令牌，只能只读浏览');if(!authed(req))throw bad(401,'需要登录长明');}
function requireSameOrigin(req){const o=req.headers.origin;if(!o)return;try{const origin=new URL(o);if(origin.host!==req.headers.host || !['http:','https:'].includes(origin.protocol))throw bad(403,'来源不匹配')}catch(e){throw bad(403,'来源不匹配')}}
function requireHost(req){if(!hostAuthed(req))throw bad(403,'只有已授权宿主可以提交可信事件和回执')}
const themeNames=new Set(['berry','moon','peach','cream','night']);
const transitions={proposed:['todo','cancelled'],todo:['in_progress','blocked','cancelled'],in_progress:['blocked','awaiting_delivery','cancelled'],blocked:['in_progress','awaiting_delivery','cancelled'],awaiting_delivery:['verified_done','in_progress','cancelled'],verified_done:[],cancelled:[]};
const statusText={proposed:'待确认',todo:'待做',in_progress:'进行中',blocked:'卡点',awaiting_delivery:'待交付核验',verified_done:'已核验完成',cancelled:'取消'};
function withActivity(t){return {...t,activity:getTaskActivity(db,t.id)}}
function requireTask(id){const t=getTask(db,id);if(!t)throw bad(404,'任务不存在');return t}
function checkRevision(t,v){if(!Number.isSafeInteger(v)||t.revision!==v)throw bad(409,'记录版本已变化，请刷新后再操作')}
function verifiedReceipt(ref,taskId,kind,step=null){const r=db.prepare('SELECT * FROM ui_host_receipts WHERE id=? AND task_id=? AND kind=? AND result=?').get(ref,taskId,kind,'ok');if(!r||kind==='step'&&r.step_index!==step)throw bad(422,'缺少归属本任务的可信宿主回执；不能标记已完成');if(!db.prepare('SELECT id FROM ui_source_events WHERE id=? AND deleted=0 AND source_ref=?').get(r.event_id,r.source_ref))throw bad(409,'交付来源已撤回，不能标记为已核验完成');return r}
function updateTask(t,who,action,note='',ref=''){t.revision++;t.updatedAt=now();putTask(db,t);recordTaskEvent(db,t,who,action,note,ref);return withActivity(t)}
const textRequired=(v,n=300)=>{const s=trimmed(v,n);if(!s)throw bad(422,'缺少必填内容');return s};
function parseDate(x){if(!x)return null;if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x)||!Number.isFinite(Date.parse(x)))throw bad(422,'日期格式应为 YYYY-MM-DD');return `${x}T23:59:00+08:00`}
function serializeTask(t){return withActivity(t)}
function backgroundDream(id){try{processDream(db,id)}catch(e){console.error('dream worker failed',id,e.message);try{const j=getDream(db,id);if(j&&j.status==='queued'){j.status='retry';j.updatedAt=now();j.verification='后台核查失败：未生成任何规范修改；需复查后重试';putDream(db,j);audit(db,'dream-worker','dream.process',id,'failed',{message:String(e.message).slice(0,250)})}}catch(inner){console.error('dream fail marker error',inner.message)}}}

const staticFiles=new Set(['/','/index.html','/app.js','/dialogs.js','/app.css','/style.css','/extra.css','/addon.js','/update-banner.js','/addon.css','/night.js','/night.css','/media.js','/media.css','/photo-atelier.js','/photo-atelier.css','/shared-panel.js','/shared-workspace.js','/relations-panel.js','/relations-panel.css','/mobile-app.css','/mainline.css','/mainline.js','/unified-client.js','/live-view-w3h6f.js','/assets/lampkin-peek.png','/assets/memory-orb.png']);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg'};
const emptyCounts=Object.fromEntries(Array.from({length:12},(_,i)=>['S'+String(i+1).padStart(2,'0'),0]));
function unconnectedCore(req,res,u){const p=u.pathname;
 if(req.method!=='GET')throw bad(503,'记忆核心未连接：禁止假写入');
 const marker={coreConnected:false,mode:'unconnected',note:'未连接原版长明记忆核心；当前没有提供记忆记录'};
 if(p==='/api/status')return json(res,200,{...marker,identity:{name:'长明 · 未连接核心'},counts:emptyCounts,writes_enabled:false,auth_required:UI_TOKEN.length>=16});
 if(p==='/api/reviews'||p==='/api/recent'||p==='/api/list'||p==='/api/turn'||p==='/api/search'||p==='/api/module'||p==='/api/annotations/history')return json(res,200,{...marker,total:0,rows:[],recalled:[],selected:[],dropped:[],actual_request_verified:false,verification_note:'宿主未连接'});
 if(p==='/api/modules')return json(res,200,{...marker,modules:{}});
 return json(res,404,{error:'核心未连接，无法读取真实详情'});
}
async function v8CoreRead(pathname,params,extra={}){
 if(!CORE_URL)throw bad(503,'新版记忆核心尚未连接');
 const target=new URL(pathname,CORE_URL);
 if(!['127.0.0.1','localhost','::1'].includes(target.hostname))throw bad(403,'核心只允许本机回环地址');
 target.search=new URLSearchParams(params).toString();
 let r;try{r=await fetch(target,{headers:{accept:'application/json',authorization:'Bearer '+CORE_TOKEN,...extra},signal:AbortSignal.timeout(8000)})}catch{throw bad(502,'新版记忆核心无法连接')}
 const body=await r.json().catch(()=>({error:'核心响应不是 JSON'}));
 if(!r.ok)throw bad(r.status,body.error||'核心读取失败');return body;
}
// Presentation only: preserve original data and distinguish occurrence from ingest.
function displayString(...values){return values.find(v=>typeof v==='string'&&v.trim().length>0)??null;}
function displayTime(...values){return values.find(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v)))??null;}
function adaptLedgerRecord(r){
 const base={id:r.id,slot:r.slot,scope:r.scope,at:r.at,raw:r,read_only:true};
 if(r.slot!=='S01')return {...base,text:r.slot==='S02'?r.op:r.query,status:r.slot==='S02'?r.result:r.actual_state};
 const b=r.body&&typeof r.body==='object'&&!Array.isArray(r.body)?r.body:{};
 // Literal strings remain literal, even when they resemble JSON. No unverified decoding.
 const text=typeof r.body==='string'?r.body:displayString(b.text,b.content,b.message,b.body);
 const happened=Object.hasOwn(r,'happened_at')?r.happened_at:displayTime(b.happened_at,b.occurred_at,b.observed_at);
 return {...base,text:text??'结构化原始记录（请展开原始字段）',body_text_available:text!==null,
  happened,ingested:r.at,status:'source',actor:displayString(b.legacy_actor,b.speaker,b.who,b.actor),registered_actor:displayString(r.actor),
  attribution:displayString(b.attribution,b.role),channel:displayString(b.channel),conversation_id:displayString(b.conversation_id,b.session_id),
  original_event_id:displayString(b.original_event_id),source_locator:r.source_ref,source_hash:r.hash,ref:r.id,display:r.display??null};
}
function adaptV8Record(r){
 const payload=r.payload&&typeof r.payload==='object'?r.payload:{};
 const text=displayString(payload.statement,payload.summary,payload.expression,payload.claim,payload.problem,payload.event,payload.content,payload.text,payload.description,payload.path,
  r.kind==='relationship'?[payload.subject,payload.relation,payload.object].filter(v=>typeof v==='string'&&v.trim()).join(' · '):null)??'结构化记忆（请查看分类字段）';
 return {id:r.id,slot:r.slot,text,scope:r.scope,revision:r.revision,ref:r.sources,
  happened:displayTime(payload.happened_at,payload.occurred_at,payload.observed_at,payload.temporal?.event_at,payload.at),ingested:r.revision===1?r.created_at:(r.history?.find(h=>h.revision===1)?.created_at??null),at:r.created_at,edited:r.revision>1?r.created_at:null,
  last_recall:r.display?.last_selected??null,recall_count:r.display?.selected_count??null,display:r.display??null,status:r.state,editable:r.slot==='S05'&&r.state==='current'?'revision':'annotation_only',raw:{...r,payload,source_refs:r.sources},history:r.history||[]};
}
// S10 is a system ledger. Normalize only evidence actually present in the row.
function adaptRecallRun(r){
 const selected=Array.isArray(r.selected)?r.selected:[];
 const hits=Array.isArray(r.hits)?r.hits:[];
 const checked=Array.isArray(r.checked)?r.checked:[];
 const picked=new Set(selected.map(x=>typeof x==='object'?x.id:x));
 const dropped=hits.filter(x=>!picked.has(typeof x==='object'?x.id:x));
 return {trace:r.id,trace_id:r.id,at:r.at,asked:r.query||'',checked,
  recalled:hits,selected,dropped,planned_selected:selected.length,selection_audit:r.selection_audit??null,
  actual_state:r.actual_state||'unknown',actual_request_verified:false,
  request_snapshot_verified:r.actual_request_verified===true,
  upstream_submitted:r.upstream_submitted===true,transport_receipts:r.transport_receipts||[],provider_delivery_verified:false,
  verification_note:r.upstream_submitted===true?'受信网关观察到上游 HTTP 响应；非模型内部使用或独立供应商证明':r.actual_request_verified===true
   ?'核心核验过请求快照；没有独立的上游模型提交回执，不能认定已实际注入'
   :'未取得模型请求快照核验证明',ledger:'S10',mode:'v8-adapter'};
}
// Explicitly opt-in, single-tenant trusted gateway; host credential never reaches the browser.
async function v8TrustedWrite(pathname,payload,extra={}){
 if(process.env.EVERLIGHT_REVIEW_WRITES!=='1')throw bad(403,'新版核心审核写入尚未启用');
 const hostToken=process.env.EVERLIGHT_SHARED_HOST_TOKEN||'';
 if(hostToken.length<24||CORE_TOKEN.length<24)throw bad(503,'受信核心凭据未配置');
 if(!CORE_URL)throw bad(503,'新版核心未连接');
 const target=new URL(pathname,CORE_URL);
 if(!['127.0.0.1','localhost','::1'].includes(target.hostname))throw bad(403,'受信写入仅允许回环核心');
 let response;
 try{response=await fetch(target,{method:'POST',headers:{authorization:'Bearer '+CORE_TOKEN,'x-everlight-host-token':hostToken,'content-type':'application/json',...extra},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)})}
 catch{throw bad(502,'受信核心连接失败')}
 const body=await response.json().catch(()=>({error:'核心响应不是 JSON'}));
 if(!response.ok)throw bad(response.status,body.error||'核心拒绝操作');
 return body;
}
async function governanceUI(req,res){
 requireWrite(req);
 if(process.env.EVERLIGHT_CORE_ADAPTER!=='v8')throw bad(404,'新版核心未启用');
 const scope=process.env.EVERLIGHT_UI_SCOPE||'personal';
 const credential=process.env.EVERLIGHT_GOVERNANCE_ADMIN_TOKEN||'';
 const enabled=process.env.EVERLIGHT_GOVERNANCE_UI==='1'&&credential.length>=24&&process.env.EVERLIGHT_REVIEW_WRITES==='1';
 if(req.method==='GET')return json(res,200,{...await v8CoreRead('/api/v8/governance',{scope}),editable:enabled});
 if(req.method!=='POST')throw bad(405,'方法不支持');
 if(!enabled)throw bad(403,'治理设置未授权');
 const x=await read(req);
 if(typeof x.joint!=='boolean'||!Number.isSafeInteger(x.expected_epoch)||x.expected_epoch<0)throw bad(422,'策略参数无效');
 const result=await v8TrustedWrite('/api/v8/governance',{scope,joint:x.joint,expected_epoch:x.expected_epoch},{'x-everlight-governance-token':credential});
 const actual=await v8CoreRead('/api/v8/governance',{scope});
 if(actual.joint!==result.joint||actual.epoch!==result.epoch)throw bad(409,'策略已变化，请刷新');
 return json(res,200,{...actual,editable:true,readback_verified:true});
}
async function humanDecision(x,scope){
 if(!x||typeof x.id!=='string'||!x.id||x.id.length>256)throw bad(422,'候选 ID 无效');
  if(!['approve','reject'].includes(x.decision)||typeof x.reviewer!=='string'||!x.reviewer.trim()||x.reviewer.length>100)throw bad(422,'审核决定或审核人无效');
  // Read-back before mutation prevents cross-scope IDs being used through the UI gateway.
  await v8CoreRead('/api/v8/proposals/detail',{scope,id:x.id});
  const reason=String(x.review_reason||'').trim();
  if(!reason||reason.length>2000||typeof x.digest!=='string')throw bad(422,'需要审核理由与已展示版本');
  const credential=process.env.EVERLIGHT_HUMAN_DECISION_TOKEN||'';
  if(credential.length<24)throw bad(503,'人类决定凭证未配置');
  const result=await v8TrustedWrite('/api/v8/joint/human',{scope,id:x.id,digest:x.digest,decision:x.decision,reason,auto_commit:true},{'x-everlight-decision-token':credential});
  return {...result,notice:result.auto_commit==='committed'?'正式入库并读回核验':result.auto_commit==='failed'?'审核已记录，提交失败或待核验':'审核已记录，等待批准',committed:result.auto_commit==='committed'};
}
async function v8ReviewWrite(req,res,u){
 if(process.env.EVERLIGHT_CORE_ADAPTER!=='v8')throw bad(404,'新版核心未启用');
 requireWrite(req);
 if(process.env.EVERLIGHT_REVIEW_WRITES!=='1')throw bad(403,'受信审核写入未启用');
 const x=await read(req);
 if(u.pathname==='/api/v8/review/batch'){
  if(!Array.isArray(x?.items)||x.items.length<1||x.items.length>25||new Set(x.items.map(i=>i?.id)).size!==x.items.length)throw bad(422,'批量候选须为1至25条且不重复');
  const scope=process.env.EVERLIGHT_UI_SCOPE||'personal';
  const results=[];
  for(const item of x.items){try{results.push({id:item?.id,ok:true,result:await humanDecision(item,scope)});}catch(e){results.push({id:item?.id,ok:false,error:e.message});}}
  return json(res,200,{results,atomic:false});
 }
 if(!x||typeof x.id!=='string'||!x.id||x.id.length>256)throw bad(422,'候选 ID 无效');
 const scope=process.env.EVERLIGHT_UI_SCOPE||'personal';
 if(u.pathname==='/api/v8/review/decide'){
  return json(res,200,await humanDecision(x,scope));
 }
 if(u.pathname==='/api/v8/review/commit'){
  const proposal=await v8CoreRead('/api/v8/proposals/detail',{scope,id:x.id});
  if(proposal.state!=='committed'&&!(await v8CoreRead('/api/v8/joint/status',{scope,id:x.id})).ready)throw bad(409,'候选尚未获批，不能提交');
  const result=await v8TrustedWrite('/api/v8/commit/scoped',{scope,id:x.id});
  if(result.readback_verified!==true||result.readback?.scope!==scope||result.readback?.proposal_id!==x.id)throw bad(502,'核心读回核验不一致');
  return json(res,200,{...result,notice:'正式提交并完成数据库读回；不代表模型实际注入'});
 }
 throw bad(404,'未知审核操作');
}
async function v8DashboardAdapter(req,res,u){
 if(req.method!=='GET')throw bad(405,'新版核心适配仅允许读取');
 if(UI_TOKEN.length<16)throw bad(503,'新版核心适配必须配置 UI 认证令牌');
 if(!authed(req))throw bad(401,'需要先登录长明');
 const scope=process.env.EVERLIGHT_UI_SCOPE||'personal';
 if(u.pathname==='/api/recent'||u.pathname==='/api/search'){
  const params={scope,limit:u.searchParams.get('limit')||'25',offset:u.searchParams.get('offset')||'0'};
  if(u.pathname==='/api/recent')params.recent='1';else {params.q=u.searchParams.get('q')||'';if(u.searchParams.has('slot'))params.slot=u.searchParams.get('slot');}
  const d=await v8CoreRead('/api/v8/ui/records',params);
  const rows=d.rows.map(r=>['S01','S02','S10'].includes(r.slot)?adaptLedgerRecord(r):adaptV8Record(r));
  return json(res,200,{...d,rows,coreConnected:true,mode:'v8-adapter'});
 }
 if(u.pathname==='/api/annotations/history')return json(res,200,await v8CoreRead('/api/v8/ui/annotations',{scope,slot:u.searchParams.get('slot'),id:u.searchParams.get('id'),limit:u.searchParams.get('limit')||'100',offset:u.searchParams.get('offset')||'0'}));
 if(['/api/module','/api/modules'].includes(u.pathname)&&u.searchParams.has('scope')&&u.searchParams.get('scope')!==scope)throw bad(403,'作用域不匹配');
 const vitalsHeaders=()=>process.env.EVERLIGHT_VITALS_UI==='1'&&/^[a-f0-9]{64}$/i.test(process.env.EVERLIGHT_VITALS_TOKEN||'')?{'x-everlight-vitals-token':process.env.EVERLIGHT_VITALS_TOKEN}:{};
 if(u.pathname==='/api/modules'){
  const names=[...(inviteProfile(process.env)?[]:['growth']),'continuity','lessons','domains','candidates','tombstones','env','vitals'];
  const entries=await Promise.all(names.map(async name=>{const d=await v8CoreRead('/api/v8/ui/module',{scope,name,limit:'1'},name==='vitals'?vitalsHeaders():{});return [name,{available:d.available,count:d.total,note:d.note}]}));
  return json(res,200,{modules:Object.fromEntries(entries),mode:'v8-adapter'});
 }
 if(u.pathname==='/api/module')return json(res,200,await v8CoreRead('/api/v8/ui/module',{scope,name:u.searchParams.get('name'),limit:u.searchParams.get('limit')||'20',offset:u.searchParams.get('offset')||'0'},u.searchParams.get('name')==='vitals'?vitalsHeaders():{}));
 if(['/api/v8/ui/tasks','/api/v8/ui/dreams'].includes(u.pathname)){
  if(u.searchParams.has('scope')&&u.searchParams.get('scope')!==scope)throw bad(403,'作用域不匹配');
  return json(res,200,await v8CoreRead(u.pathname,{scope,limit:u.searchParams.get('limit')||'20',offset:u.searchParams.get('offset')||'0',...(u.searchParams.has('category')?{category:u.searchParams.get('category')}:{})}));
 }
 if(u.pathname==='/api/v8/ui/activities'){
  if(u.searchParams.has('scope')&&u.searchParams.get('scope')!==scope)throw bad(403,'作用域不匹配');
  return json(res,200,await v8CoreRead(u.pathname,{scope,limit:u.searchParams.get('limit')||'20',offset:u.searchParams.get('offset')||'0'}));
 }
 if(u.pathname==='/api/v8/ui/person-memories'){
  const person_id=u.searchParams.get('person_id');
  if(!person_id||person_id.length>256)throw bad(422,'人物 ID 无效');
  const limit=Number(u.searchParams.get('limit')||20);
  if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw bad(422,'limit 必须在 1..50');
  const offset=Number(u.searchParams.get('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw bad(422,'offset 无效');
  return json(res,200,await v8CoreRead('/api/v8/ui/person-memories',{scope,person_id,limit:String(limit),offset:String(offset)}));
 }
 if(u.pathname==='/api/reviews'){
  const uiState=u.searchParams.get('state')||'pending';
  const states={pending:'pending',accepted:'approved_pending_commit',rejected:'rejected',committed:'committed',deferred:'__unsupported__'};
  if(!(uiState in states))throw bad(422,'候选状态无效');
  if(uiState==='deferred')return json(res,200,{rows:[],total:0,read_only:true,mode:'v8-adapter',note:'新版核心不支持暂缓状态'});
  const limit=Number(u.searchParams.get('limit')||25),offset=Number(u.searchParams.get('offset')||0);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)throw bad(422,'分页参数无效');
  const d=await v8CoreRead('/api/v8/proposals/page',{scope,state:states[uiState],limit:String(limit),offset:String(offset)});
  return json(res,200,{rows:d.rows.map(r=>({item_id:r.id,slot:r.slot,proposal:r.source_valid===false?'来源已失效，内容隐藏':JSON.stringify(r.payload),state:uiState,created_at:r.created_at,proposed_by:'新版核心候选',reason:r.source_valid===false?null:r.reason})),total:d.total,read_only:true,mode:'v8-adapter'});
 }
 if(u.pathname==='/api/review/detail'){
  const id=u.searchParams.get('id');if(!id||id.length>256)throw bad(422,'候选 ID 无效');
  const r=await v8CoreRead('/api/v8/proposals/detail',{scope,id});
  const state=r.state==='approved_pending_commit'?'accepted':r.state;
  const joint=await v8CoreRead('/api/v8/joint/status',{scope,id});
  const visible=r.source_valid===true&&r.committed_record?.state!=='revoked';
  return json(res,200,{record:{joint:visible?joint:null,item_id:r.id,slot:r.slot,proposal:visible?JSON.stringify(r.payload):'来源已失效，内容隐藏',proposal_text:visible?JSON.stringify(r.payload,null,2):'',source_valid:visible,review_note:visible?r.review_note:null,committed_record:visible?r.committed_record:null,source_refs:visible?r.source_refs:[],state,target_ref:r.target_id,proposed_by:'新版核心候选',reason:visible?r.reason:null,risk:r.source_valid?'来源当前有效':'来源缺失或撤回',created_at:r.created_at,decided_by:r.reviewer,decided_at:r.reviewed_at,decision_note:visible?r.review_note?.reason??null:null},audit:[],read_only:true,mode:'v8-adapter'});
 }
 if(u.pathname==='/api/v8/ui/quality')return json(res,200,await v8CoreRead(u.pathname,{scope,limit:u.searchParams.get('limit')||'50',offset:u.searchParams.get('offset')||'0'}));
 if(u.pathname==='/api/status'){
  const st=await v8CoreRead('/api/v8/status',{scope});
  const subject=process.env.EVERLIGHT_UI_IDENTITY_SUBJECT;
  const identity=await v8CoreRead('/api/v8/ui/identity',{scope,...(subject?{subject}:{})});
  return json(res,200,{...st,identity:{...identity,name:identity.name||'长明 · 未登记明确身份名称'},coreConnected:true,mode:'v8-adapter',writes_enabled:process.env.EVERLIGHT_REVIEW_WRITES==='1'&&(process.env.EVERLIGHT_SHARED_HOST_TOKEN||'').length>=24,auth_required:true,counts:st.counts,ledger_counts:st.ledger_counts,counts_meaning:st.counts_meaning});
 }
 if(u.pathname==='/api/turn'){
  const trace=u.searchParams.get('trace');
  if(trace){
   if(trace.length>256)throw bad(422,'追踪 ID 过长');
   const r=await v8CoreRead('/api/v8/ledgers/detail',{scope,slot:'S10',id:trace});
   return json(res,200,adaptRecallRun(r));
  }
  const limit=Number(u.searchParams.get('limit')||25);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw bad(422,'limit 必须在 1..100');
  const params={scope,slot:'S10',limit:String(limit)};
  if(u.searchParams.has('cursor'))params.cursor=u.searchParams.get('cursor');
  const d=await v8CoreRead('/api/v8/ledgers/page',params);
  return json(res,200,{rows:d.rows.map(adaptRecallRun),next_cursor:d.next_cursor,
   has_more:d.has_more,pagination:'cursor',total:null,mode:'v8-adapter',ledger:'S10'});
 }
 const slot=u.searchParams.get('slot');
 if(!/^S(0[1-9]|1[0-2])$/.test(slot||''))throw bad(422,'库编号错误');
 if(['S01','S02','S10'].includes(slot)){
  if(u.pathname==='/api/detail'){
   const id=u.searchParams.get('id');if(!id)throw bad(422,'缺少账本 ID');
   const r=await v8CoreRead('/api/v8/ledgers/detail',{scope,slot,id});
   const linked=slot==='S01'?await v8CoreRead('/api/v8/ui/source-memories',{scope,id,limit:'25',offset:String(Number(u.searchParams.get('linked_offset')||0))}):null;
   return json(res,200,{...adaptLedgerRecord(r),linked_memories:linked,annotation:(await v8CoreRead('/api/v8/ui/annotations',{scope,slot,id,limit:'1'})).rows[0]||null,mode:'v8-adapter'});
  }
  const limit=Number(u.searchParams.get('limit')||25);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw bad(422,'limit 必须在 1..100');
  const params={scope,slot,limit:String(limit)};
  if(u.searchParams.has('cursor'))params.cursor=u.searchParams.get('cursor');
  const d=await v8CoreRead('/api/v8/ledgers/page',params);
  return json(res,200,{rows:d.rows.map(adaptLedgerRecord),next_cursor:d.next_cursor,has_more:d.has_more,pagination:'cursor',total:null,ledger:true,order:d.order??null,mode:'v8-adapter'});
 }
 if(u.pathname==='/api/detail'){
  const id=u.searchParams.get('id');if(!id)throw bad(422,'缺少记录 ID');
  const params={scope,slot,id,display:'1'};if(u.searchParams.has('revision'))params.revision=u.searchParams.get('revision');
  const r=await v8CoreRead('/api/v8/memories/detail',params);
  return json(res,200,{...adaptV8Record(r),annotation:(await v8CoreRead('/api/v8/ui/annotations',{scope,slot,id,limit:'1'})).rows[0]||null,coreConnected:true,mode:'v8-adapter'});
 }
 const limit=Number(u.searchParams.get('limit')||25);
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw bad(422,'limit 必须在 1..100');
 const params={scope,slot,limit:String(limit)};
 if(u.searchParams.has('cursor'))params.cursor=u.searchParams.get('cursor');
 const d=await v8CoreRead('/api/v8/memories/page',params);
 return json(res,200,{rows:d.rows.map(adaptV8Record),next_cursor:d.next_cursor,has_more:d.has_more,
  pagination:'cursor',coreConnected:true,mode:'v8-adapter',total:null});
}
async function proxyCore(req,res,u){if(UI_TOKEN.length>=16 && !authed(req))throw bad(401,'需要先登录长明');if(!CORE_URL)return unconnectedCore(req,res,u);
 const target=new URL(u.pathname+u.search,CORE_URL);if(process.env.EVERLIGHT_CORE_ADAPTER==='v8'&&req.method==='GET'&&u.pathname.startsWith('/api/v8/')){const scope=process.env.EVERLIGHT_UI_SCOPE||'personal';if(target.searchParams.has('scope')&&target.searchParams.get('scope')!==scope)throw bad(403,'作用域不匹配');target.searchParams.set('scope',scope);}if(!['127.0.0.1','localhost','::1'].includes(target.hostname))throw bad(403,'核心只允许回环地址，不能把隐私请求转发到公网');
 const headers={'accept':'application/json','content-type':req.headers['content-type']||'application/json'};
 if(CORE_TOKEN)headers.authorization='Bearer '+CORE_TOKEN;
 // Never forward unvalidated browser Authorization / Cookie / Origin credentials.
 let payload;if(isMutating(req)){requireWrite(req);if(process.env.EVERLIGHT_CORE_WRITES!=='1')throw bad(403,'原十二库默认只读；若要写入，必须由 D 明确启用隔离写入或生产授权');payload=JSON.stringify(await read(req));headers.origin=target.origin;}
 let response;try{response=await fetch(target,{method:req.method,headers,body:payload,signal:AbortSignal.timeout(5000)})}catch{throw bad(502,'长明原版记忆核心当前无法连接')}
 const raw=await response.text();res.writeHead(response.status,{'content-type':response.headers.get('content-type')||'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(raw);
}

async function api(req,res,u){const route=u.pathname.slice('/ui/api/v1'.length),method=req.method;
 if(!route.startsWith('/host/')&&route!=='/status'&&UI_TOKEN.length>=16&&!authed(req))throw bad(401,'需要先登录长明');
 if(!legacyLocalEnabled&&!['/status','/health','/updates','/updates/check'].includes(route))throw bad(403,'旧版本地面板仅支持 personal；当前作用域禁止访问');
 if(route==='/imports/status'&&method==='GET'){requireWrite(req);return json(res,200,importProgressView(path.dirname(DB_FILE)));}
 if(route==='/updates'&&method==='GET'){requireWrite(req);return json(res,200,updateJobs.view());}
 if(route==='/updates/authorize'&&method==='POST'){requireWrite(req);return json(res,202,await updateJobs.authorize(await read(req)));}
 if(route==='/host/updates'&&method==='GET'){requireHost(req);return json(res,200,{job:updateJobs.active()||null});}
 if(route==='/host/updates'&&method==='POST'){requireHost(req);return json(res,200,updateJobs.advance(await read(req)));}
 if(route==='/updates/check'&&method==='POST'){requireWrite(req);await updateChecker.check();return json(res,200,updateJobs.view());}
 // In v8 mode legacy workflow stores remain readable archives, never a second active writer.
 if(coreWorkflowMode&&method!=='GET'&&(/^\/(tasks|dreams)(\/|$)/.test(route)||['/host/task-sync','/host/dreams/request','/host/receipts'].includes(route))){if(route.startsWith('/host/'))requireHost(req);else requireWrite(req);throw bad(409,'旧任务与梦境已冻结为历史档案；请使用核心工作流');}
 if(route.startsWith('/media/')||route.startsWith('/host/media/'))return handleMedia({req,res,route,method,db,json,read,requireWrite,requireHost,audit,bad,newId,now,root:ROOT});
 if(route.startsWith('/vault/')||route.startsWith('/host/night/'))return handleVault({req,res,route,method,db,json,read,requireWrite,requireHost,transaction,audit,bad,newId,now});
 if(route==='/status'&&method==='GET')return json(res,200,{mode:'local',productionConnected:false,coreConnected:!!CORE_URL,version:'7.0',workflowMode:coreWorkflowMode?'core':'local',legacyArchiveReadable:legacyLocalEnabled,note:'本地真实数据与回执；不表示已接入 DSH 生产'});
 if(route==='/health'&&method==='GET')return json(res,200,{ok:true,db:!!db.prepare('SELECT 1 x').get(),coreConfigured:!!CORE_URL,autoDream:process.env.EVERLIGHT_DREAM_AUTO!=='0'});
 if(route==='/overview'&&method==='GET'){const tasks=allTasks(db),dreams=allDreams(db);return json(res,200,{tasks:{total:tasks.length,active:tasks.filter(x=>['todo','in_progress'].includes(x.status)).length,blocked:tasks.filter(x=>x.status==='blocked').length,verifiedDone:tasks.filter(x=>x.status==='verified_done').length},dreams:{total:dreams.length,reviewing:dreams.filter(x=>x.status==='reviewing').length,verified:dreams.filter(x=>x.status==='verified').length},coreConnected:!!CORE_URL})}
 if(route==='/settings/theme'){
   if(method==='GET'){const r=getSettings(db)||{};return json(res,200,{theme:r.theme||'berry',customColor:r.custom_color||null})}
   if(method==='PUT'){requireWrite(req);const x=await read(req);if(!themeNames.has(x.theme))throw bad(422,'不支持的皮肤');if(x.customColor!=null&&!/^#[0-9a-fA-F]{6}$/.test(x.customColor))throw bad(422,'无效颜色');const t=now();db.prepare('INSERT INTO ui_settings(owner,theme,custom_color,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET theme=excluded.theme,custom_color=excluded.custom_color,updated_at=excluded.updated_at').run('local',x.theme,x.customColor||null,t);audit(db,'human','theme.set',x.theme,'ok');return json(res,200,{theme:x.theme,customColor:x.customColor||null,updatedAt:t});}
 }
 if(route==='/tasks/export'&&method==='GET'){
   requireWrite(req);const quote=v=>'"'+String(v??'').replace(/^([=+@-])/,'\'$1').replaceAll('"','""')+'"';const rows=[['id','title','owner','project','status','acceptance','sourceRef','updatedAt','evidenceRef'],...allTasks(db).map(t=>[t.id,t.title,t.owner,t.project,t.status,t.acceptance,t.sourceRef,t.updatedAt,t.evidenceRef])];return sendCsv(res,rows.map(r=>r.map(quote).join(',')).join('\r\n'));
 }
 if(route==='/tasks'&&method==='GET'){const status=u.searchParams.get('status'),rows=allTasks(db).filter(x=>!status||status==='all'||x.status===status);return json(res,200,{mode:'local',items:rows.map(serializeTask),total:rows.length})}
 if(route==='/tasks'&&method==='POST'){
   requireWrite(req);const b=await read(req),title=textRequired(b.title,120),acceptance=textRequired(b.acceptance,800),sourceRef=textRequired(b.sourceRef,300),t=now();
   const id=newId('T');const item={id,scope:'personal',title,description:trimmed(b.description,1200),project:trimmed(b.project,120)||'未分类',owner:trimmed(b.owner,100)||'待确认',status:'proposed',acceptance,sourceRef,dueAt:parseDate(b.dueDate),createdAt:t,updatedAt:t,revision:1,blocker:'',artifactRef:'',evidenceRef:'',steps:[],sourceVerified:false};
   transaction(db,()=>{putTask(db,item);recordTaskEvent(db,item,'human','登记候选任务','尚未确认是否是已接受承诺',sourceRef)});return json(res,201,{mode:'local',item:serializeTask(item)});
 }
 const taskDetail=/^\/tasks\/([^/]+)$/.exec(route);
 if(taskDetail){const id=decodeURIComponent(taskDetail[1]);if(method==='GET'){return json(res,200,{mode:'local',item:serializeTask(requireTask(id)),receipts:db.prepare('SELECT * FROM ui_host_receipts WHERE task_id=? ORDER BY inserted_at DESC').all(id)})}
   if(method==='PATCH'){requireWrite(req);const b=await read(req),item=transaction(db,()=>{const t=requireTask(id);checkRevision(t,b.expectedRevision);if(!transitions[t.status]?.includes(b.status))throw bad(409,'当前状态不能直接变为目标状态');const note=trimmed(b.note,500);if(b.status==='blocked'&&!note)throw bad(422,'标记卡点时必须写原因');if(b.status==='verified_done'){if(!t.acceptance)throw bad(422,'任务缺少完成标准');if(t.steps?.some(s=>!s.done))throw bad(422,'存在尚未核验的任务步骤，不能标记全部完成');const receipt=verifiedReceipt(textRequired(b.evidenceRef,250),id,'delivery');t.evidenceRef=receipt.id;t.artifactRef=receipt.source_ref;}
   t.status=b.status;if(b.status==='blocked')t.blocker=note;if(b.status==='in_progress')t.blocker='';return updateTask(t,'human','状态：'+(statusText[b.status]||b.status),note,t.evidenceRef)});return json(res,200,{mode:'local',item});}
 }
 const taskInfo=/^\/tasks\/([^/]+)\/info$/.exec(route);
 if(taskInfo&&method==='PATCH'){requireWrite(req);const b=await read(req);const updated=transaction(db,()=>{const t=requireTask(taskInfo[1]);checkRevision(t,b.expectedRevision);if(['verified_done','cancelled'].includes(t.status))throw bad(409,'已关闭任务需要重新审核，不能直接覆盖');if(b.owner!==undefined)t.owner=textRequired(b.owner,100);if(b.description!==undefined)t.description=trimmed(b.description,1200);if(b.project!==undefined)t.project=trimmed(b.project,120);if(b.dueDate!==undefined)t.dueAt=parseDate(b.dueDate);return updateTask(t,'human','更新任务资料',trimmed(b.reason,250)||'字段修订')});return json(res,200,{item:updated});}
 const stepsCreate=/^\/tasks\/([^/]+)\/steps$/.exec(route);
 if(stepsCreate&&method==='POST'){requireWrite(req);const b=await read(req);const updated=transaction(db,()=>{const t=requireTask(stepsCreate[1]);checkRevision(t,b.expectedRevision);if(['verified_done','cancelled'].includes(t.status))throw bad(409,'已关闭任务不能追加步骤');t.steps.push({title:textRequired(b.title,150),done:false,evidenceRef:''});return updateTask(t,'human','新增任务步骤',t.steps.at(-1).title)});return json(res,201,{item:updated});}
 const step=/^\/tasks\/([^/]+)\/steps\/(\d+)$/.exec(route);
 if(step&&method==='PATCH'){requireWrite(req);const b=await read(req);const updated=transaction(db,()=>{const t=requireTask(step[1]);checkRevision(t,b.expectedRevision);const index=Number(step[2]),one=t.steps[index];if(!one)throw bad(404,'步骤不存在');if(one.done)throw bad(409,'步骤已核验');const r=verifiedReceipt(textRequired(b.evidenceRef,250),t.id,'step',index);one.done=true;one.evidenceRef=r.id;return updateTask(t,'human','核验步骤：'+one.title,'可信宿主步骤回执',r.id)});return json(res,200,{item:updated});}

 if(route==='/dreams'&&method==='GET')return json(res,200,{mode:'local',items:allDreams(db)});
 if(route==='/dreams/request'&&method==='POST'){requireWrite(req);const b=await read(req),scope=b.scope==='demo-personal'?'personal':b.scope||'personal';if(scope!=='personal')throw bad(422,'当前实例仅允许个人授权域');if(b.trigger!=='manual_request')throw bad(422,'手动申请必须使用 manual_request');
   const at=now(),j={id:newId('DR'),title:'待整理的记忆',summary:'已登记后台核对请求，尚未生成任何记忆结论。',status:'queued',stageIndex:0,scope,trigger:'manual_request',evidenceScope:null,policyVersion:'dream-evidence-only-v1',verification:'排队中，尚未生成结果',createdAt:at,updatedAt:at,stageHistory:[{name:'入队',index:0,at,result:'queued'}]};
   transaction(db,()=>{putDream(db,j);audit(db,'human','dream.request',j.id,'queued',{scope})});if(process.env.EVERLIGHT_DREAM_AUTO!=='0')setImmediate(()=>backgroundDream(j.id));
   return json(res,202,{mode:'local',queued:true,item:j});
 }
 if(route==='/dreams/reviews'&&method==='GET'){const items=db.prepare('SELECT record FROM ui_reviews ORDER BY rowid DESC').all().map(x=>parse(x.record));return json(res,200,{items})}
 const review=/^\/dreams\/reviews\/([^/]+)\/decision$/.exec(route);
 if(review&&method==='POST'){requireWrite(req);const b=await read(req),result=transaction(db,()=>{const r=db.prepare('SELECT record FROM ui_reviews WHERE id=?').get(review[1]);if(!r)throw bad(404,'审核项不存在');const row=parse(r.record);if(row.status!=='pending')throw bad(409,'已经审核');if(!['approve_proposal','reject'].includes(b.decision))throw bad(422,'非法审核决定');if(b.decision==='approve_proposal'){for(const ref of row.sourceRefs||[]){if(!db.prepare('SELECT id FROM ui_source_events WHERE id=? AND deleted=0').get(ref))throw bad(409,'来源已撤回或不存在，不能批准')}}row.status=b.decision==='approve_proposal'?'approved_pending_canonical':'rejected';row.reviewReason=textRequired(b.reason,600);row.reviewedAt=now();db.prepare('UPDATE ui_reviews SET record=? WHERE id=?').run(JSON.stringify(row),row.id);audit(db,'human','dream.review',row.id,'ok',{decision:b.decision});return row});return json(res,200,{item:result,canonicalMemoryChanged:false});}
 const dreamDetail=/^\/dreams\/([^/]+)$/.exec(route);
 if(dreamDetail&&method==='GET'){const j=getDream(db,decodeURIComponent(dreamDetail[1]));if(!j)throw bad(404,'做梦记录不存在');return json(res,200,{mode:'local',item:j})}
 const runDream=/^\/dreams\/([^/]+)\/process$/.exec(route);
 if(runDream&&method==='POST'){requireWrite(req);const j=processDream(db,runDream[1]);return json(res,200,{mode:'local',item:j});}
 const proposal=/^\/dreams\/([^/]+)\/proposals\/([^/]+)\/decision$/.exec(route);
 if(proposal&&method==='POST'){requireWrite(req);const b=await read(req),result=transaction(db,()=>{
   const p=getProposal(db,proposal[2]);if(!p||p.jobId!==proposal[1])throw bad(404,'候选不存在');if(p.status!=='pending')throw bad(409,'已作出决定');if(!['submit_for_review','reject'].includes(b.decision))throw bad(422,'不支持的动作');if(b.decision==='submit_for_review'&&!p.sourceRefs?.length)throw bad(422,'证据来源不存在');if(b.decision==='submit_for_review'){for(const ref of p.sourceRefs){if(!db.prepare('SELECT id FROM ui_source_events WHERE id=? AND deleted=0').get(ref))throw bad(409,'来源已撤回或缺失，不可提交审核')}}
   p.status=b.decision==='reject'?'rejected':'submitted_for_review';p.decisionAt=now();if(b.decision==='submit_for_review'){const r={id:newId('REVIEW'),proposalId:p.id,jobId:p.jobId,targetSlot:p.targetSlot,status:'pending',sourceRefs:p.sourceRefs,suggestion:p.suggestion,createdAt:now(),reviewReason:null};p.reviewId=r.id;db.prepare('INSERT INTO ui_reviews(id,proposal_id,record) VALUES(?,?,?)').run(r.id,p.id,JSON.stringify(r));}putProposal(db,p);audit(db,'human','dream.proposal',p.id,'ok',{decision:b.decision});return p});return json(res,200,{item:result,decisionRecorded:true,canonicalMemoryChanged:false});}

 // Host-to-panel task projection: trusted S03 status, not a canonical S03 writer.
 if(route==='/host/task-sync'&&method==='POST'){
   requireHost(req);const b=await read(req);const externalId=textRequired(b.externalId,200),eventId=textRequired(b.sourceEventId,160);
   const event=db.prepare('SELECT * FROM ui_source_events WHERE id=? AND deleted=0').get(eventId);
   if(!event)throw bad(422,'任务同步必须引用已存在且未撤回的可信宿主事件');
   const taskId='S03-'+crypto.createHash('sha256').update(externalId).digest('hex').slice(0,20);
   const title=textRequired(b.title,120),acceptance=textRequired(b.acceptance,800),ref=event.source_ref;
   const wanted=b.status||'proposed';if(!['proposed','todo','in_progress','blocked','awaiting_delivery'].includes(wanted))throw bad(422,'宿主同步不能直接声明已核验完成');
   const item=transaction(db,()=>{let t=getTask(db,taskId);
     if(t){if(t.lastSourceEventId===eventId)return withActivity(t);if(['verified_done','cancelled'].includes(t.status))throw bad(409,'已关闭任务不能直接覆盖');
       if(wanted!==t.status&&!transitions[t.status]?.includes(wanted))throw bad(409,'宿主状态跳转不符合规则，需要补中间状态或人工核查');
       t.title=title;t.acceptance=acceptance;t.owner=trimmed(b.owner,100)||t.owner;t.project=trimmed(b.project,120)||t.project;
       if(wanted==='blocked'&&!trimmed(b.blocker,500))throw bad(422,'卡点需要说明');
       t.status=wanted;t.blocker=wanted==='blocked'?trimmed(b.blocker,500):'';t.lastSourceEventId=eventId;
       return updateTask(t,'trusted-host','S03 投影同步','已核对来源事件：'+eventId,eventId);
     }
     if(wanted==='blocked'&&!trimmed(b.blocker,500))throw bad(422,'卡点需要说明');
     const at=now();t={id:taskId,scope:'personal',title,description:trimmed(b.description,1200),project:trimmed(b.project,120)||'未分类',owner:trimmed(b.owner,100)||'待确认',status:wanted,acceptance,sourceRef:ref,dueAt:null,createdAt:at,updatedAt:at,revision:1,blocker:trimmed(b.blocker,500),artifactRef:'',evidenceRef:'',steps:[],sourceVerified:true,lastSourceEventId:eventId,externalId};
     putTask(db,t);recordTaskEvent(db,t,'trusted-host','S03 任务索引同步','仅同步宿主可核对的任务状态，不等于新写规范 S03',eventId);return withActivity(t);
   });return json(res,200,{item,projectionOnly:true,canonicalMemoryChanged:false});
 }
 if(route==='/host/dreams/request'&&method==='POST'){
   requireHost(req);const b=await read(req),eventId=textRequired(b.sourceEventId,160);
   const source=db.prepare('SELECT id,scope FROM ui_source_events WHERE id=? AND deleted=0').get(eventId);
   if(!source)throw bad(422,'梦的宿主触发事件不存在或已撤回');
   const trigger=b.trigger;
   if(!['new_evidence','late_receipt','dependency_change','idle_maintenance'].includes(trigger))throw bad(422,'梦的触发原因不受支持');
   const at=now(),j={id:newId('DR'),title:'宿主事件触发的记忆整理',summary:'可信宿主已提交整理请求，尚未生成任何记忆结论。',status:'queued',stageIndex:0,scope:source.scope,trigger,evidenceScope:eventId,policyVersion:'dream-evidence-only-v1',verification:'排队中',createdAt:at,updatedAt:at,stageHistory:[{name:'入队',index:0,at,result:'queued'}]};
   transaction(db,()=>{putDream(db,j);audit(db,'trusted-host','dream.request',j.id,'queued',{trigger,eventId})});
   if(process.env.EVERLIGHT_DREAM_AUTO!=='0')setImmediate(()=>backgroundDream(j.id));
   return json(res,202,{item:j,queued:true,productionConnected:false});
 }
 // Host bridge: only a separately provisioned host service token can submit evidence/receipts.
 if(route==='/evidence'&&method==='GET'){requireWrite(req);const rows=db.prepare('SELECT id,scope,actor,kind,subject,field,source_ref,effective_at,deleted,inserted_at FROM ui_source_events ORDER BY inserted_at DESC LIMIT 100').all();return json(res,200,{rows})}
 const revoked=/^\/host\/evidence\/([^/]+)\/revoke$/.exec(route);
 if(revoked&&method==='POST'){requireHost(req);const b=await read(req);const reason=textRequired(b.reason,300);const n=db.prepare('UPDATE ui_source_events SET deleted=1, revision=revision+1 WHERE id=? AND deleted=0').run(revoked[1]).changes;if(n===0)throw bad(404,'证据不存在或已撤回');const removedMedia=purgeMediaByEvent(db,revoked[1],ROOT);const removedNight=purgeNightByEvent(db,revoked[1]);if(removedMedia) audit(db,'host','media.purge',revoked[1],'ok',{removedMedia});audit(db,'host','evidence.revoke',revoked[1],'ok',{reason,removedMedia,removedNight});return json(res,200,{revoked:true,id:revoked[1],removedMedia,removedNight,dependentProposals:'must_revalidate'})}
 // Host bridge: only a separately provisioned host service token can submit evidence/receipts.
 if(route==='/host/evidence'&&method==='POST'){requireHost(req);const x=await read(req);const id=textRequired(x.id,160),ref=textRequired(x.sourceRef,300),actor=textRequired(x.actor,150),kind=textRequired(x.kind,80),scope=x.scope||'personal';if(scope!=='personal')throw bad(422,'作用域不允许');
   if(x.effectiveAt&&!Number.isFinite(Date.parse(x.effectiveAt)))throw bad(422,'无效时间');const row={id,scope,actor,kind,subject:trimmed(x.subject,160)||null,field:trimmed(x.field,100)||null,value:trimmed(x.value,500)||null,sourceRef:ref,effectiveAt:x.effectiveAt||null,deleted:x.deleted===true?1:0};
   try{db.prepare('INSERT INTO ui_source_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.scope,row.actor,row.kind,row.subject,row.field,row.value,row.sourceRef,row.effectiveAt,1,row.deleted,now());}catch(e){if(String(e.message).includes('UNIQUE'))throw bad(409,'事件已经录入，不允许覆盖原始来源');throw e}
   audit(db,'host','evidence.ingest',row.id,'ok',{sourceRef:ref});return json(res,201,{recorded:true,id,trust:'host_authenticated',canonicalMemoryChanged:false});}
 if(route==='/host/receipts'&&method==='POST'){requireHost(req);const x=await read(req);const id=textRequired(x.id,160),taskId=textRequired(x.taskId,160),kind=x.kind;if(!['delivery','step'].includes(kind)||x.result!=='ok')throw bad(422,'需要有效的任务交付/步骤成功回执');const idx=kind==='step'?x.stepIndex:null;if(kind==='step'&&(!Number.isInteger(idx)||idx<0))throw bad(422,'步骤编号无效');const eventId=textRequired(x.eventId,160),sourceRef=textRequired(x.sourceRef,300),at=textRequired(x.occurredAt,100);if(!Number.isFinite(Date.parse(at)))throw bad(422,'回执时间无效');const t=requireTask(taskId);if(kind==='step'&&!t.steps[idx])throw bad(422,'该任务没有对应步骤');const source=db.prepare('SELECT id FROM ui_source_events WHERE id=? AND source_ref=? AND deleted=0').get(eventId,sourceRef);if(!source)throw bad(422,'先写入可信执行事件，交付回执必须能追溯同一来源引用');
   try{db.prepare('INSERT INTO ui_host_receipts VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,taskId,kind,idx,eventId,sourceRef,trimmed(x.traceId,200)||null,'ok',at,now());}catch(e){if(String(e.message).includes('UNIQUE'))throw bad(409,'回执已存在，不可覆盖');throw e}audit(db,'host','receipt.ingest',id,'ok',{taskId});return json(res,201,{recorded:true,id,trust:'host_authenticated',note:'宿主认证提交的真实回执声明；不是模型请求读回'});}
 const submit=/^\/bridge\/cognitive\/([^/]+)\/submit$/.exec(route);
 if(submit&&method==='POST'){requireHost(req);const mapping=await read(req);const result=await submitApprovedCandidate(db,submit[1],mapping);return json(res,202,result)}
 if(route==='/audit'&&method==='GET'){requireWrite(req);return json(res,200,{rows:db.prepare('SELECT * FROM ui_audit ORDER BY at DESC LIMIT 100').all().map(r=>({...r,details:parse(r.details)}))})}
 throw bad(404,'没有这个 API 接口');
}

async function main(req,res){try{
 let u=new URL(req.url,`http://${HOST}:${PORT}`);const op=resolveUnified(u,req.method);
 if(op){u.searchParams.delete('route');if(op.kind==='connect')return await forwardConnect(req,res,u,op.route,CORE_URL,json);if(op.kind==='host-update')requireHost(req);else if(op.route!=='/api/session')requireWrite(req);if(isMutating(req))requireSameOrigin(req);u.pathname=op.route;req.url=u.pathname+u.search;}
 const p=u.pathname;
 if(inviteProfile(process.env)&&(p==='/api/v8/ui/runtime-mainline'||(p==='/api/v8/ui/mainline'&&['affect','motivation'].includes(u.searchParams.get('name')))||(['/api/module','/api/v8/ui/module'].includes(p)&&u.searchParams.get('name')==='growth')))throw bad(404,'邀请测试版未开放');
 if(req.method==='GET'&&staticFiles.has(p)){const rel=p==='/'?'index.html':p.slice(1);const f=path.join(ROOT,rel);if(!fs.existsSync(f))throw bad(404,'资源不存在');res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});return fs.createReadStream(f).pipe(res)}
 if(p==='/api/session'&&req.method==='POST'){requireSameOrigin(req);const x=await read(req);if(UI_TOKEN.length<16)throw bad(403,'请先配置长度至少16字的 UI 令牌');if(!secureCompare(x.token,UI_TOKEN))throw bad(401,'令牌错误');return json(res,200,{ok:true},{'set-cookie':`everlight_ui=${cookieValue()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`})}
 if(isMutating(req))requireSameOrigin(req);
 if(p==='/api/v8/ui/export'&&req.method==='GET'){
  requireWrite(req);requireSameOrigin(req);if(req.headers['sec-fetch-site']==='cross-site')throw bad(403,'跨站导出禁止');
  if(!coreWorkflowMode||!CORE_URL)throw bad(503,'规范核心未接通');
  if(u.searchParams.has('scope')&&u.searchParams.get('scope')!==UI_SCOPE)throw bad(403,'作用域不匹配');
  const target=new URL('/api/v8/export/portable',CORE_URL);if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname))throw bad(403,'核心必须为回环地址');
  target.search=new URLSearchParams({scope:UI_SCOPE,mode:u.searchParams.get('mode')||'memory',format:u.searchParams.get('format')||'jsonl',slot:u.searchParams.get('slot')||'',history:u.searchParams.get('history')||'0'}).toString();
  const credential=process.env.EVERLIGHT_SHARED_HOST_TOKEN||'';if(credential.length<24)throw bad(403,'未配置授权宿主凭据');
  let r;try{r=await fetch(target,{headers:{authorization:'Bearer '+CORE_TOKEN,'x-everlight-host-token':credential},redirect:'error',signal:AbortSignal.timeout(150000)});}catch{throw bad(502,'核心导出连接失败');}
  if(!r.ok)throw bad(r.status,(await r.json().catch(()=>({}))).error||'导出失败');
  if(res.destroyed){await r.body?.cancel();return;}
  res.writeHead(200,{'content-type':r.headers.get('content-type'),'content-disposition':r.headers.get('content-disposition'),'content-length':r.headers.get('content-length'),'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});return await pipeline(Readable.fromWeb(r.body),res).catch(()=>res.destroy());
 }
 if(p==='/api/v8/ui/gateway-health'&&req.method==='GET'){requireWrite(req);return json(res,200,await gatewayHealth());}
 if(process.env.EVERLIGHT_CORE_ADAPTER==='v8'&&p==='/api/v8/shared/actions'&&req.method==='POST'){
 requireWrite(req);const x=await read(req),scope=process.env.EVERLIGHT_UI_SCOPE||'personal';
 if(x.scope!==undefined&&x.scope!==scope)throw bad(403,'作用域不匹配');
 if(!['remind_ai','task_nudge'].includes(x.kind)||x.actor!=='human')throw bad(422,'不允许的面板提醒类型');
 return json(res,200,await v8TrustedWrite(p,{scope,kind:x.kind,actor:'human',body:x.body,target:x.target,idempotency_key:x.idempotency_key}));}
 if(process.env.EVERLIGHT_CORE_ADAPTER==='v8'&&p==='/api/v8/ui/observations'&&req.method==='POST'){
  requireWrite(req);const x=await read(req),scope=process.env.EVERLIGHT_UI_SCOPE||'personal';
  if(x.scope!==undefined&&x.scope!==scope)throw bad(403,'作用域不匹配');
  if(!['domains','env','vitals'].includes(x.name))throw bad(422,'模块无效');
  const extra=x.name==='vitals'&&process.env.EVERLIGHT_VITALS_UI==='1'&&/^[a-f0-9]{64}$/i.test(process.env.EVERLIGHT_VITALS_TOKEN||'')?{'x-everlight-vitals-token':process.env.EVERLIGHT_VITALS_TOKEN}:{};
  if(x.name==='vitals'&&!extra['x-everlight-vitals-token'])throw bad(403,'身体读数未授权');
  return json(res,200,await v8TrustedWrite(p,{scope,name:x.name,action:x.action,id:x.id,idempotency_key:x.idempotency_key,title:x.title,detail:x.detail,observed_at:x.observed_at,category:x.category,category_label:x.category_label,source_id:x.source_id,source_ref:x.source_ref,consent:x.consent},extra));
 }
 if(process.env.EVERLIGHT_CORE_ADAPTER==='v8'&&p==='/api/v8/ui/workflow'&&req.method==='POST'){
  requireWrite(req);const x=await read(req),scope=process.env.EVERLIGHT_UI_SCOPE||'personal';
  if(x.scope!==undefined&&x.scope!==scope)throw bad(403,'作用域不匹配');
  const key=x.idempotency_key;if(typeof key!=='string'||!key.trim()||key.length>128)throw bad(422,'请求编号无效');
  const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max;
  if(x.action==='dream-invite')return json(res,200,await v8TrustedWrite('/api/v8/dream/invite',{scope,idempotency_key:key}));
  if(x.action==='dream-start')return json(res,200,await v8TrustedWrite('/api/v8/dream/start',{scope,idempotency_key:key,...(x.category?{metadata:{category:x.category,purpose:x.purpose,category_label:x.category_label}}:{})}));
  if(x.action==='dream-advance'){
   if(!text(x.id,256)||!Number.isInteger(x.expected_stage)||x.expected_stage<0||x.expected_stage>7)throw bad(422,'梦境阶段无效');
   return json(res,200,await v8TrustedWrite('/api/v8/dream/advance',{scope,id:x.id,expected_stage:x.expected_stage}));
  }
  if(x.action==='dream-resume'){
   if(!text(x.id,256)||!text(x.reason,2000))throw bad(422,'需要审核理由');
   return json(res,200,await v8TrustedWrite('/api/v8/dream/resume',{scope,id:x.id,reason:x.reason,require_candidate_decisions:true}));
  }
  if(x.action==='dream-candidate-decision')return json(res,200,await v8TrustedWrite('/api/v8/dream/candidate-decision',{scope,id:x.id,index:x.index,digest:x.digest,decision:x.decision,reason:x.reason,source_id:x.source_id}));
  if(x.action==='task-evidence')return json(res,200,await v8TrustedWrite('/api/v8/tasks/evidence',{scope,memory_id:x.id,expected_revision:x.expected_revision,kind:x.kind,step_id:x.step_id,source_id:x.source_id,actor:'human',detail:x.detail,idempotency_key:'ui-task-evidence:'+key}));
  if(x.action==='task-create'){
   if(!text(x.title,120)||!text(x.owner,120)||!text(x.acceptance,2000)||!text(x.source_id,256))throw bad(422,'需要任务、负责人、验收标准及真实来源 ID');
   return json(res,200,await v8TrustedWrite('/api/v8/proposal',{scope,slot:'S03',kind:'goal',payload:{summary:x.title,owner:x.owner,intent:'人工登记任务候选',state:'todo',acceptance:x.acceptance,...(x.category?{template_version:'everlight.write.d7',...((process.env.EVERLIGHT_STRICT_WRITE_D9==='1'||process.env.EVERLIGHT_W1_CANONICAL_STRICT==='1')?{contract_version:'everlight.write.d9'}:{}),category:x.category,category_label:x.category_label||undefined,priority:x.priority,due_at:x.due_at||null,report_interval_minutes:Number(x.report_interval_minutes)}:{})},source_refs:[x.source_id],reason:'人类面板登记，仍需规范审核',idempotency_key:'ui-task:'+scope+':'+key}));
  }
  if(x.action==='task-event'){
   const actions={in_progress:x.reopen===true?'reopen':'progress',blocked:'block',todo:'reopen',done:'complete',verified:'verify'};
   if(!text(x.id,256)||!text(x.source_id,256)||!text(x.detail,2000)||!Number.isInteger(x.expected_revision)||x.expected_revision<1||!Object.hasOwn(actions,x.state))throw bad(422,'需要有效的任务状态、真实来源和说明');
   if(x.state==='verified'&&!text(x.receipt_ref,256))throw bad(422,'需要本任务交付证据 ID');
   const result=await v8TrustedWrite('/api/v8/tasks/event',{scope,memory_id:x.id,expected_revision:x.expected_revision,action:actions[x.state],state:x.state,actor:'human',source_id:x.source_id,receipt_ref:x.state==='verified'?x.receipt_ref:null,detail:x.detail,idempotency_key:'ui-task-event:'+scope+':'+key});
   return json(res,200,result);
  }
  if(x.action==='task-reporting'){
   if(!text(x.id,256)||typeof x.enabled!=='boolean'||!Number.isInteger(x.interval_minutes))throw bad(422,'任务提醒参数无效');
   return json(res,200,await v8TrustedWrite('/api/v8/tasks/reporting',{scope,memory_id:x.id,enabled:x.enabled,interval_minutes:x.interval_minutes}));
  }
  throw bad(422,'不支持的操作');
 }
 if(p==='/api/v8/ui/governance')return await governanceUI(req,res);
 if(p==='/api/v8/governance'&&req.method!=='GET')throw bad(403,'请使用授权治理入口');
 if(p.startsWith('/ui/api/v1/'))return await api(req,res,u);
 if(process.env.EVERLIGHT_CORE_ADAPTER==='v8'&&req.method==='POST'&&['/api/annotation','/api/fact/revise'].includes(p)){
  requireWrite(req);const x=await read(req);const scope=process.env.EVERLIGHT_UI_SCOPE||'personal';
  if(p==='/api/annotation')return json(res,200,await v8TrustedWrite('/api/v8/ui/annotations',{scope,slot:x.slot,id:x.id,expected_revision:x.expected_revision,expected_target_revision:x.expected_target_revision??null,note:x.note,review_status:x.review_status}));
  return json(res,200,await v8TrustedWrite('/api/v8/ui/fact-revision',{scope,id:x.memory_id,expected_revision:x.expected_revision,statement:x.statement,reason:x.reason,source_id:x.source_id,idempotency_key:x.idempotency_key}));
 }
 if(process.env.EVERLIGHT_CORE_ADAPTER==='v8'&&req.method==='POST'&&['/api/v8/review/decide','/api/v8/review/commit','/api/v8/review/batch'].includes(p))return await v8ReviewWrite(req,res,u);
 if(p==='/api/v8/ui/dream-invitations'){requireWrite(req);if(req.method!=='GET')throw bad(405,'仅允许读取');if(!coreWorkflowMode)throw bad(503,'需要核心');return json(res,200,await v8CoreRead('/api/v8/dream/invitations',{scope:UI_SCOPE}));}
 if(p==='/api/v8/ui/live-revision'){requireWrite(req);if(req.method!=='GET')throw bad(405,'仅允许读取');if(!coreWorkflowMode)throw bad(503,'需要 RC6 核心');if(u.searchParams.has('scope')&&u.searchParams.get('scope')!==UI_SCOPE)throw bad(403,'作用域不匹配');return json(res,200,await v8CoreRead(p,{scope:UI_SCOPE}));}
 if(p==='/api/v8/ui/settings'){requireWrite(req);if(!coreWorkflowMode)throw bad(503,'需要 RC6 核心');if(u.searchParams.has('scope')&&u.searchParams.get('scope')!==UI_SCOPE)throw bad(403,'作用域不匹配');if(req.method==='GET')return json(res,200,await settingsView(UI_SCOPE));if(req.method==='POST')return json(res,200,await settingsChange(UI_SCOPE,await read(req)));throw bad(405,'方法不支持');}
 if(p==='/api/v8/ui/mainline'){requireWrite(req);if(req.method!=='GET')throw bad(405,'仅允许读取');if(!coreWorkflowMode)throw bad(503,'需要 RC6 核心');if(u.searchParams.has('scope')&&u.searchParams.get('scope')!==UI_SCOPE)throw bad(403,'作用域不匹配');return json(res,200,await v8CoreRead(p,{scope:UI_SCOPE,name:u.searchParams.get('name')||''}));}
 if(p==='/api/v8/ui/quality'){if(process.env.EVERLIGHT_CORE_ADAPTER!=='v8')throw bad(503,'质量审计需要连接核心');return await v8DashboardAdapter(req,res,u);}
 if(p==='/api/v8/ui/activities'){if(process.env.EVERLIGHT_CORE_ADAPTER!=='v8')throw bad(503,'活动面板需要 RC6 核心接线');return await v8DashboardAdapter(req,res,u);}
 if(process.env.EVERLIGHT_CORE_ADAPTER==='v8'&&['/api/v8/ui/tasks','/api/v8/ui/dreams'].includes(p))return await v8DashboardAdapter(req,res,u);
 if(process.env.EVERLIGHT_CORE_ADAPTER==='v8'&&['/api/list','/api/detail','/api/status','/api/turn','/api/v8/ui/person-memories','/api/reviews','/api/review/detail','/api/recent','/api/search','/api/modules','/api/module','/api/annotations/history'].includes(p))return await v8DashboardAdapter(req,res,u);
 if(p.startsWith('/api/'))return await proxyCore(req,res,u);
 throw bad(404,'路径不存在');
 }catch(e){fail(res,e)}}

if(legacyLocalEnabled&&!coreWorkflowMode&&process.env.EVERLIGHT_DREAM_AUTO!=='0'){
 for(const row of db.prepare('SELECT id FROM ui_dreams WHERE json_extract(record,\'$.status\')=\'queued\'').all()){
   try{processDream(db,row.id)}catch(e){console.error('recover dream failed',row.id,e.message)}
 }
}
if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw Error('无效 PORT');
http.createServer((req,res)=>void main(req,res)).listen(PORT,HOST,()=>console.log(`长明小灯芯 v7： http://${HOST}:${PORT}/  | SQLite=${DB_FILE} | 核心=${CORE_URL||'未连接'} | 生产权限未启用`));
