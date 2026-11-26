import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto as crypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../dashboard/night.js',import.meta.url),'utf8');
const te=new TextEncoder(),salt=crypto.getRandomValues(new Uint8Array(16)),password='test-password-123';
const b64=x=>Buffer.from(x).toString('base64');
async function envelope(key,data){const iv=crypto.getRandomValues(new Uint8Array(12));return {v:1,iv:b64(iv),cipher:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,te.encode(JSON.stringify(data))))};}
async function fixture(){
 const root=await crypto.subtle.importKey('raw',te.encode(password),'PBKDF2',false,['deriveKey']);
 const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},root,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const config={configured:true,salt:b64(salt),rounds:250000,proof:await envelope(key,{proof:'EVERLIGHT-NIGHT-PROOF/v1'})};
 const entries=[{id:'one',revision:1,envelope:await envelope(key,{title:'PRIVATE TEST MARKER',note:'synthetic',reality:'fiction'})}];
 const listeners={},errors=[];let paused=false,release,requestSeen;
 const screen={textContent:'PRIVATE TEST MARKER',replaceChildren(){this.textContent=''},querySelector(){return true}};
 const window={dispatchEvent(){},EverlightDialog:{dismiss(){},alert(e){errors.push(e)}}};
 const context={window,TextEncoder,TextDecoder,crypto,isSecureContext:true,btoa,atob,Event,Uint8Array,location:{hash:'#/night',href:'https://test.local/',origin:'https://test.local'},URL,URLSearchParams,document:{querySelector:()=>screen,addEventListener:(n,f)=>listeners[n]=f},EverlightDialog:window.EverlightDialog,FormData:class{get(n){return n==='password'?password:null}},fetch:async url=>{url=new URL(url,'https://test.local').searchParams.get('route')||url;if(url.endsWith('/entries')&&paused){requestSeen?.();await new Promise(r=>release=r)}return {ok:true,json:async()=>url.endsWith('/status')?config:{items:entries}}}};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../dashboard/unified-client.js',import.meta.url),'utf8'),context);vm.runInContext(code,context);const night=window.EverlightNight;
 const wait=async f=>{for(let i=0;i<200;i++){if(f())return;await new Promise(r=>setTimeout(r,10))}throw Error('timed out')};
 const unlock=async()=>{assert.match(await night.render('/night'),/en-unlock/);listeners.submit({target:{id:'en-unlock'},preventDefault(){}});await wait(()=>context.location.hash==='/night/list');};
 return {night,screen,context,unlock,errors,delay(){paused=true;return new Promise(r=>requestSeen=r)},resume(){paused=false;release()}};
}
test('RC2 real Web Crypto unlock, decrypt, same-route lock and delayed list invalidation',async()=>{
 const f=await fixture();await f.unlock();assert.match(await f.night.render('/night/list'),/PRIVATE TEST MARKER/);
 f.context.location.hash='#/night';const started=f.delay();const pending=f.night.render('/night');await started;f.night.lock();assert.doesNotMatch(f.screen.textContent,/PRIVATE TEST MARKER/);f.resume();const stale=await pending;assert.doesNotMatch(stale,/PRIVATE TEST MARKER/);assert.match(stale,/en-unlock/);assert.match(await f.night.render('/night'),/en-unlock/);
});
