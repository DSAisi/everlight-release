import {test} from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import path from 'node:path';import {tmpdir} from 'node:os';
test('trial init generates a distinct dashboard host token; no overwrite',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'everlight-init-h6-'));try{
 execFileSync(process.execPath,[new URL('../scripts/init.mjs',import.meta.url).pathname,dir]);
 const env=Object.fromEntries(readFileSync(path.join(dir,'trial.env'),'utf8').trim().split('\n').map(l=>{const i=l.indexOf('=');return [l.slice(0,i),JSON.parse(l.slice(i+1))]}));
 const keys=['EVERLIGHT_HOST_TOKEN','EVERLIGHT_SHARED_HOST_TOKEN','EVERLIGHT_UI_TOKEN','EVERLIGHT_CORE_TOKEN'];assert.ok(keys.every(k=>env[k]?.length>=32));assert.equal(new Set(keys.map(k=>env[k])).size,keys.length);
 assert.throws(()=>execFileSync(process.execPath,[new URL('../scripts/init.mjs',import.meta.url).pathname,dir],{stdio:'pipe'}));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
