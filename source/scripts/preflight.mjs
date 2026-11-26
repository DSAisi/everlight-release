import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {servicePlan} from './service-plan.mjs';
import {workerPlan} from '../automation/supervisor.mjs';
function canonical(p){const a=path.resolve(p);try{return fs.realpathSync(a)}catch(e){if(e.code!=='ENOENT'||path.dirname(a)===a)throw e;return path.join(canonical(path.dirname(a)),path.basename(a));}}
function identity(p){const real=canonical(p);try{const s=fs.statSync(real);if(!s.isFile())throw Error('database path is not a regular file');return {real,inode:`${s.dev}:${s.ino}`}}catch(e){if(e.code!=='ENOENT')throw e;return {real,inode:null}}}
function port(e,k,d){const v=String(e[k]||d);if(!/^\d+$/.test(v)||Number(v)<1024||Number(v)>65535)throw Error(`invalid port: ${k}`);return Number(v)}
export function preflight(e){
 if(e.EVERLIGHT_CORE_ADAPTER!=='v8'||!e.EVERLIGHT_CORE_DB||!e.EVERLIGHT_UI_DB||!e.EVERLIGHT_BOUND_SCOPE||e.EVERLIGHT_UI_SCOPE!==e.EVERLIGHT_BOUND_SCOPE)throw Error('isolated trial configuration required');
 if(!(e.EVERLIGHT_UI_TOKEN?.length>=16))throw Error('dashboard token required');
 const services=servicePlan(e),workers=workerPlan(e),ports={core:port(e,'EVERLIGHT_CORE_PORT',8790),dashboard:port(e,'PORT',8787)},dbs=[e.EVERLIGHT_CORE_DB,e.EVERLIGHT_UI_DB];
 if(e.EVERLIGHT_H6_SETTINGS_DB){if(!path.isAbsolute(e.EVERLIGHT_H6_SETTINGS_DB))throw Error('settings database must be absolute');dbs.push(e.EVERLIGHT_H6_SETTINGS_DB)}
 if(e.EVERLIGHT_TRIAL_D14==='1'){ports.d14=port(e,'EVERLIGHT_D14_PORT',8796);dbs.push(e.EVERLIGHT_D14_DB)}
 if(e.EVERLIGHT_TRIAL_VECTOR==='1'){ports.vector=port(e,'EVERLIGHT_VECTOR_PORT',8793);dbs.push(e.EVERLIGHT_VECTOR_DB)}
 if(e.EVERLIGHT_TRIAL_GATEWAY==='1')ports.gateway=port(e,'EVERLIGHT_GATEWAY_PORT',8792);
 if(new Set(Object.values(ports)).size!==Object.keys(ports).length)throw Error('service ports must be distinct');
 if(e.EVERLIGHT_CORE_URL!==`http://127.0.0.1:${ports.core}`)throw Error('core URL must match isolated core port');
 const ids=dbs.map(identity);for(let i=0;i<ids.length;i++)for(let j=0;j<i;j++)if(ids[i].real===ids[j].real||(ids[i].inode&&ids[i].inode===ids[j].inode))throw Error('database files must be distinct');
 if(ports.gateway){const u=new URL(e.EVERLIGHT_UPSTREAM_URL);if(['127.0.0.1','localhost','[::1]','0.0.0.0'].includes(u.hostname)&&Object.values(ports).includes(Number(u.port||(u.protocol==='https:'?443:80))))throw Error('upstream points to an Everlight service port');}
 const warnings=[];if(!(e.EVERLIGHT_HOST_TOKEN?.length>=20))warnings.push('dashboard host media callbacks unavailable: missing host token');
 return {state:'configuration_valid',production_approved:false,ports,services,workers,warnings};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(preflight(process.env),null,2))}catch(e){console.error(e.message);process.exitCode=1}}
