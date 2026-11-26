#!/usr/bin/env node
/* 长明 Everlight · 内核 v0.1
 *
 * 这一版只做一件事：让「一句话进来 → 存下来 → 能搜到 → 有回执」这条链真的闭合。
 * 判据（阿肆 20:24）：要我感受到是什么样子，别人感受到就是什么样子 —— 所以这一版
 *   每一个动作都留回执，每一次查不到都写清"查了哪里、为什么空"。
 *
 * 规矩（照 DESIGN-十二库契约.md）：
 *   · S09 身份与自我 = 必填。空着不许启动（她 20:28 亲口确认这条要加）。
 *   · S01 只增，不提供改与删的接口。
 *   · 每次操作都写 S02 回执；查询写 S10 覆盖账。
 *
 * 用法：
 *   node everlight.mjs init --name "长明" --calls "你" --voice "说话直接" \
 *        --nickname "阿肆" [--boundaries "a,b"] [--never "c,d"]
 *   node everlight.mjs add "原文" --ref "raw/x.jsonl:1" [--actor user]
 *   node everlight.mjs query "词"
 *   node everlight.mjs status
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const 根 = path.dirname(fileURLToPath(import.meta.url));
const 库文件 = process.env.EVERLIGHT_DB || path.join(根, "everlight.db");
const 参 = process.argv.slice(2);
const 命令 = 参[0];
const 取 = (k) => { const i = 参.indexOf(k); return i > -1 ? 参[i + 1] : null; };
const 北京 = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 19).replace("T", " ");
const id = (p) => p + "-" + crypto.randomBytes(6).toString("hex");

if (!命令 || 命令 === "help") {
  console.log(`长明 Everlight · 内核 v0.1
  init --name <它叫什么> --calls <它怎么称呼对面> --voice <说话方式> --nickname <对面叫什么>
       [--boundaries "a,b"] [--never "c,d"] [--habits "a,b"] [--fears "a,b"] [--no-touch "a,b"]
  add "<原文>" --ref "<出处>" [--actor user|system] [--happened "<时间>"]
  query "<词>"
  status`);
  process.exit(0);
}

const 开库 = () => {
  const db = new DatabaseSync(库文件);
  db.exec(fs.readFileSync(path.join(根, "schema.sql"), "utf8"));
  return db;
};

const 回执 = (db, stage, result, detail = "", runId = null) => {
  const run = runId || id("run");
  db.prepare(`INSERT OR REPLACE INTO run_receipt(trace_id,run_id,attempt_id,stage,result,at,detail)
              VALUES(?,?,?,?,?,?,?)`)
    .run(id("tr"), run, id("at"), stage, result, 北京(), detail);
  return run;
};

/* ── init：S09 必填，空着就不许建库 ─────────────────────── */
if (命令 === "init") {
  const 名 = 取("--name"), 称呼 = 取("--calls"), 声音 = 取("--voice"), 对方 = 取("--nickname");
  const 缺 = [];
  if (!名) 缺.push("--name（它叫什么）");
  if (!称呼) 缺.push("--calls（它怎么称呼对面）");
  if (!声音) 缺.push("--voice（它怎么说话）");
  if (!对方) 缺.push("--nickname（对面那个人叫什么）");
  if (缺.length) {
    console.error("✗ S09 身份与自我是必填的，缺这几项就不许启动：\n  · " + 缺.join("\n  · "));
    console.error("  （这是契约里写死的：不知道自己是谁、也不知道对面是谁的库，装上了也只是个会翻东西的空壳。）");
    process.exit(2);
  }
  const db = 开库();
  const 列 = (k) => JSON.stringify(k ? k.split(",").map((x) => x.trim()).filter(Boolean) : []);
  db.prepare(`INSERT OR REPLACE INTO identity
    (id,name,calls_them,voice,boundaries,never,their_nickname,their_habits,their_fears,no_touch,revision,updated_at)
    VALUES(1,?,?,?,?,?,?,?,?,?,1,?)`)
    .run(名, 称呼, 声音, 列(取("--boundaries")), 列(取("--never")), 对方,
      列(取("--habits")), 列(取("--fears")), 列(取("--no-touch")), 北京());
  回执(db, "ingest", "ok", "init: S09 已写入");
  console.log(`✓ 建库 ${库文件}`);
  console.log(`  S09 已写：它是「${名}」，称呼对面「${称呼}」，对面是「${对方}」`);
  process.exit(0);
}

/* 除了 init，其它命令都要求 S09 已填 —— 同一个规矩，不只管 init */
const db = 开库();
const 身份 = db.prepare("SELECT * FROM identity WHERE id=1").get();
if (!身份) {
  console.error("✗ 这个库还没有 S09（身份与自我）。先跑 init，把「它是谁／对面是谁」填上。");
  process.exit(2);
}

if (命令 === "add") {
  const 原文 = 参[1];
  const 出处 = 取("--ref");
  if (!原文 || !出处) { console.error("用法：add \"<原文>\" --ref \"<出处>\" [--actor user]"); process.exit(1); }
  const eid = id("ev");
  db.prepare(`INSERT INTO raw_event(event_id,source_ref,actor,subject,scope,happened_at,observed_at,text,seq,first_ingested_at)
              VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(eid, 出处, 取("--actor") || "user", null, "default", 取("--happened") || null, 北京(), 原文,
      db.prepare("SELECT COALESCE(MAX(seq),0)+1 n FROM raw_event").get().n, 北京());
  const run = 回执(db, "ingest", "ok", `S01 +1（${eid}）`);
  console.log(`✓ 收下 ${eid}`);
  console.log(`  原文 ${原文.length} 字，出处 ${出处}`);
  console.log(`  回执 run=${run}`);
  process.exit(0);
}

if (命令 === "query") {
  const 词 = 参[1];
  if (!词) { console.error("用法：query \"<词>\""); process.exit(1); }
  const run = id("run");
  const 检 = 词;
  const 命中 = db.prepare(`SELECT event_id,observed_at,text,source_ref FROM raw_event
                           WHERE instr(lower(text),lower(?)) > 0 ORDER BY observed_at DESC LIMIT 10`).all(检);
  /* S10：这次查了哪里、为什么空 —— 不管中没中都记 */
  db.prepare(`INSERT OR REPLACE INTO coverage(run_id,asked,sources_checked,hit,missed_reason,coverage,at)
              VALUES(?,?,?,?,?,?,?)`)
    .run(run, 词, JSON.stringify(["S01.raw_event"]), 命中.length,
      命中.length ? null : "字面匹配没有命中；已知边界：本版只有 S01 字面检索，没有语义与关系扩展",
      命中.length ? "S01 全表" : "S01 全表已扫", 北京());
  回执(db, "query", 命中.length ? "ok" : "partial",
     `query「${词}」→ ${命中.length} 条`, run);

  console.log(`【长明】「${词}」→ ${命中.length} 条`);
  for (const r of 命中) console.log(`  · [${r.observed_at}] ${String(r.text).slice(0, 60)}（${r.source_ref}）`);
  if (!命中.length) {
    console.log(`  （没有命中。查过：S01 原始记录全表。没找到不等于不存在 —— 本版只有字面检索。）`);
  }
  console.log(`  回执 run=${run}｜S10 覆盖账已记`);
  process.exit(0);
}

/* ── S05 事实与偏好：人能更正 ───────────────────────────
   这是稿 §8 的第一格「持久档案 + 人能更正」。判据：
   · 改一条不覆盖旧的 —— 旧版转 superseded，新版是 current，两版都能查
   · 必须写清"凭什么改"（理由进回执）
   ──────────────────────────────────────────────────────── */
if (命令 === "fact") {
  const 子 = 参[1];
  const 现在 = 北京();
  if (子 === "add") {
    const 说法 = 参[2];
    const 出处 = 取("--ref");
    if (!说法 || !出处) { console.error('用法：fact add "<说法>" --ref "<出处>"'); process.exit(1); }
    const mid = id("mem");
    db.prepare(`INSERT INTO fact_rev(memory_id,revision,statement,valid_from,status,source_refs,created_at)
                VALUES(?,1,?,?, 'current', ?, ?)`)
      .run(mid, 说法, 取("--from") || 现在, JSON.stringify([出处]), 现在);
    回执(db, "ingest", "ok", `S05 +1（${mid} v1）`);
    console.log(`✓ 记下一条事实 ${mid}（v1）：${说法}`);
    process.exit(0);
  }
  if (子 === "fix") {
    const mid = 参[2], 新说法 = 参[3], 理由 = 取("--why");
    if (!mid || !新说法 || !理由) { console.error('用法：fact fix <memory_id> "<新说法>" --why "<凭什么改>"'); process.exit(1); }
    const 旧 = db.prepare(`SELECT * FROM fact_rev WHERE memory_id=? AND status='current'`).get(mid);
    if (!旧) { console.error("没有这条的 current 版本：" + mid); process.exit(1); }
    const 新rev = 旧.revision + 1;
    db.exec("BEGIN IMMEDIATE");
    try {
      const changed = db.prepare(`UPDATE fact_rev SET status='superseded',valid_to=? WHERE memory_id=? AND revision=? AND status='current'`).run(现在, mid, 旧.revision);
      if (changed.changes !== 1) throw new Error("当前版本已被别人更改，请重新读取");
      db.prepare(`INSERT INTO fact_rev(memory_id,revision,statement,valid_from,status,source_refs,scope,created_at,first_ingested_at,review_note,reviewed_by)
                  VALUES(?,?,?,?, 'current', ?, ?, ?, ?, ?, ?)`)
        .run(mid, 新rev, 新说法, 现在, 旧.source_refs, 旧.scope, 现在, 旧.first_ingested_at || 旧.created_at, 理由, 'cli');
      回执(db, "action", "ok", `S05 更正 ${mid}: v${旧.revision}→v${新rev}｜理由：${理由}`);
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    console.log(`✓ 已更正 ${mid}：v${旧.revision} → v${新rev}`);
    console.log(`  旧：${旧.statement}`);
    console.log(`  新：${新说法}`);
    console.log(`  旧版没删，转成 superseded，还能查`);
    process.exit(0);
  }
  if (子 === "list") {
    const 们 = db.prepare(`SELECT memory_id,revision,statement,status FROM fact_rev ORDER BY created_at DESC LIMIT 20`).all();
    if (!们.length) console.log("（还没有事实）");
    for (const r of 们) console.log(`  ${r.status === "current" ? "●" : "○"} ${r.memory_id} v${r.revision} [${r.status}] ${String(r.statement).slice(0, 50)}`);
    process.exit(0);
  }
  if (子 === "history") {
    const mid = 参[2];
    const 们 = db.prepare(`SELECT * FROM fact_rev WHERE memory_id=? ORDER BY revision`).all(mid);
    if (!们.length) { console.log("没有这条"); process.exit(0); }
    for (const r of 们) console.log(`  v${r.revision} [${r.status}] ${r.statement}　（${r.created_at}）`);
    process.exit(0);
  }
  console.error("fact 的子命令：add / fix / list / history");
  process.exit(1);
}

/* ── serve：浏览器面板（稿 §5「人怎么用」的最小版） ─────────
   端口 4780（避开家里现役的 3080/3090/8899/4399）。
   接口照 PORTABLE_API 的思路命名：query / status / list。
   ──────────────────────────────────────────────────────── */
if (命令 === "serve") {
  const http = await import("node:http");
  const 端口 = Number(取("--port") || 4780);
  const 地址 = 取("--host") || process.env.EVERLIGHT_HOST || "127.0.0.1";
  const 密钥 = process.env.EVERLIGHT_TOKEN || "";
  const 可写 = 参.includes("--enable-writes") && 密钥.length >= 16;
  const 敏感模块已授权 = process.env.EVERLIGHT_ENABLE_SENSITIVE === '1' && 密钥.length >= 16;
  const 是否本机 = ["127.0.0.1", "localhost", "::1"].includes(地址);
  if (!是否本机 && (密钥.length < 16 || !参.includes('--behind-tls-proxy') || process.env.EVERLIGHT_SECURE_COOKIE !== '1'))
    throw new Error("远程绑定需要令牌、--behind-tls-proxy 和 EVERLIGHT_SECURE_COOKIE=1，且必须有真正的 HTTPS 反向代理");
  if (参.includes("--enable-writes") && !可写) throw new Error("写入需要 --enable-writes 和长度至少16的 EVERLIGHT_TOKEN");
  if (!Number.isInteger(端口) || 端口 < 1 || 端口 > 65535) throw new Error("无效端口");

  const tokenHash = crypto.createHmac("sha256", 密钥 || "disabled").update("everlight-session-v1").digest("hex");
  const timingEqual = (a, b) => { const aa=Buffer.from(String(a||"")),bb=Buffer.from(String(b||""));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb); };
  const auth = req => !密钥 || timingEqual((req.headers.authorization||"").replace(/^Bearer\s+/i,""),密钥) ||
      timingEqual((req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("everlight_session="))?.slice(18),tokenHash);
  const sameOrigin = req => {
    if(!req.headers.origin) return true;  // CLI without Origin; must still supply bearer or authenticated cookie
    try { const o=new URL(req.headers.origin), host=req.headers.host; return o.host===host && (o.protocol==='http:'||o.protocol==='https:'); }
    catch { return false; }
  };
  const json = (res,code,body,headers={}) => {
    res.writeHead(code,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-frame-options":"DENY",...headers});
    res.end(JSON.stringify(body));
  };
  const readBody = async req => {
    if(!String(req.headers["content-type"]||"").startsWith("application/json")) throw Object.assign(new Error("需要 application/json"),{code:415});
    let chunks=[],n=0;
    for await(const c of req){n+=c.length;if(n>64*1024)throw Object.assign(new Error("请求超过64KiB"),{code:413});chunks.push(c);}
    try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw Object.assign(new Error("JSON 格式错误"),{code:400});}
  };
  const onlyString=(x,max=2000)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
  const int=(x,def,max=500)=>{ const n=x===null?def:Number(x);return Number.isSafeInteger(n)&&n>=0&&n<=max?n:null; };
  const tableMap={
    S01:{table:"raw_event",pk:"event_id",text:"text",at:"observed_at",ref:"source_ref"},
    S02:{table:"run_receipt",pk:null,text:"stage||' · '||result",at:"at",ref:"run_id"},
    S03:{table:"work_item",pk:"item_id",text:"title",at:"created_at",ref:"source_refs",status:"state"},
    S04:{table:"episode",pk:"episode_id",text:"summary",at:"at",ref:"event_refs"},
    S05:{table:"fact_rev",pk:"memory_id",text:"statement",at:"created_at",ref:"source_refs",status:"status"},
    S06:{table:"procedure",pk:"proc_id",text:"how",at:"created_at",ref:"env"},
    S07:{table:"person",pk:"person_id",text:"name",at:null,ref:"evidence"},
    S08:{table:"affect",pk:"affect_id",text:"expression",at:"observed_at",ref:"source_refs",status:"review_status"},
    S09:{table:"identity",pk:"id",text:"name",at:"updated_at",ref:"voice"},
    S10:{table:"coverage",pk:"run_id",text:"asked",at:"at",ref:"sources_checked"},
    S11:{table:"reflection",pk:"reflection_id",text:"claim",at:"at",ref:"from_episode",status:"verified_level"},
    S12:{table:"atlas_file",pk:"file_id",text:"path||' · '||coalesce(summary,'')",at:"checked_at",ref:"path"}
  };
  const moduleMap={growth:"growth",continuity:"continuity",lessons:"lessons",domains:"domains",candidates:"candidates",tombstones:"tombstones",env:"env_state",vitals:"vitals"};
  const columns=t=>new Set(db.prepare(`PRAGMA table_info(${t})`).all().map(x=>x.name));
  const hasTable=t=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)!==undefined;
  const count=t=>hasTable(t)?db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c:0;
  const optional=(t)=>t==='vitals'&&!敏感模块已授权?{available:false,count:0,why:'敏感模块默认关闭；需认证令牌与明确的 EVERLIGHT_ENABLE_SENSITIVE=1'}:
    hasTable(t)?{available:count(t)>0,count:count(t)}:{available:false,count:0,why:"此实例未启用可选模块"};
  const annotation = (slot,key)=>db.prepare("SELECT note,review_status,revision,updated_at,updated_by FROM memory_annotation WHERE slot=? AND record_id=?").get(slot,key)||null;
  const rowKey = (slot,row)=>slot==='S02' ? JSON.stringify([row.trace_id,row.attempt_id,row.stage]) : String(row[tableMap[slot].pk]);
  const normalize=(slot,row)=>{
    const m=tableMap[slot],c=columns(m.table),key=rowKey(slot,row);
    return {id:key,slot,text:row.text,at:row.at??null,ref:row.ref??null,status:row.status??null,
      happened:c.has('happened_at')?row.happened_at:null,
      ingested:c.has('first_ingested_at')?row.first_ingested_at:null,
      edited:c.has('updated_at')?row.updated_at:null,
      last_recall:c.has('last_recalled_at')?row.last_recalled_at:null,
      recall_count:c.has('recall_count')?row.recall_count:null,
      review_note:c.has('review_note')?row.review_note:null,
      revision:c.has('revision')?row.revision:null,
      scope:c.has('scope')?row.scope:null,
      annotation:annotation(slot,key),
      editable:slot==='S05'&&row.status==='current'?'revision': 'annotation_only'};
  };
  const listRows=(slot,limit,offset)=>{
    const m=tableMap[slot];const c=columns(m.table);
    const aliases=[`${m.text} AS text`,`${m.at||'NULL'} AS at`,`${m.ref||'NULL'} AS ref`,`${m.status||'NULL'} AS status`];
    const order=m.at||m.pk||'rowid';
    const where=slot==='S05'?" WHERE status='current'":"";
    const total=slot==='S05'?db.prepare("SELECT COUNT(*) c FROM fact_rev WHERE status='current'").get().c:count(m.table);
    const rows=db.prepare(`SELECT *,${aliases.join(',')} FROM ${m.table}${where} ORDER BY ${order} DESC LIMIT ? OFFSET ?`).all(limit,offset);
    return {slot,total,limit,offset,rows:rows.map(r=>normalize(slot,r))};
  };
  const recentRows=(limit)=>{
    // Only a bounded sample per library; stable ID and source metadata come from normalize().
    const rows=Object.keys(tableMap).flatMap(slot=>listRows(slot,limit,0).rows);
    return rows.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')) || String(a.slot).localeCompare(String(b.slot))).slice(0,limit);
  };
  const searchRows=(term,selectedSlot,limit,offset)=>{
    const chosen=selectedSlot?[selectedSlot]:Object.keys(tableMap);
    if(selectedSlot&&!tableMap[selectedSlot])return null;
    const examined=[],all=[];let total=0;
    for(const slot of chosen){
      const m=tableMap[slot], aliases=[`${m.text} AS text`,`${m.at||'NULL'} AS at`,`${m.ref||'NULL'} AS ref`,`${m.status||'NULL'} AS status`];
      const clause=`instr(lower(CAST(${m.text} AS TEXT)),lower(?))>0${slot==='S05'?" AND status='current'":""}`;
      const num=db.prepare(`SELECT COUNT(*) c FROM ${m.table} WHERE ${clause}`).get(term).c;
      examined.push({slot,hits:num});total+=num;
      if(!num)continue;
      // Explicitly capped pagination; avoid unbounded client scans.
      const sample=db.prepare(`SELECT *,${aliases.join(',')} FROM ${m.table} WHERE ${clause} ORDER BY ${m.at||m.pk||'rowid'} DESC LIMIT ?`).all(term,limit+offset);
      all.push(...sample.map(r=>normalize(slot,r)));
    }
    const order=all.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')) || String(a.slot).localeCompare(String(b.slot)));
    return {query:term,scope:'literal_only',checked:chosen,examined,total,limit,offset,rows:order.slice(offset,offset+limit),has_more:offset+limit<total};
  };
  const detailRow=(slot,key,rev=null)=>{
    const m=tableMap[slot];let row;
    if(slot==='S02'){
      let parts;try{parts=JSON.parse(key);}catch{return null;}
      if(!Array.isArray(parts)||parts.length!==3||parts.some(x=>typeof x!=='string'))return null;
      row=db.prepare("SELECT *, stage||' · '||result AS text,at,run_id AS ref,NULL AS status FROM run_receipt WHERE trace_id=? AND attempt_id=? AND stage=?").get(...parts);
    }else{
      const where=slot==='S05'&&rev!==null?' AND revision=?':'';
      const aliases=[`${m.text} AS text`,`${m.at||'NULL'} AS at`,`${m.ref||'NULL'} AS ref`,`${m.status||'NULL'} AS status`];
      row=db.prepare(`SELECT *,${aliases.join(',')} FROM ${m.table} WHERE ${m.pk}=?${where} ORDER BY ${slot==='S05'?'revision DESC':m.pk} LIMIT 1`).get(...(where?[key,rev]:[key]));
    }
    if(!row)return null;
    const entry=normalize(slot,row);
    const history=slot==='S05'?db.prepare("SELECT revision,statement,status,valid_from,valid_to,created_at,review_note,reviewed_by FROM fact_rev WHERE memory_id=? ORDER BY revision DESC").all(key):[];
    return { ...entry, raw:row, history};
  };
  // additive schema; never alters evidence tables nor rewrites existing records
  db.exec(`CREATE TABLE IF NOT EXISTS memory_annotation (
    slot TEXT NOT NULL,record_id TEXT NOT NULL,note TEXT,review_status TEXT,revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,PRIMARY KEY(slot,record_id));
    CREATE TABLE IF NOT EXISTS memory_annotation_history (
    event_id TEXT PRIMARY KEY,slot TEXT NOT NULL,record_id TEXT NOT NULL,revision INTEGER NOT NULL,
    note TEXT,review_status TEXT,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS review_decision_audit (
    event_id TEXT PRIMARY KEY,item_id TEXT NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL,
    decided_by TEXT NOT NULL,decided_at TEXT NOT NULL,proposal_text TEXT);
  `);
  // old-schema compatibility: do not rewrite review_queue, add only missing columns
  for(const col of ['decision_note','proposal_text']) if(!columns('review_queue').has(col))db.exec(`ALTER TABLE review_queue ADD COLUMN ${col} TEXT`);
  const reviewRows=(limit,offset,state)=>{
    const s=state||'pending';
    const total=db.prepare("SELECT COUNT(*) c FROM review_queue WHERE state=?").get(s).c;
    const rows=db.prepare("SELECT * FROM review_queue WHERE state=? ORDER BY created_at DESC LIMIT ? OFFSET ?").all(s,limit,offset);
    return {total,limit,offset,state:s,rows};
  };
  const staticDir=path.join(根,'notebook');
  const assetTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
  const serveAsset=(pathname,res)=>{
    let relative;
    try{relative=decodeURIComponent(pathname.replace(/^\/notebook\/?/,''))||'index.html';}catch{json(res,400,{error:'bad path'});return;}
    const p=path.resolve(staticDir,relative);
    if(!p.startsWith(staticDir+path.sep)||!assetTypes[path.extname(p)]||!fs.existsSync(p)||!fs.statSync(p).isFile()){
      json(res,404,{error:'文件不存在'});return;
    }
    res.writeHead(200,{'content-type':assetTypes[path.extname(p)],'cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY'});
    fs.createReadStream(p).pipe(res);
  };
  const server=http.createServer(async(req,res)=>{
    try{
      const u=new URL(req.url,'http://local');
      if(req.method==='GET'&&['/','/index.html','/ui'].includes(u.pathname)){
        res.writeHead(302,{location:'notebook/','cache-control':'no-store'});res.end();return;
      }
      if(req.method==='GET'&&(u.pathname==='/notebook'||u.pathname.startsWith('/notebook/'))){serveAsset(u.pathname,res);return;}
      if(u.pathname==='/api/session'&&req.method==='POST'){
        if(!密钥)return json(res,400,{error:'未配置登录令牌；本机可只读浏览'});
        if(!sameOrigin(req))return json(res,403,{error:'Origin 不匹配'});
        const body=await readBody(req);
        if(!timingEqual(body.token,密钥))return json(res,401,{error:'认证失败'});
        const secure=process.env.EVERLIGHT_SECURE_COOKIE==='1'?' Secure;':'';
        return json(res,200,{ok:true,writes_enabled:可写},{'set-cookie':`everlight_session=${tokenHash}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200;${secure}`});
      }
      if(!u.pathname.startsWith('/api/'))return json(res,404,{error:'未知路径'});
      if(!auth(req))return json(res,401,{error:'需要授权','login_required':true});
      if(req.method==='POST'){
        if(!可写)return json(res,403,{error:'写入未开启：需要令牌和 --enable-writes'});
        if(!sameOrigin(req))return json(res,403,{error:'Origin 不匹配'});
        const body=await readBody(req);
        if(u.pathname==='/api/fact/revise'){
          const {memory_id,expected_revision,statement,reason,actor}=body;
          if(!onlyString(memory_id,160)||!Number.isInteger(expected_revision)||!onlyString(statement,5000)||!onlyString(reason,500)||!onlyString(actor,100))return json(res,400,{error:'缺少有效记忆 ID、期望版本、正文、修改理由或操作人'});
          db.exec('BEGIN IMMEDIATE');
          try{
            const old=db.prepare("SELECT * FROM fact_rev WHERE memory_id=? AND status='current'").get(memory_id);
            if(!old){db.exec('ROLLBACK');return json(res,404,{error:'没有当前版本'});}
            if(old.revision!==expected_revision){db.exec('ROLLBACK');return json(res,409,{error:'版本冲突',current_revision:old.revision});}
            const at=北京();
            db.prepare("UPDATE fact_rev SET status='superseded',valid_to=? WHERE memory_id=? AND revision=? AND status='current'").run(at,memory_id,expected_revision);
            db.prepare(`INSERT INTO fact_rev(memory_id,revision,statement,valid_from,status,source_refs,scope,created_at,updated_at,last_recalled_at,recall_count,first_ingested_at,review_note,reviewed_by)
              VALUES(?,?,?,?, 'current',?,?,?,?,NULL,0,?,?,?)`)
              .run(memory_id,expected_revision+1,statement.trim(),at,old.source_refs,old.scope,at,at,old.first_ingested_at||old.created_at,reason.trim(),actor.trim());
            回执(db,'action','ok',`人工更正 S05 ${memory_id} v${expected_revision}→v${expected_revision+1}，操作人 ${actor}，原因 ${reason}`);
            db.exec('COMMIT');
            return json(res,200,{ok:true,memory_id,revision:expected_revision+1,previous_revision:expected_revision});
          }catch(e){db.exec('ROLLBACK');throw e;}
        }
        if(u.pathname==='/api/annotation'){
          const {slot,id:record_id,expected_revision,note,review_status,actor}=body;
          if(!tableMap[slot]||!onlyString(record_id,1024)||!Number.isInteger(expected_revision)||expected_revision<0||!onlyString(actor,100)||typeof note!=='string'||note.length>4000||typeof review_status!=='string'||review_status.length>100)return json(res,400,{error:'无效注释参数'});
          if(!detailRow(slot,record_id))return json(res,404,{error:'原记录不存在'});
          db.exec('BEGIN IMMEDIATE');
          try{
            const prev=annotation(slot,record_id),current=prev?.revision||0;
            if(current!==expected_revision){db.exec('ROLLBACK');return json(res,409,{error:'注释版本冲突',current_revision:current});}
            const rev=current+1, at=北京();
            db.prepare('INSERT INTO memory_annotation(slot,record_id,note,review_status,revision,updated_at,updated_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(slot,record_id) DO UPDATE SET note=excluded.note,review_status=excluded.review_status,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(slot,record_id,note,review_status,rev,at,actor);
            db.prepare('INSERT INTO memory_annotation_history(event_id,slot,record_id,revision,note,review_status,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)').run(id('an'),slot,record_id,rev,note,review_status,at,actor);
            回执(db,'review','ok',`人工注释 ${slot}/${record_id} v${rev}，${actor}`);
            db.exec('COMMIT');return json(res,200,{ok:true,revision:rev});
          }catch(e){db.exec('ROLLBACK');throw e;}
        }
        if(u.pathname==='/api/review/decide'){
          const {item_id,decision,reason,actor,proposal_text}=body;
          if(!onlyString(item_id,160)||!['accepted','rejected','deferred'].includes(decision)||!onlyString(reason,500)||!onlyString(actor,100)||!(proposal_text===undefined||typeof proposal_text==='string'&&proposal_text.length<=5000))return json(res,400,{error:'无效审核请求'});
          db.exec('BEGIN IMMEDIATE');
          try{
            const target=db.prepare("SELECT * FROM review_queue WHERE item_id=?").get(item_id);
            if(!target){db.exec('ROLLBACK');return json(res,404,{error:'提议不存在'});}
            if(target.state!=='pending'){db.exec('ROLLBACK');return json(res,409,{error:'提议已被处理',state:target.state});}
            const at=北京();
            db.prepare('UPDATE review_queue SET state=?,decided_by=?,decided_at=?,decision_note=?,proposal_text=? WHERE item_id=? AND state=?').run(decision,actor,at,reason,proposal_text??target.proposal_text??null,item_id,'pending');
            db.prepare('INSERT INTO review_decision_audit(event_id,item_id,state,reason,decided_by,decided_at,proposal_text) VALUES(?,?,?,?,?,?,?)').run(id('rv'),item_id,decision,reason,actor,at,proposal_text??target.proposal_text??null);
            回执(db,'review','ok',`候选 ${item_id} ${decision} 人工决定；仅记录决定，未自动写入目标库`);
            db.exec('COMMIT');
            return json(res,200,{ok:true,state:decision,materialized:false,notice:'审核决议已入账；目标库写入需要独立、按库验证的操作'});
          }catch(e){db.exec('ROLLBACK');throw e;}
        }
        return json(res,404,{error:'未知写入接口'});
      }
      if(req.method!=='GET')return json(res,405,{error:'不支持的方法'},{allow:'GET, POST'});
      if(u.pathname==='/api/status')return json(res,200,{identity:{name:身份.name,calls_them:身份.calls_them,their_nickname:身份.their_nickname},counts:Object.fromEntries(Object.entries(tableMap).map(([key,m])=>[key,count(m.table)])),modules:Object.fromEntries(Object.entries(moduleMap).map(([name,t])=>[name,optional(t).available])),writes_enabled:可写,auth_required:!!密钥});
      if(u.pathname==='/api/recent'){
        const limit=int(u.searchParams.get('limit'),10,30);
        if(!limit||limit>30)return json(res,400,{error:'数量应在 1–30 之间'});
        return json(res,200,{rows:recentRows(limit),limit,source:'live_records'});
      }
      if(u.pathname==='/api/search'){
        const q=u.searchParams.get('q')?.trim();
        if(!q||q.length>200)return json(res,400,{error:'检索词需要 1–200 字'});
        const slot=u.searchParams.get('slot')||null,limit=int(u.searchParams.get('limit'),30,50),offset=int(u.searchParams.get('offset'),0,5000);
        if(!limit||offset===null)return json(res,400,{error:'分页参数无效'});
        const result=searchRows(q,slot,limit,offset);
        if(!result)return json(res,400,{error:'未知库'});
        const run=id('run');
        const miss=result.total?null:'十二库或选中库的字面匹配未命中；未检查语义、关系或外部附件';
        db.prepare('INSERT INTO coverage(run_id,asked,sources_checked,hit,missed_reason,coverage,at) VALUES(?,?,?,?,?,?,?)')
          .run(run,q,JSON.stringify(result.checked),result.total,miss,'UI 跨库字面检索（指定正文列）',北京());
        回执(db,'query',result.total?'ok':'partial',`UI search ${result.total} 条，范围 ${result.checked.join(',')}`,run);
        return json(res,200,{...result,run});
      }
      if(u.pathname==='/api/review/detail'){
        const item=u.searchParams.get('id');if(!item)return json(res,400,{error:'需要 id'});
        const record=db.prepare('SELECT * FROM review_queue WHERE item_id=?').get(item);
        const audit=record?db.prepare('SELECT * FROM review_decision_audit WHERE item_id=? ORDER BY decided_at DESC LIMIT 100').all(item):[];
        return record?json(res,200,{record,audit}):json(res,404,{error:'没有这条提议'});
      }
      if(u.pathname==='/api/list'){
        const slot=u.searchParams.get('slot')||'S01';if(!tableMap[slot])return json(res,400,{error:'未知库',allowed:Object.keys(tableMap)});
        const limit=int(u.searchParams.get('limit'),50,500),offset=int(u.searchParams.get('offset'),0,100000000);
        if(limit===null||limit<1||offset===null)return json(res,400,{error:'分页参数无效'});
        return json(res,200,listRows(slot,limit,offset));
      }
      if(u.pathname==='/api/detail'){
        const slot=u.searchParams.get('slot'),key=u.searchParams.get('id');
        if(!tableMap[slot]||!key)return json(res,400,{error:'需要有效 slot 与 id'});
        const rev=u.searchParams.has('revision')?int(u.searchParams.get('revision'),null,1000000):null;
        if(u.searchParams.has('revision')&&rev===null)return json(res,400,{error:'版本参数无效'});
        const d=detailRow(slot,key,rev);return d?json(res,200,d):json(res,404,{error:'没有这条记录'});
      }
      if(u.pathname==='/api/annotations/history'){
        const slot=u.searchParams.get('slot'),record_id=u.searchParams.get('id');
        if(!tableMap[slot]||!record_id)return json(res,400,{error:'无效参数'});
        return json(res,200,{rows:db.prepare('SELECT * FROM memory_annotation_history WHERE slot=? AND record_id=? ORDER BY revision DESC LIMIT 100').all(slot,record_id)});
      }
      if(u.pathname==='/api/reviews'){
        const state=u.searchParams.get('state')||'pending';
        if(!['pending','accepted','rejected','deferred'].includes(state))return json(res,400,{error:'未知审核状态'});
        const limit=int(u.searchParams.get('limit'),50,200),offset=int(u.searchParams.get('offset'),0,100000000);
        if(!limit||offset===null)return json(res,400,{error:'分页参数无效'});
        return json(res,200,reviewRows(limit,offset,state));
      }
      if(u.pathname==='/api/modules')return json(res,200,{modules:Object.fromEntries(Object.entries(moduleMap).map(([name,t])=>[name,optional(t)]))});
      if(u.pathname==='/api/module'||u.pathname==='/api/vitals'){ // /api/vitals is a compatibility alias; UI uses /api/module only
        const name=u.pathname==='/api/vitals'?'vitals':u.searchParams.get('name');const table=moduleMap[name];
        if(!table)return json(res,400,{error:'未知模块'});
        const info=optional(table);
        if(!info.available)return json(res,200,{module:name,available:false,total:0,rows:[],why:info.why||'模块为空'});
        const limit=int(u.searchParams.get('limit'),50,200),offset=int(u.searchParams.get('offset'),0,100000000);
        if(!limit||offset===null)return json(res,400,{error:'分页参数无效'});
        const rows=db.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`).all(limit,offset);
        return json(res,200,{module:name,available:true,total:info.count,limit,offset,rows});
      }
      if(u.pathname==='/api/turn'){
        const trace=u.searchParams.get('trace');
        if(trace){const turn=db.prepare('SELECT * FROM turn WHERE trace_id=?').get(trace);
          if(!turn)return json(res,404,{error:'没有这一轮'});
          const parse=x=>{try{return JSON.parse(x||'[]');}catch{return [];}};
          return json(res,200,{...turn,lanes:parse(turn.lanes),recalled:parse(turn.recalled),selected:parse(turn.selected),dropped:parse(turn.dropped),actual_request_verified:false,verification_note:'selected 表示计划选中，非实际请求读回证据'});
        }
        const limit=int(u.searchParams.get('limit'),50,200),offset=int(u.searchParams.get('offset'),0,100000000);
        if(!limit||offset===null)return json(res,400,{error:'分页参数无效'});
        const rows=db.prepare('SELECT trace_id AS trace,at,asked,injected,note FROM turn ORDER BY at DESC LIMIT ? OFFSET ?').all(limit,offset);
        return json(res,200,{total:count('turn'),limit,offset,rows:rows.map(x=>({...x,planned_selected:x.injected,actual_request_verified:false}))});
      }
      if(u.pathname==='/api/query'){
        const term=u.searchParams.get('q')?.trim();
        if(!term||term.length>200)return json(res,400,{error:'搜索词不能为空，最多200字'});
        const run=id('run'),rows=db.prepare('SELECT event_id AS id,text,observed_at AS at,source_ref AS ref FROM raw_event WHERE instr(lower(text),lower(?))>0 ORDER BY observed_at DESC LIMIT 50').all(term);
        const why=rows.length?'':'仅对 S01 原始记录做了字面匹配，没有命中；尚未检查其他库、语义或关系扩展。';
        db.prepare('INSERT INTO coverage(run_id,asked,sources_checked,hit,missed_reason,coverage,at) VALUES(?,?,?,?,?,?,?)').run(run,term,JSON.stringify(['S01.raw_event']),rows.length,why||null,'S01 字面匹配',北京());
        回执(db,'query',rows.length?'ok':'partial',`UI query ${rows.length} 条`,run);
        return json(res,200,{rows,why,checked:['S01.raw_event'],run,scope:'literal_only'});
      }
      return json(res,404,{error:'没有这个接口'});
    }catch(e){return json(res,e.code&&[400,401,403,404,409,413,415].includes(e.code)?e.code:500,{error:e.code?e.message:'服务器处理失败',...(process.env.EVERLIGHT_DEBUG==='1'?{debug:String(e)}:{})});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(端口,地址,resolve);});
  console.log(`长明 · 隔离服务：http://${地址}:${端口}/notebook/ · ${可写?'已启用授权编辑':'只读'} · 数据库 ${库文件}`);
  await new Promise(()=>{});
} else if (命令 === "status") {
  const 数 = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  console.log("【长明 · 库状态】");
  console.log(`  它是「${身份.name}」，称呼「${身份.calls_them}」，对面是「${身份.their_nickname}」`);
  for (const t of ["raw_event", "run_receipt", "work_item", "episode", "fact_rev", "procedure", "person", "affect", "coverage", "reflection", "atlas_file", "tombstone"]) {
    console.log(`  ${t.padEnd(12)} ${数(t)}`);
  }
  process.exit(0);
}

console.error("没这个命令：" + 命令);
process.exit(1);
