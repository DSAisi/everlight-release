import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'everlight-v7-'));
const port=19387,base=`http://127.0.0.1:${port}`,token='ui-long-secret-for-photo-atelier-v7';
const img=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlL45UAAAAASUVORK5CYII=','base64');
const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),EVERLIGHT_UI_DB:path.join(tmp,'demo.db'),EVERLIGHT_UI_TOKEN:token,EVERLIGHT_HOST_TOKEN:'host-long-secret-for-test-v7'},stdio:'pipe'});
let cookie='';async function run(p,method='GET',body,headers={}){const r=await fetch(base+p,{method,body,headers:{cookie,...headers}});const b=await r.json().catch(()=>({}));return {code:r.status,body:b}}
async function ready(){for(let i=0;i<65;i++){try{if((await fetch(base+'/ui/api/v1/status')).ok)return}catch{}await new Promise(r=>setTimeout(r,75))}throw Error('server timeout')}
test('照片墙元数据、相册、搜索、分页、收藏与版本冲突',async t=>{t.after(()=>{child.kill();fs.rmSync(tmp,{force:true,recursive:true})});await ready();const login=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});cookie=login.headers.get('set-cookie').split(';')[0];assert.equal(login.status,200);
 const upload=async title=>{const r=await run('/ui/api/v1/media/upload','POST',img,{'Content-Type':'application/octet-stream','x-everlight-source-kind':'manual','x-everlight-title':encodeURIComponent(title)});assert.equal(r.code,201);return r.body.item};
 const p1=await upload('海边和日落'),p2=await upload('窗边的信'); // same asset: different source
 assert.equal((await run('/ui/api/v1/media/summary')).body.total,2);
 const f=await run('/ui/api/v1/media/items/'+p1.id,'PATCH',JSON.stringify({expectedRevision:1,favorite:true,album:'日落时刻',tags:['海边','日落'],note:'一起看日落'}),{'Content-Type':'application/json'});assert.equal(f.code,200,JSON.stringify(f.body));assert.equal(f.body.item.album,'日落时刻');assert.equal(f.body.item.favorite,true);assert.deepEqual(f.body.item.tags,['海边','日落']);
 assert.equal((await run('/ui/api/v1/media/summary')).body.favorite,1);
 const albums=(await run('/ui/api/v1/media/albums')).body.items;assert(albums.some(x=>x.name==='日落时刻'&&x.count===1&&x.coverUrl));
 const search=await run('/ui/api/v1/media/items?limit=1&offset=0&q=%E6%B5%B7%E8%BE%B9');assert.equal(search.code,200,JSON.stringify(search.body));assert.equal(search.body.total,1);assert.equal(search.body.items[0].id,p1.id);
 const onlyAlbum=await run('/ui/api/v1/media/items?album=%E6%97%A5%E8%90%BD%E6%97%B6%E5%88%BB');assert.equal(onlyAlbum.body.total,1);
 const fav=await run('/ui/api/v1/media/items?favorites=1');assert.equal(fav.body.total,1);
 const page=await run('/ui/api/v1/media/items?limit=1&offset=0');assert.equal(page.body.total,2);assert.equal(page.body.hasMore,true);
 const page2=await run('/ui/api/v1/media/items?limit=1&offset=1');assert.equal(page2.body.items.length,1);assert.equal(page2.body.hasMore,false);
 const conflict=await run('/ui/api/v1/media/items/'+p1.id,'PATCH',JSON.stringify({expectedRevision:1,favorite:false}),{'Content-Type':'application/json'});assert.equal(conflict.code,409);
 const invalid=await run('/ui/api/v1/media/items/'+p1.id,'PATCH',JSON.stringify({expectedRevision:2,album:'a'.repeat(80)}),{'Content-Type':'application/json'});assert.equal(invalid.code,422);
});
