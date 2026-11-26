import test from 'node:test';import assert from 'node:assert/strict';
import {drainOnce} from '../automation/write-worker.mjs';
test('portable worker sends authenticated drain and never commits',async()=>{
 let called=false;const result=await drainOnce({baseUrl:'http://127.0.0.1:8790',token:'core-secret',hostToken:'host-secret',fetchImpl:async(url,options)=>{
  called=true;assert.equal(url.pathname,'/api/v8/write/drain');assert.equal(options.headers['x-everlight-host-token'],'host-secret');assert.deepEqual(JSON.parse(options.body),{scope:'personal',limit:25});return {ok:true,json:async()=>({results:[],auto_committed:false})};}});
 assert.ok(called);assert.equal(result.auto_committed,false);
});
test('worker rejects invalid scope and malformed response',async()=>{
 await assert.rejects(drainOnce({baseUrl:'http://localhost:8790',token:'a',hostToken:'b',scope:'../../private'}),/scope/);
 await assert.rejects(drainOnce({baseUrl:'http://localhost:8790',token:'a',hostToken:'b',fetchImpl:async()=>({ok:true,json:async()=>({results:[],auto_committed:true})})}),/invalid drain response/);
});
