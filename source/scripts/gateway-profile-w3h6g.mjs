import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {preflight} from './preflight.mjs';
const fileName='gateway.local.json';
function readPrivate(p){const s=fs.lstatSync(p);if(!s.isFile()||s.nlink!==1||(s.mode&0o077)!==0)throw Error('gateway config must be a private regular file (0600)');return JSON.parse(fs.readFileSync(p,'utf8'));}
export function gatewayEnv(base,p){
 if(!p||!Number.isInteger(p.port)||p.port<1024||p.port>65535||typeof p.upstream!=='string'||typeof p.upstream_key!=='string'||!p.upstream_key.trim()||typeof p.gateway_key!=='string'||p.gateway_key.length<24||!Array.isArray(p.models)||!p.models.length||p.models.some(m=>typeof m!=='string'||!m.trim()||m.includes(',')||m!==m.trim())||new Set(p.models).size!==p.models.length)throw Error('invalid gateway profile');
 const u=new URL(p.upstream);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname.endsWith('/chat/completions'))throw Error('use provider API base URL, not chat/completions');
 if(u.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw Error('remote provider must use HTTPS');
 const e={...base,EVERLIGHT_TRIAL_GATEWAY:'1',EVERLIGHT_GATEWAY_PORT:String(p.port),EVERLIGHT_GATEWAY_KEY:p.gateway_key,EVERLIGHT_UPSTREAM_URL:u.href,EVERLIGHT_UPSTREAM_KEY:p.upstream_key,EVERLIGHT_MODELS:p.models.join(','),EVERLIGHT_GATEWAY_CAPTURE:'1',EVERLIGHT_GATEWAY_PURPOSE:'conversation',EVERLIGHT_GATEWAY_DEGRADE:'0',EVERLIGHT_D14E6B_TASK_CONTEXT:'1',EVERLIGHT_D14E6C_CONTINUATION:'1'};
 if(p.association_recall!==undefined&&typeof p.association_recall!=='boolean')throw Error('association_recall must be boolean');
 if(p.association_recall===true)e.EVERLIGHT_J12_ASSOCIATION_GATEWAY='1';
 // Explicit opt-in for the same provider to classify captured conversation. No live wake or auto commit.
 if(p.automation!==undefined){
  const a=p.automation;
  if(!a||typeof a!=='object'||Array.isArray(a)||a.allow_conversation_classification!==true||!p.models.includes(a.model)||![a.user,a.ai].every(v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=120&&!/[\x00-\x1f\x7f]/.test(v))||a.user===a.ai||Object.keys(a).some(k=>!['allow_conversation_classification','model','user','ai'].includes(k)))throw Error('invalid explicit automation profile');
  if(!base.EVERLIGHT_H6_SETTINGS_DB||base.EVERLIGHT_STRICT_WRITE_D9!=='1')throw Error('automation requires strict write and settings database');
  Object.assign(e,{EVERLIGHT_CLASSIFIER_OPT_IN:'1',EVERLIGHT_AUTO_MEMORY_D11:'1',EVERLIGHT_CLASSIFIER_URL:u.href,EVERLIGHT_CLASSIFIER_KEY:p.upstream_key,EVERLIGHT_CLASSIFIER_MODEL:a.model,EVERLIGHT_AUTO_MEMORY_D11_USER:a.user,EVERLIGHT_AUTO_MEMORY_D11_AI:a.ai,EVERLIGHT_D14E2_TASK_AUTO:'1',EVERLIGHT_AWARENESS_D13:'1',EVERLIGHT_D14E5A_SEMANTIC_AUTO:'1',EVERLIGHT_D14E2_REFLECTION_AUTO:'1'});
 }
 preflight(e);return e;
}
export function loadGatewayProfile(dir,base){const p=path.join(dir,fileName);if(!fs.existsSync(p))return base;return gatewayEnv(base,readPrivate(p));}
export function configureGateway(dir,base,input){const p={port:input.port,upstream:input.upstream,models:input.models,upstream_key:input.upstream_key,gateway_key:randomBytes(32).toString('hex'),...(input.association_recall===undefined?{}:{association_recall:input.association_recall}),...(input.automation===undefined?{}:{automation:input.automation})};gatewayEnv(base,p);fs.writeFileSync(path.join(dir,fileName),JSON.stringify(p,null,2)+'\n',{mode:0o600,flag:'wx'});return {state:'configured_not_started',api_base:`http://127.0.0.1:${p.port}/v1`,credential_file:path.join(dir,fileName),classification_configured:!!p.automation,production_approved:false};}
export function configureFromFile(dir,base,inputFile){return configureGateway(dir,base,readPrivate(inputFile));}
