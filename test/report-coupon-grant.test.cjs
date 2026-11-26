'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {reports}=require('../lib/seohwa-report');
const date=require('../lib/date-report');
const relationship=require('../lib/relationship-report');
const {NOTICE_VERSION}=require('../lib/ai-transfer-consent');
const {recoveryChapters}=require('../lib/wealth-chapter-recovery');

const story={profile:{y:1990,m:1,d:1,calType:'solar',hourValue:'unknown',gender:'unknown'},choice:0};
const dates={event:'결혼식',mine:'화',partner:'목',days:['2027-05-15','2027-05-16']};
const pair={first:0,second:4};
const consent={aiTransferConsent:{version:NOTICE_VERSION,state:'granted',revision:1}};

function fixture(){
  const rows=new Map([['users/member',consent],['users/other',consent],['siteSettings/checkout',{enabled:true}]]);
  let queue=Promise.resolve();
  const collection=path=>({doc(id){
    const key=path+'/'+id;
    return {key,id,collection:name=>collection(key+'/'+name),async get(){return {id,exists:rows.has(key),data:()=>rows.get(key)};}};
  }});
  const db={collection,runTransaction(fn){
    const task=queue.then(async()=>{
      const writes=[];
      const result=await fn({get(ref){assert.equal(writes.length,0);return ref.get();},
        create(ref,data){assert(!rows.has(ref.key));writes.push([ref.key,data]);},
        set(ref,data){writes.push([ref.key,data]);},update(ref,data){assert(rows.has(ref.key));writes.push([ref.key,{...rows.get(ref.key),...data}]);}});
      for(const [key,data] of writes)rows.set(key,data);
      return result;
    });
    queue=task.catch(()=>{});
    return task;
  }};
  function add(product,owner='member',until=Date.now()+3600000){
    const id=randomUUID(),key='users/'+owner+'/reportCouponPasses/'+id;
    rows.set(key,{product,state:'available',reportExpiresAt:new Date(until)});
    return {id,read:()=>rows.get(key)};
  }
  return {rows,db,add};
}

test('a redeemed wealth coupon can finish, reopen and resume after an invalid chapter without a second grant or AI call',async()=>{
  const {db,rows,add}=fixture(), service=reports.get('dogyeom');
  const coupon=add(service.CONFIG.product), unused=add(service.CONFIG.product);
  const comparison={...story};
  const opened=await service.run(db,'member',{operation:'coupon-open',passId:coupon.id,comparison});
  const key='users/member/'+service.CONFIG.collection+'/'+opened.id;
  const record=rows.get(key);
  record.attempts=2;
  record.attemptWindow=Math.floor(Date.now()/3600000);
  let calls=0;
  const options={env:{ANTHROPIC_API_KEY:'unit-test'},fetchImpl:async(url,opts)=>{
    calls++;
    const request=JSON.parse(opts.body),input=JSON.parse(request.messages[0].content);
    const seed=record.report;
    const chapters=recoveryChapters(seed.calendar,input.chapterPlan,[...seed.context.readings,...seed.context.supportingReadings||[]]);
    chapters[0].highlight='원국의 흐름을 연운과 함께 읽어 볼 때예요.';
    chapters[1].paragraphs[1]='확인되지 않은 99월을 실제처럼 적었어요.';
    return {ok:true,json:async()=>({model:'fixture',stop_reason:'tool_use',content:[{type:'tool_use',name:request.tools[0].name,input:{chapters}}]})};
  }};
  const ready=await service.generate(db,'member',opened.id,options);
  assert.equal(ready.state,'ready');
  assert.equal(ready.report.body.length,5);
  assert.equal(ready.report.body[0].highlight,'원국의 흐름을 연운과 함께 읽어 볼 때예요.');
  assert(!JSON.stringify(ready.report.body).includes('99월'));
  assert.deepEqual(rows.get(key).report.generation.recoveredChapters,[3]);
  assert.equal(ready.questionsLeft,3);
  assert.equal(coupon.read().reportId,opened.id);
  assert.equal(unused.read().state,'available');
  assert.deepEqual((await service.generate(db,'member',opened.id,options)).report.body,ready.report.body);
  assert.equal(calls,1);
});

test('calculated recovery chapters satisfy the same paid-report checks for different charts and unknown birth times',()=>{
  const service=reports.get('dogyeom'),signatures=new Set();
  for(let i=0;i<72;i++){
    const seed=service.calculate({profile:{...story.profile,y:1960+i%45,m:i%12+1,d:i%27+1,
      hourValue:i%3?String(i%24):'unknown',gender:i%2?'female':'male'},choice:0});
    const evidence=[...seed.context.readings,...seed.context.supportingReadings||[]];
    const plan=Array.from({length:5},(_,n)=>({title:'chapter '+n,requiredBasis:evidence[n%evidence.length].id}));
    const chapters=recoveryChapters(seed.calendar,plan,evidence);
    const body=service.checked({chapters},evidence,plan,seed.calendar);
    assert.equal(body.length,5);
    assert(body[2].highlight.startsWith(seed.calendar.ranking.opportunity[0]+'월'));
    assert(body[3].highlight.startsWith(seed.calendar.ranking.expense[0]+'월'));
    signatures.add(body.map(ch=>ch.highlight).join('|'));
  }
  assert(signatures.size>30);
});

test('all four story reports, relationship and date use the same entitlement as a normal report, without a payment row',async()=>{
  for(const [service,comparison,isStory] of [...Array.from(reports.values(),service=>[service,story,true]),[date,dates,false],[relationship,pair,false]]){
    const {rows,db,add}=fixture(),pass=add(service.CONFIG.product),other=add(service.CONFIG.product);
    const prepare=await service.run(db,'member',{operation:'prepare',comparison});
    assert.equal(prepare.state,'available');
    assert.equal(pass.read().state,'available');
    const opened=await service.run(db,'member',{operation:'coupon-open',passId:pass.id,comparison});
    assert.equal(opened.state,isStory?'paid':'ready');
    assert.equal(pass.read().reportId,opened.id);
    const saved=rows.get('users/member/'+service.CONFIG.collection+'/'+opened.id);
    assert.equal(saved.couponGrantId,pass.id);
    assert.equal(saved.paidOrderId,undefined);
    assert.equal(+saved.reportExpiresAt,+pass.read().reportExpiresAt);
    assert.equal((await service.run(db,'member',{operation:'open',id:opened.id})).state,opened.state);
    assert.equal((await service.run(db,'member',{operation:'coupon-open',passId:other.id,comparison})).id,opened.id);
    assert.equal(other.read().state,'available');
    if(isStory){
      saved.report.body=[{}];
      const reserve=()=>db.runTransaction(tx=>service.reserve(db,tx,'member',opened.id,null,{}));
      let latest;
      for(let n=2;n>=0;n--){latest=await reserve();assert.equal(latest.reportQuestionsLeft,n);assert.equal(latest.couponGrantId,pass.id);}
      await assert.rejects(reserve(),/3회/);
      await service.rollback(db,'member',{...latest,couponGrantId:randomUUID()});
      await assert.rejects(reserve(),/3회/);
      await service.rollback(db,'member',latest);
      assert.equal((await reserve()).reportQuestionsLeft,0);
    }
    assert.equal([...rows.keys()].some(key=>key.startsWith('paymentOrders/')||key.startsWith('stats/')),false);
  }
});

test('simultaneous openings, other users, wrong products, expired coupons and existing orders are handled without duplicate grants',async()=>{
  const {db,rows,add}=fixture();
  const open=(pass,comparison=pair)=>relationship.run(db,'member',{operation:'coupon-open',passId:pass.id,comparison});
  for(const pass of [add(date.PRODUCT),add(relationship.CONFIG.product,'other'),add(relationship.CONFIG.product,'member',Date.now()-1)]){
    await assert.rejects(open(pass),{code:'REPORT_COUPON_UNAVAILABLE'});
    assert.equal(pass.read().state,'available');
  }
  const one=add(relationship.CONFIG.product);
  const both=await Promise.allSettled([open(one,pair),open(one,{...pair,second:5})]);
  assert.equal(both.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(both.filter(r=>r.reason?.code==='REPORT_COUPON_UNAVAILABLE').length,1);
  const next=add(relationship.CONFIG.product),input={...pair,second:9};
  const pending=await relationship.run(db,'member',{operation:'prepare',comparison:input,checkout:true,expectedPrice:relationship.CONFIG.price});
  const order=rows.get('paymentOrders/'+pending.orderId),saved=rows.get('users/member/'+relationship.CONFIG.collection+'/'+pending.id);
  await assert.rejects(open(next,input),{code:'REPORT_PAYMENT_IN_PROGRESS'});
  assert.equal(next.read().state,'available');
  Object.assign(order,{status:'paid',pay_state:4,mul_no:'confirmed',entitlementGranted:true});
  Object.assign(saved,{ready:true,state:'ready',paidOrderId:pending.orderId});
  assert.equal((await open(next,input)).id,pending.id);
  assert.equal(next.read().state,'available');
  assert.equal(saved.paidOrderId,pending.orderId);
});
