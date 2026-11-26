// Explicitly configure the public GitHub release metadata source; no credentials/network.
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
const repo=process.argv[2],channel=process.argv[3]||'beta',auto=process.argv.includes('--auto');
if(!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(repo||'')||/\/\.{1,2}$/.test(repo)||!['beta','stable'].includes(channel))throw Error('Usage: npm run beta:release-config -- OWNER/REPO beta [--auto]');
const dir=path.resolve(import.meta.dirname,'../trial-beta'),file=path.join(dir,'trial.env');
if(await fs.realpath(dir)!==dir)throw Error('Invalid trial directory');
const s=await fs.lstat(file);if(!s.isFile()||s.nlink!==1||(s.mode&0o077))throw Error('Unsafe config');
const original=await fs.readFile(file,'utf8'),e=parseEnv(original);
if(e.EVERLIGHT_CORE_DB!==path.join(dir,'core.sqlite')||e.EVERLIGHT_BOUND_SCOPE!=='personal')throw Error('Only isolated trial configuration allowed');
const keys=['EVERLIGHT_UPDATE_REPO','EVERLIGHT_UPDATE_CHANNEL','EVERLIGHT_UPDATE_AUTO'];
const out=original.split(/\r?\n/).filter(l=>!keys.some(k=>new RegExp('^\\s*(?:export\\s+)?'+k+'\\s*=').test(l))).join('\n').trimEnd()+'\n'+keys.map((k,i)=>`${k}=${JSON.stringify([repo,channel,auto?'1':'0'][i])}`).join('\n')+'\n';
const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';try{await fs.writeFile(tmp,out,{mode:0o600,flag:'wx'});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}
console.log(JSON.stringify({repository:repo,channel,auto_check:auto,restart_required:true,install_enabled:false}));
