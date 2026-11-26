import test from 'node:test';
import assert from 'node:assert/strict';
import {waitReady} from '../scripts/readiness.mjs';
test('readiness retries failed probes before success',async()=>{let n=0;await waitReady(async()=>{if(++n===1)throw Error('not listening');return n===3},{interval:1,timeout:1000});assert.equal(n,3)});
test('readiness fails on timeout and cancellation',async()=>{await assert.rejects(waitReady(async()=>false,{timeout:15,interval:1}));await assert.rejects(waitReady(async()=>true,{stopped:()=>true}));});
