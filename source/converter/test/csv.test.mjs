import test from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';import {readCsv} from '../src/csv.mjs';
async function parse(s){const out=[];for await(const r of readCsv(Readable.from([...Buffer.from(s)].map(b=>Buffer.from([b])))))out.push(r);return out;}
test('CSV preserves Unicode, multiline, commas and escaped quotes across byte boundaries',async()=>{assert.deepEqual(await parse('\uFEFFactor,text\r\nu,"你好,\r\n""世界"""\r\n'),[{actor:'u',text:'你好,\r\n"世界"'}]);});
test('CSV rejects malformed rows and duplicate headers',async()=>{for(const s of ['a,a\n1,2','a,b\n1','a\n"bad','a\n"x"y'])await assert.rejects(parse(s));});
