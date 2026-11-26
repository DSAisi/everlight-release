import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
test('non-personal instance cannot access legacy local stores',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'everlight-scope-'));const token='isolated-test-token-123456';
 const child=spawn(process.execPath,[new URL('../server.mjs',import.meta.url).pathname],{env:{...process.env,PORT:'19649',EVERLIGHT_UI_DB:join(dir,'ui.sqlite'),EVERLIGHT_UI_SCOPE:'other',EVERLIGHT_UI_TOKEN:token,EVERLIGHT_HOST_TOKEN:token,EVERLIGHT_DREAM_AUTO:'0'},stdio:'ignore'});
 const call=(p,method='GET')=>fetch('http://127.0.0.1:19649/ui/api/v1/'+p,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
 try{let ready=false;for(let i=0;i<60;i++){try{ready=(await call('health')).ok;if(ready)break}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);for(const p of ['tasks','dreams','vault/entries','media/settings','evidence','audit'])assert.equal((await call(p)).status,403,p);for(const p of ['tasks','dreams/request','host/evidence','host/task-sync'])assert.equal((await call(p,'POST')).status,403,p);}finally{if(child.exitCode===null){child.kill();await once(child,'exit')}rmSync(dir,{recursive:true,force:true});}
});
