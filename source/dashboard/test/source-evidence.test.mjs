import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('detail uses existing real endpoint and read-only source completeness',()=>{assert.match(app,/api\/detail\?slot=/);assert.match(app,/function evidenceSummary\(d,s\)/);assert.match(app,/来源完整性 · 只读检查/);assert.match(app,/字段存在（未经来源真实性核验）/);});
test('missing source and time are visible, not fabricated',()=>{assert.match(app,/尚无可追溯来源引用/);assert.match(app,/尚无可信时间字段/);assert.match(app,/不代表来源已经授权/);});
test('existing library pagination and module routes preserved',()=>{assert.match(app,/function pagination\(/);for(const route of ['/audit','/relations','/night','/photos','/dreams','/tasks','/skins'])assert.ok(app.includes(route));});
