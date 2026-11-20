'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const calc=require('../lib/consultation-calculation'),moving=require('../lib/moving-month'),access=require('../lib/newyear-access');
const now=new Date('2026-11-20T03:00:00Z');
const profile=d=>({y:1990,m:1,d,hourValue:'unknown',gender:'unknown',calType:'solar'});
const build=(d,message,history)=>calc.build({sajuProfile:profile(d),message,history},now);
test('same question selects the actual natal partner in different solar months, without annual data',()=>{
 for(const [d,from,to,pair] of [[1,'2027-11-09','2027-12-06','寅亥'],[3,'2027-09-09','2027-10-07','辰酉'],[10,'2027-02-05','2027-03-05','亥寅']]){
  const b=build(d,'내년 언제쯤이 이사하기 좋을까요?'),w=b.movingWindow;
  assert.deepEqual([w.from,w.to,w.natal+w.monthPillar[1],w.relation],[from,to,pair,'harmony']);
  assert(b.charts[0].facts.some(f=>f.id===w.factId));assert.deepEqual(b.periods,[]);
 }
});
test('constrains requested season and months and preserves date and subject boundaries',()=>{
 const q='이사 시기는 봄 중 몇 월이 좋을까요?',w=build(1,q).movingWindow;
 assert(w.from>='2027-03-01'&&w.to<='2027-05-31');assert.equal(w.relation,'neutral');
 const next=build(1,'다음 달 이사는 어때요?').movingWindow;assert(next.from>='2026-12-01'&&next.to<='2026-12-31');
 assert.equal(build(1,'이사 날짜 2027년 3월 7일과 10일 비교').movingWindow,undefined);
 const boundary=build(5,'내년 이사는 몇 월이 좋을까요?');assert(boundary.movingWindow.factId.includes('.common.'));
 assert(!calc.build({subjects:[{profile:profile(1)},{profile:profile(3)}],message:q},now).movingWindow);
});
test('bounded moving questions and general annual fortunes retain their distinct entitlements',()=>{
 for(const q of ['2027년 이사하기 좋은 달 추천해줘','내년 이사는 몇 월이 가장 좋을까요?','내년에는 몇 월에 이사하는 게 좋을까','집을 옮기고 싶은데 내년 몇 월이 나을까요?'])assert(!access.isNewyearRequest(q));
 for(const q of ['내년 이사 시기와 연애운','내년 이사와 12개월 월별 운세','2027년 투자 시기와 이사 시기'])assert(access.isNewyearRequest(q));
 assert(access.isNewyearRequest('내년 이사하기 좋은 달',[],'newyear'));
 assert(access.containsAnnualReading('2027년 이사하기 좋은 달'));
 assert(build(1,'그럼 몇 월이 좋을까요?',[{role:'user',content:'이사하고 싶어요'}]).movingWindow);
 assert.equal(build(1,'그럼 몇 월이 좋을까요?',[{role:'user',content:'내년에 이사하고 싶어요'}]).movingWindow.from,'2027-11-09');
 assert(!build(1,'그럼 몇 월이 좋을까요?',[{role:'user',content:'이사하고 싶어요'},{role:'user',content:'요즘 취업이 궁금해요'}]).movingWindow);
});
