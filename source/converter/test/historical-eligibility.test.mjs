import test from 'node:test';import assert from 'node:assert/strict';import {autoHistoricalEligible as eligible} from '../src/bootstrap.mjs';
const now=Date.parse('2026-01-01T00:00:00Z'),past='2025-01-01T00:00:00Z',future='2027-01-01T00:00:00Z';
test('historical auto admission does not promote unresolved current state',()=>{
 for(const kind of ['procedure','code'])assert.equal(eligible({kind,payload:{}},now),true);
 for(const kind of ['fact','preference']){assert.ok(eligible({kind,payload:{temporal:{event_at:past,valid_until:past},evidence_status:'direct'}},now));assert.ok(!eligible({kind,payload:{temporal:{event_at:past},evidence_status:'direct'}},now));assert.ok(!eligible({kind,payload:{temporal:{event_at:past,valid_until:future},evidence_status:'direct'}},now));assert.ok(!eligible({kind,payload:{temporal:{event_at:past,valid_until:past},evidence_status:'inferred'}},now));}
 assert.ok(eligible({kind:'affect',payload:{observed_at:past,evidence_status:'direct'}},now));assert.ok(!eligible({kind:'affect',payload:{observed_at:past,evidence_status:'inferred'}},now));
 for(const kind of ['goal','identity','relationship','reflection','media','document'])assert.ok(!eligible({kind,payload:{happened_at:past}},now));
 assert.ok(eligible({kind:'reflection',payload:{verified_level:'guess'}},now));assert.ok(eligible({kind:'document',payload:{access_status:'received'}},now));
 assert.ok(!eligible({kind:'episode',payload:{happened_at:future}},now));
});
