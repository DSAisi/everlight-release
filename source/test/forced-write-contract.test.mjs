import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const spec=JSON.parse(readFileSync(new URL('../contracts/FORCED_WRITE_FLOW.json',import.meta.url),'utf8'));
const server=readFileSync(new URL('../core/server.mjs',import.meta.url),'utf8');
test('mandatory write contract matches live routes and required payload',()=>{
 assert.equal(spec.production_approved,false);
 for(const route of spec.forced_sequence){const [method,path]=route.split(' ');assert.ok(server.includes(`'${method} ${path}':`),route)}
 for(const [op,fields] of Object.entries(spec.requirements))assert.ok(fields.includes('scope'),op);
 assert.ok(server.includes('hostToken.length<24'));
 for(const route of spec.legacy_routes_return_410)assert.ok(server.includes(`'${route}':`));
});
test('top-level user-facing docs cannot prescribe dead review/commit endpoints',()=>{
 const names=readdirSync(root).filter(x=>x.endsWith('.md')&&!x.startsWith('v11.'));
 for(const name of names){const content=readFileSync(new URL('../'+name,import.meta.url),'utf8');
 assert.doesNotMatch(content,/\/api\/v8\/(?:review|commit)(?!\/scoped)(?:[\s`"'},{]|$)/,name)}
});
