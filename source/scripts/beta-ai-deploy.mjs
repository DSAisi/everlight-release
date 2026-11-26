// AI-facing, local-only onboarding. No shell interpolation, no production discovery.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {parseEnv} from 'node:util';
import {once} from 'node:events';
import {setTimeout as sleep} from 'node:timers/promises';
process.umask(0o077);
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'trial-beta'),lock=path.join(root,'.ai-deploy.lock');
const args=process.argv.slice(2), flags=new Set(['--apply','--raw-only','--allow-model','--local-notes','--structured-notes','--allow-embedding','--vector-classify','--strict-review','--confirm-history','--input','--provider','--config']);
const opts={};let stack,active,fd,interrupted=false,stage='validate';
function emit(x){console.log(JSON.stringify({...x,production_approved:false}));}
function fail(msg){throw Error(msg);}
async function regular(p,privateFile=false){const s=await fs.lstat(p);if(!s.isFile()||s.nlink!==1||(privateFile&&(s.mode&0o077)))fail('Expected regular file; provider/config must be private');return fs.realpath(p);}
async function exists(p){try{await fs.lstat(p);return true}catch(e){if(e.code==='ENOENT')return false;throw e;}}
const clean=Object.fromEntries(Object.entries(process.env).filter(([k])=>!['NODE_OPTIONS','PORT'].includes(k)));
function child(script,argv){return spawn(process.execPath,[path.join(root,'scripts',script),...argv],{cwd:root,env:clean,stdio:['ignore','pipe','pipe']});}
function completed(c){return new Promise((resolve,reject)=>{c.once('error',reject);c.once('close',(code,signal)=>resolve({code,signal}));});}
async function run(script,argv,{capture=false,progress=false}={}){if(interrupted)fail('Interrupted');const c=child(script,argv);active=c;let out='';let line='';c.stdout.on('data',b=>{if(capture)out=(out+b).slice(-100000);if(progress){line+=b;let i;while((i=line.indexOf('\n'))>=0){const l=line.slice(0,i);line=line.slice(i+1);try{const j=JSON.parse(l);if(['prepared','raw_archived','structural_calibration','classified','associated','complete','complete_raw_only'].includes(j.stage)){const safe={stage:j.stage};for(const [k,v] of Object.entries(j))if(typeof v==='number'||typeof v==='boolean')safe[k]=v;emit(safe);}}catch{}}}});c.stderr.resume();const r=await completed(c);active=null;if(r.code!==0)fail(`${script} failed; inspect locally with documented command, do not paste sensitive logs`);return out;}
async function stop(c){if(!c||c.exitCode!==null||c.signalCode!==null)return;const done=completed(c);c.kill('SIGTERM');await done;}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{interrupted=true;active?.kill('SIGTERM');stack?.kill('SIGTERM');});
async function free(p){const s=createServer();try{await new Promise((res,rej)=>{s.once('error',rej);s.listen(p,'127.0.0.1',res)});}catch{fail(`Port ${p} occupied; no existing service will be stopped`);}finally{if(s.listening)await new Promise(r=>s.close(r));}}
async function selectPorts(exclude=[]){const used=new Set(exclude);const chosen=[];for(const preferred of [18790,18787]){let p=preferred;while(p===18792||used.has(p)||!(await free(p).then(()=>true,()=>false))){p++;if(p>65535)fail('No free ports');}used.add(p);chosen.push(p);}return chosen;}
async function probe(url,key){try{const r=await fetch(url,{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(1000)});await r.arrayBuffer();return r.ok;}catch{return false;}}
try{
 for(let i=0;i<args.length;i++){const k=args[i];if(!flags.has(k)||k in opts)fail('Unknown or duplicate flag');if(['--input','--provider','--config'].includes(k)){if(!args[i+1]||args[i+1].startsWith('--'))fail('Missing path');opts[k]=path.resolve(args[++i]);}else opts[k]=true;}
 if(!opts['--input']||['--raw-only','--allow-model','--local-notes'].filter(k=>opts[k]).length!==1)fail('Choose --input and exactly one of --raw-only / --local-notes / --allow-model');
 if(opts['--local-notes']&&['--provider','--strict-review'].some(k=>opts[k]))fail('Local notes cannot use a chat provider or strict model review');
 if(opts['--raw-only']&&(opts['--provider']||opts['--config']))fail('Raw-only cannot configure external processing');
 if(Number(process.versions.node.split('.')[0])<22)fail('Node.js >=22 required; agent may install from official source after authorization');
 const input=await regular(opts['--input']);if(input.startsWith(dir+path.sep)||input===dir)fail('History must be external to trial data');
 const provider=opts['--provider']?await regular(opts['--provider'],true):null;
 const config=opts['--config']?await regular(opts['--config'],true):null;
 const existing=await exists(dir);if(existing){const s=await fs.lstat(dir);if(!s.isDirectory()||s.isSymbolicLink()||await fs.realpath(dir)!==dir)fail('Unsafe trial directory');await regular(path.join(dir,'trial.env'),true);}
 const configured=existing&&await exists(path.join(dir,'gateway.local.json'));
 if(configured)await regular(path.join(dir,'gateway.local.json'),true);
 const profile=provider|| (configured?path.join(dir,'gateway.local.json'):null);const profileData=profile?JSON.parse(await fs.readFile(profile,'utf8')):null;
 if(profileData?.automation)fail('Existing or supplied live classification automation is outside historical import authorization');
 if((opts['--raw-only']||opts['--local-notes'])&&configured)fail('Raw-only requires a trial without a configured gateway; no existing settings are changed');
 if(provider&&(!Number.isInteger(profileData?.port)||profileData.port<1024||profileData.port>65535))fail('Invalid provider port');
 if(opts['--allow-model']&&!provider&&!configured&&!config)fail('Provide an authorized private provider file or existing provider configuration');
 if(provider&&configured)fail('Existing provider configuration will not be overwritten; omit --provider to reuse');
 emit({stage:'plan',mode:opts['--raw-only']?'raw_only':opts['--local-notes']?'local_notes':'semantic',existing_trial:existing,provider_configured:!!(provider||configured),network_processing:!!(opts['--allow-model']||opts['--allow-embedding']),requires_batch_authorization:true,estimated_budget_not_hard_cap:true});
 if(opts['--apply']){
  if(!opts['--confirm-history'])fail('One explicit batch authorization required');
  fd=await fs.open(lock,'wx',0o600);
  stage='initialize';if(!existing){const ports=await selectPorts(profileData?[profileData.port]:[]);await run('w3-handoff.mjs',['init','trial-beta',...ports.map(String)]);}
  stage='configure';if(provider)await run('w3-handoff.mjs',['gateway-config','trial-beta',provider]);
  stage='preflight';const pre=JSON.parse(await run('w3-handoff.mjs',['preflight','trial-beta'],{capture:true}));for(const p of Object.values(pre.ports))await free(p);
  const e=parseEnv(await fs.readFile(path.join(dir,'trial.env'),'utf8'));
  stage='start';stack=child('w3-handoff.mjs',['start','trial-beta']);stack.stdout.resume();stack.stderr.resume();stack.on('error',()=>{interrupted=true;});
  let ready=false;for(let i=0;i<160&&!interrupted&&stack.exitCode===null;i++){ready=await probe(e.EVERLIGHT_CORE_URL+'/api/v8/write/contracts',e.EVERLIGHT_CORE_TOKEN)&&await probe(`http://127.0.0.1:${e.PORT}/`,e.EVERLIGHT_UI_TOKEN);if(ready)break;await sleep(150);}
  if(!ready)fail('Core/panel readiness failed');emit({stage:'services_ready',panel_url:`http://127.0.0.1:${e.PORT}/`});
  stage='import';await run('beta-easy-import.mjs',[input,'--confirm-history',opts['--raw-only']?'--raw-only':opts['--local-notes']?'--local-notes':'--allow-model',...['--structured-notes','--allow-embedding','--vector-classify','--strict-review'].filter(k=>opts[k]),...(config?['--config',config]:[])],{progress:true});
  stage='verify';if(!await probe(e.EVERLIGHT_CORE_URL+'/api/v8/write/contracts',e.EVERLIGHT_CORE_TOKEN))fail('Post-import core verification failed');
  emit({stage:'import_finished',service_lifecycle:'stopped_on_exit',start_command:'npm run beta:start',login_command:'npm run beta:login',reports:'trial-beta/imports/*/bootstrap-report.json',full_semantic_accuracy_verified:false});
 }
}catch(e){emit({stage:'blocked',at:stage,reason:['validate','initialize','preflight'].includes(stage)&&/^(Port |No free ports|Expected regular file|Unknown|Choose |Raw-only|Node.js|History |Unsafe |Provide |Existing |Invalid provider |One explicit|Missing )/.test(e.message)?e.message:'Step failed or interrupted; inspect local configuration/report without sharing secrets',resume:'Fix blocker and rerun with same authorized input and configuration; never overwrite an existing database'});process.exitCode=1;}
finally{await stop(stack);if(fd){await fd.close();await fs.unlink(lock);}}
