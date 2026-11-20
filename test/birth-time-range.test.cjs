'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {Solar,LunarUtil}=require('lunar-javascript');
const clock=require('../lib/birth-time-range');
const seohwa=require('../lib/seohwa-reading-core');
const annual=require('../lib/newyear-calculation');
const consultation=require('../lib/consultation-calculation');

const birth={y:1990,m:1,d:1,calType:'solar',gender:'female'};
test('thirteen non-overlapping ranges cover the entire Korean civil day and report the selected branch',()=>{
  assert.equal(clock.ranges.length,13);
  assert.deepEqual(clock.ranges.flatMap(range=>Array.from({length:range.to-range.from+1},(_,i)=>range.from+i)),Array.from({length:1440},(_,i)=>i));
  assert.equal(clock.ranges[0].label,'조자시 (00:00 ~ 01:29)');
  assert.equal(clock.ranges[4].label,'진시 (07:30 ~ 09:29)');
  assert.equal(clock.ranges[12].label,'야자시 (23:30 ~ 23:59)');
  for(const [index,range] of clock.ranges.entries()){
    const profile={...birth,hourValue:range.value};
    assert.deepEqual(clock.samples(range.value),[range.from,range.to]);
    assert.equal(annual.normalizeProfile(profile).hourValue,range.value);
    const result=annual.calculate(profile);
    assert.equal(result.pillars.hour[1],'子丑寅卯辰巳午未申酉戌亥子'[index]);
    assert.equal(result.daewoon,null);
    assert.equal(consultation.build({sajuProfile:profile,message:'연애가 궁금해요.'}).charts[0].candidates[0].pillars.hour.ganZhi,result.pillars.hour);
    const context=seohwa.timeSlots('1990-01-01',range.value,Solar,LunarUtil);
    assert.equal(context.known,true);
    assert.equal(context.day,result.pillars.day);
  }
});

test('saved numeric hours still retain the original calculation and unknown time omits the hour pillar',()=>{
  assert.deepEqual(clock.samples('8'),[480,539]);
  assert.equal(annual.normalizeProfile({...birth,hourValue:'08'}).hourValue,'8');
  assert.equal(annual.calculate({...birth,hourValue:'8'}).pillars.hour[1],'辰');
  assert.equal(annual.calculate({...birth,hourValue:'unknown'}).pillars.hour,undefined);
  assert.throws(()=>annual.normalizeProfile({...birth,hourValue:'range-13'}),{code:'NEWYEAR_PROFILE_REQUIRED'});
});
