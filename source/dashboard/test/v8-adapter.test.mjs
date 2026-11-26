import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('v8 adapter is opt-in and never forwards browser credentials',()=>{
 assert.match(server,/EVERLIGHT_CORE_ADAPTER==='v8'/);
 assert.match(server,/authorization:'Bearer '\+CORE_TOKEN/);
 assert.match(server,/if\(req.method!=='GET'\)throw bad\(405/);
 assert.match(server,/EVERLIGHT_UI_SCOPE/);
});
test('v8 library navigation uses actual cursor instead of fake total',()=>{
 assert.match(app,/d\.pagination==='cursor'/);
 assert.match(app,/d\.next_cursor/);
 assert.match(app,/本页记忆 · 游标分页/);
});
