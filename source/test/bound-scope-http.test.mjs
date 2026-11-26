import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const token='c'.repeat(32),host='h'.repeat(32);
async function wait(port){for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/v8/status`,{headers:{authorization:`Bearer ${token}`}});if(r.status===200)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('core did not start')}
test('bound scope prevents implicit personal fallback and scopes dream advancement',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'everlight-scope-http-'));
 const port=22000+Math.floor(Math.random()*10000);
 const child=spawn(process.execPath,['core/server.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,EVERLIGHT_CORE_PORT:String(port),EVERLIGHT_CORE_TOKEN:token,EVERLIGHT_SHARED_HOST_TOKEN:host,EVERLIGHT_BOUND_SCOPE:'tenant-a',EVERLIGHT_CORE_DB:join(dir,'db.sqlite')},stdio:'ignore'});
 try{
  await wait(port);
  const headers={authorization:`Bearer ${token}`};
  const status=await fetch(`http://127.0.0.1:${port}/api/v8/status`,{headers});
  assert.equal(status.status,200);
  assert.equal((await status.json()).scope,'tenant-a');
  const wrong=await fetch(`http://127.0.0.1:${port}/api/v8/status?scope=personal`,{headers});
  assert.equal(wrong.status,403);
  const postHeaders={...headers,'x-everlight-host-token':host,'content-type':'application/json'};
  const src=await fetch(`http://127.0.0.1:${port}/api/v8/source`,{method:'POST',headers:postHeaders,body:JSON.stringify({actor:'human',kind:'message',source_ref:'test',body:{text:'hi'}})});
  assert.equal(src.status,200);
  assert.ok((await src.json()).id);
  const db=new DatabaseSync(join(dir,'db.sqlite'));
  assert.equal(db.prepare('SELECT scope FROM sources LIMIT 1').get().scope,'tenant-a');db.close();
  const blocked=await fetch(`http://127.0.0.1:${port}/api/v8/dream/advance`,{method:'POST',headers:postHeaders,body:JSON.stringify({id:'some-id'})});
  assert.equal(blocked.status,404);
  const post=async(path,body)=>fetch(`http://127.0.0.1:${port}/api/v8/dream/${path}`,{method:'POST',headers:postHeaders,body:JSON.stringify(body)});
  const started=await post('start',{});assert.equal(started.status,200);const job=await started.json();
  const advanced=await post('advance',{id:job.id});assert.equal(advanced.status,200);assert.equal((await advanced.json()).stage,1);
  assert.equal((await post('advance',{id:job.id,scope:'personal'})).status,403);
  const wrongPost=await fetch(`http://127.0.0.1:${port}/api/v8/source`,{method:'POST',headers:postHeaders,body:JSON.stringify({scope:'personal',actor:'human',kind:'message',source_ref:'test2',body:{text:'hi'}})});
  assert.equal(wrongPost.status,403);
 }finally{child.kill('SIGTERM');rmSync(dir,{recursive:true,force:true})}
});
