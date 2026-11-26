import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('audit links require explicit canonical slot and memory id',()=>{
 assert.match(src,/function auditMemoryLink\(item\)/);
 assert.match(src,/SLOTS\.some\(s=>s\[0\]===slotId\)/);
 assert.match(src,/recordPath\(slotId,recordId\)/);
 assert.match(src,/未提供可核验的库号与记录 ID/);
});
test('audit detail still distinguishes request verification from planned recall',()=>{
 assert.match(src,/t\.actual_request_verified===true/);
 assert.match(src,/未发现真实模型请求读回证明/);
});
