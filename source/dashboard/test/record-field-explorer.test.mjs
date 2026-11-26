import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('detail retains existing API and displays actual payload fields',()=>{
 assert.match(js,/api\/detail\?slot=/);
 assert.match(js,/function recordFieldExplorer/);
 assert.match(js,/raw\.payload/);
 assert.match(js,/Object\.entries\(payload\|\|raw\)/);
});
test('source list is read-only and does not claim verification',()=>{
 assert.match(js,/function recordSourceExplorer/);
 assert.match(js,/存在引用不代表已经完成/);
 assert.match(js,/recordSourceExplorer\(d\)/);
 assert.match(js,/recordFieldExplorer\(d\)/);
});
