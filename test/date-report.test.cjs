'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, calculate } = require('../lib/date-report');
const comparison = {
  event:'결혼식',mine:'화',partner:'목',days:['2027-05-15','2027-05-16','2027-05-22','2027-05-23','2027-05-29']
};

test('candidate report ranks the actual days with the established baseline and breaks down the scores',()=>{
  const report=calculate(validate(comparison));
  assert.equal(report.candidates.length,5);
  assert.equal(report.withPartner,true);
  const first=report.candidates.find(candidate=>candidate.day==='2027-05-15');
  const second=report.candidates.find(candidate=>candidate.day==='2027-05-16');
  assert.equal(first.ganji,'갑오');
  assert.equal(first.points,93);
  assert.equal(first.folkWeight,0.8);
  assert.equal(second.ganji,'을미');
  assert.equal(second.points,80);
  assert.equal(first.people.length,2);
  assert.equal(calculate(validate({...comparison,event:'이사'})).candidates.find(x=>x.day===first.day).folkWeight,2);
  assert(report.candidates.every((x,i,all)=>!i||all[i-1].points>=x.points));
});
test('date comparison rejects invalid, duplicate and out-of-range input before purchase creation',()=>{
  for (const change of [
    {event:'unknown'},{mine:'잘못된 값'},{partner:'잘못된 값'},{days:['2027-02-29','2027-05-10']},
    {days:['1899-01-01','2027-05-10']},{days:['2027-05-15','2027-05-15']},{days:['2027-05-15']}
  ]) {
    assert.throws(()=>validate({...comparison,...change}),{code:'INVALID_COMPARISON'});
  }
  assert.deepEqual(validate({...comparison,days:[...comparison.days].reverse()}),validate(comparison));
});
