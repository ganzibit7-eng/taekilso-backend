'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calculate,validate}=require('../lib/relationship-report');
const {dayIndex}=require('../lib/consultation-calculation');

test('relationship report uses the existing day calculation and different pairs get different grounded examples',()=>{
 const sample=calculate(validate({first:dayIndex('1990-01-01'),second:dayIndex('1992-04-18')}));
 assert.deepEqual(sample.people.map(p=>p.hanja),['丙寅','甲子']);
 assert.equal(sample.evidence[0].relation,'상생');
 assert.match(sample.evidence[0].detail,/상대방의 목에서 본인의 화/);
 assert.equal(sample.evidence[1].relation,'상생');
 assert.equal(sample.strengths.length,2);
 assert.equal(sample.friction.length,2);
 assert(sample.conversations.every(scene=>scene.first.length>15&&scene.second.length>15));
 const inverted=calculate(validate({first:dayIndex('1992-04-18'),second:dayIndex('1990-01-01')}));
 assert.match(inverted.evidence[0].detail,/본인의 목에서 상대방의 화/);
 assert.equal(inverted.conversations[1].first,sample.conversations[1].second);
 assert.notDeepEqual(calculate({first:0,second:4}).conversations,sample.conversations);
});
test('relationship report rejects raw or invalid day inputs and strips personal fields from its canonical request',()=>{
 for(const input of [null,{}, {first:-1,second:0},{first:0,second:60},{first:1,second:'2'}, {first:1.3,second:2}]) {
  assert.throws(()=>validate(input),{code:'INVALID_RELATIONSHIP'});
 }
 assert.deepEqual(validate({first:2,second:2,birthDate:'1990-01-01',name:'fixture'}),{first:2,second:2});
 for(let first=0;first<60;first++)for(let second=0;second<60;second++) {
  const report=calculate({first,second});
  assert(report.people.every(p=>p.day.length===2&&p.stem&&p.branch));
  assert(report.evidence.every(p=>p.detail.length>10));
  assert(!Object.hasOwn(report,'birthDate'));
 }
});
