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

test('existing home sale gets its own month and follows short questions without granting annual access',()=>{
 const message='집을 이사하고 싶은데 기존집이 매매가 될까요';
 const first=build(1,message).movingWindow,other=build(4,message).movingWindow;
 assert.equal(first.rule,'home-sale-month-v1');
 assert.notEqual(first.from,other.from);
 assert.match(moving.describeSale(first),/기존 집 매매는 \*\*2026년 12월\*\*/);
 assert.match(moving.describeSale(other),/기존 집 매매는 \*\*2027년 2월\*\*/);
 assert.equal(build(1,'집을 팔고 몇 월에 이사하는 게 좋아요?').movingWindow.rule,'moving-month-liuhe-v1');
 const history=[{role:'user',content:'내년에 우리 집을 팔려고요.'}];
 assert.equal(build(1,'그럼 몇 월이 좋을까요?',history).movingWindow.from,build(1,'내년에 아파트가 몇 월에 팔릴까요?').movingWindow.from);
 assert(!access.isNewyearRequest('2027년 아파트 팔릴 달이 언제예요?'));
 assert(access.isNewyearRequest('2027년 아파트 매매와 1년 전체 사주 풀이'));
 assert(access.isNewyearRequest('2027년 집 팔릴 달과 주식 투자 수익도 알려줘'));
 assert(access.isNewyearRequest('2027년 집 팔릴 달',[],'newyear'));
 assert.equal(build(1,'투자용 아파트를 몇 월에 매도할까요?').movingWindow,undefined);
 assert.equal(build(1,'아파트 매도일 2027년 5월 2일과 6일 비교').movingWindow,undefined);
});

test('sale answer keeps the calculated month when model output cannot be used',async()=>{
 const service=require('../lib/consultation-service'), message='기존 집이 내년 몇 월에 잘 팔릴까요?';
 const answer=await service.generate({body:{sajuProfile:profile(4),message},annualAllowed:false,consultantId:'yeonwoo',
  scope:'일반',now,model:'fixture',key:'fixture',providerEnv:{},fetchImpl:async()=>({
   ok:true,json:async()=>({stop_reason:'tool_use',content:[{type:'tool_use',name:'write_consultation',input:{}}]})
  })});
 assert.match(answer.reply,/^기존 집 매매는 \*\*2027년 2월\*\*/);
 assert.equal(answer.stopReason,'server_home_sale_month');
 assert.match(answer.evidence[0].value,/2027-02-05 ~ 2027-03-05/);
 assert.equal(answer.reply.slice(answer.movingPrefix.length),'');
});
