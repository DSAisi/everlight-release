#!/usr/bin/env node
/* Starts ONLY an explicitly initialized local core DB, plus the UI gateway.
   Never starts or restarts a production DSH process. */
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const coreDb=process.env.EVERLIGHT_DB||path.join(root,'private-data','everlight-core.sqlite');
const port=Number(process.env.PORT||8787),corePort=Number(process.env.EVERLIGHT_CORE_PORT||4781);
const isolatedRoot=path.resolve(root,'private-data')+path.sep;
if(!path.resolve(coreDb).startsWith(isolatedRoot)){
 console.error('start-local 只允许目录内的独立测试库：'+isolatedRoot);
 console.error('拒绝自动启动可能属于现役 DSH 的数据库。已有生产服务请由 D 另行按接口授权适配。');process.exit(2);
}
if(!fs.existsSync(coreDb)){
 console.error('找不到独立长明核心数据库：'+coreDb);
 console.error('请先按 README 显式设置 S09 身份，再运行本命令。不会替你创造真实身份或写生产记忆。');process.exit(2);
}
const base={...process.env,EVERLIGHT_DB:coreDb,EVERLIGHT_HOST:'127.0.0.1'};
const coreArgs=['core/everlight.mjs','serve','--port',String(corePort)];
if(process.env.EVERLIGHT_CORE_WRITES==='1')coreArgs.push('--enable-writes');
const core=spawn(process.execPath,coreArgs,{cwd:root,env:{...base,EVERLIGHT_TOKEN:process.env.EVERLIGHT_CORE_TOKEN||''},stdio:'inherit'});
let ui;
const shutdown=()=>{if(ui&&!ui.killed)ui.kill('SIGTERM');if(!core.killed)core.kill('SIGTERM')};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
core.on('exit',(code)=>{console.log('隔离核心退出',code);if(ui&&!ui.killed)ui.kill();process.exitCode=code||0});
setTimeout(()=>{
 if(core.exitCode!==null)return;
 ui=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,EVERLIGHT_CORE_URL:`http://127.0.0.1:${corePort}`,PORT:String(port)},stdio:'inherit'});
 ui.on('exit',code=>{console.log('面板服务退出',code);if(!core.killed)core.kill();process.exitCode=code||0});
},450);
