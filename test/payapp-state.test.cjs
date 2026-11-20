const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const {hasPass}=require('../lib/newyear-access');
function fixture(options={}){const rows=new Map([['users/member',{premium:false}],['paymentOrders/TAK-TEST-ORDER',{uid:'member',product:'taekilso_premium_30days',amount:8900,status:'pending'}]]);let queue=Promise.resolve();
 function apply(old,value){if(value&&typeof value==='object'&&'increment'in value)return (Number(old)||0)+value.increment;if(value&&typeof value==='object'&&!Array.isArray(value)&&!(value instanceof Date)){const result={...old};for(const [k,v]of Object.entries(value))result[k]=apply(result[k],v);return result;}return value;}
 function put(key,value,merge=true){rows.set(key,apply(merge?rows.get(key):{},value));}
 const ref=key=>({id:key.split('/').at(-1),async get(){return {id:this.id,exists:rows.has(key),data:()=>rows.get(key)}},async set(v,o){put(key,v,o?.merge)},async update(v){put(key,v)},collection:name=>collection(key+'/'+name),key});
 const collection=col=>({doc:id=>ref(col+'/'+id),where(field,op,value){return {select(){return this},limit(){return this},orderBy(){return this},async get(){return {docs:[...rows].filter(([k,v])=>k.startsWith(col+'/')&&(op==='>'?v[field]>value:v[field]===value)).map(([k,v])=>({id:k.split('/').at(-1),data:()=>v}))}}}}});
 const db={collection,runTransaction(fn){const job=queue.then(()=>fn({get:r=>r.get(),set(r,v,o){put(r.key,v,o?.merge)},create(r,v){assert(!rows.has(r.key));put(r.key,v,false)},update(r,v){put(r.key,v)}}));queue=job.catch(()=>{});return job}};
 const admin={apps:[{}],firestore:()=>db};if(options.deleted)admin.auth=()=>({async getUser(){throw Object.assign(new Error('gone'),{code:'auth/user-not-found'})}});admin.firestore.FieldValue={increment:n=>({increment:n}),serverTimestamp:()=>Date.now()};
 const filename=path.resolve(__dirname,'../api/payapp-feedback.js'),realRequire=createRequire(filename),context={module:{exports:{}},require:n=>n==='firebase-admin'?admin:realRequire(n),process:{env:{PAYAPP_LINKVAL:'test-only'}},Buffer,console:{error(){},warn(){},log(){}}};vm.runInNewContext(fs.readFileSync(filename,'utf8'),context,{filename});
 async function notify(state,override={}){const r={setHeader(){},status(n){this.code=n;return this},send(v){this.body=v;return this}};await context.module.exports({method:'POST',body:{userid:'green5797',linkval:'test-only',var1:'TAK-TEST-ORDER',goodname:'2027 신년상담 · 30일 이용권',price:8900,pay_state:state,mul_no:'synthetic',...override}},r);return r;}
 Object.assign(context.process.env,options.env||{});
 return {rows,db,notify};}
test('request/wait notification followed by paid confirmation clears preliminary state and grants exactly once',async()=>{for(const initial of [1,10]){const f=fixture();await f.notify(initial);assert.equal(f.rows.get('paymentOrders/TAK-TEST-ORDER').lastPayState,initial);const r=await f.notify(4);assert.equal(r.body,'SUCCESS');const paid=f.rows.get('paymentOrders/TAK-TEST-ORDER'),member=f.rows.get('users/member');assert.equal(paid.status,'paid');assert.equal(paid.pay_state,4);assert.equal(paid.lastPayState,4);assert.equal(await hasPass(f.db,'member',member,false),true);const until=member.premiumUntil;await f.notify(4);assert.equal(f.rows.get('users/member').premiumUntil,until);assert.equal(f.rows.get('stats/counters').purchases,1);}});
test('cancellation after paid is not swallowed by idempotency and a stale request cannot unlock it again',async()=>{const f=fixture();await f.notify(4);await f.notify(9);assert.equal(f.rows.get('paymentOrders/TAK-TEST-ORDER').lastPayState,9);assert.equal(await hasPass(f.db,'member',f.rows.get('users/member'),false),false);await f.notify(1);await f.notify(4);assert.equal(f.rows.get('paymentOrders/TAK-TEST-ORDER').lastPayState,9);assert.equal(await hasPass(f.db,'member',f.rows.get('users/member'),false),false);});
test('invalid callback credential or price never grants a pass',async()=>{for(const override of [{linkval:'wrong'},{price:1}]){const f=fixture();await f.notify(4,override);assert.equal(f.rows.get('users/member').premium,false);assert.equal(f.rows.get('paymentOrders/TAK-TEST-ORDER').status,'pending');}});
test('cancel-before-paid is terminal and unauthenticated calls write nothing',async()=>{const f=fixture();const size=f.rows.size;await f.notify(4,{linkval:'wrong'});assert.equal(f.rows.size,size);await f.notify(9);await f.notify(4);assert.equal(f.rows.get('paymentOrders/TAK-TEST-ORDER').status,'cancelled');assert.equal(f.rows.get('users/member').premium,false);assert.equal(f.rows.has('stats/counters'),false);});
test('refund revokes premium and counters exactly once',async()=>{const f=fixture();await f.notify(4);await f.notify(9);await f.notify(9);const u=f.rows.get('users/member');assert.equal(u.premium,false);assert.equal(u.premiumUntil,0);assert.equal(f.rows.get('stats/counters').purchases,0);assert.equal(f.rows.get('stats/counters').revenue,0);});
test('product counters remain a nested map and refunds preserve other products',async()=>{const f=fixture();f.rows.set('stats/counters',{purchasesByProduct:{ai_question_pack_5:7}});await f.notify(4);let counters=f.rows.get('stats/counters');assert.equal(counters.purchasesByProduct.taekilso_premium_30days,1);assert.equal(counters.purchasesByProduct.ai_question_pack_5,7);assert.equal(Object.keys(counters).some(k=>k.startsWith('purchasesByProduct.')),false);await f.notify(9);counters=f.rows.get('stats/counters');assert.equal(counters.purchasesByProduct.taekilso_premium_30days,0);assert.equal(counters.purchasesByProduct.ai_question_pack_5,7);});
test('partial refund uses original amount and transaction identity, then full refund only reverses remainder',async()=>{const f=fixture();await f.notify(4);const partial={price:1900,orig_price:8900,orig_mul_no:'synthetic',mul_no:'partial-one'};await f.notify(70,{...partial,orig_mul_no:'other'});assert.equal(f.rows.get('users/member').premium,true);await f.notify(70,partial);await f.notify(70,partial);assert.equal(f.rows.get('paymentOrders/TAK-TEST-ORDER').refundedAmount,1900);assert.equal(f.rows.get('users/member').premium,false);assert.equal(f.rows.get('stats/counters').revenue,7000);await f.notify(9);assert.equal(f.rows.get('stats/counters').revenue,0);assert.equal(f.rows.get('stats/counters').purchases,0);});
test('refunding one credit purchase preserves another purchase after consumption',async()=>{const f=fixture();f.rows.set('paymentOrders/TAK-TEST-ORDER',{uid:'member',product:'ai_question_pack_5',amount:1900,status:'pending'});await f.notify(4,{price:1900,goodname:'AI 질문권 5개'});const ent=require('../lib/payment-entitlements');let u=f.rows.get('users/member');u={...u,...ent.grantPatch(u,'OTHER','ai_question_pack_10',Date.now())};for(let i=0;i<3;i++)u={...u,...ent.consumeCreditPatch(u).patch};f.rows.set('users/member',u);await f.notify(9,{price:1900,goodname:'AI 질문권 5개'});assert.equal(f.rows.get('users/member').aiQuestionCredits,10);});
test('payment completing after account deletion records review without recreating profile',async()=>{const f=fixture({deleted:true});f.rows.delete('users/member');await f.notify(4);assert.equal(f.rows.has('users/member'),false);assert.equal(f.rows.get('paymentOrders/TAK-TEST-ORDER').entitlementReviewRequired,true);assert.equal(f.rows.get('paymentOrders/TAK-TEST-ORDER').entitlementGranted,false);});
test('optional PayApp signature rejects missing/expired hashes before writes and accepts a valid current hash',async()=>{const crypto=require('node:crypto'),f=fixture({env:{PAYAPP_REQUESTKEY:'synthetic-key'}}),before=f.rows.size;assert.equal((await f.notify(4)).body,'INVALID_SIGNATURE');assert.equal(f.rows.size,before);const stamp=new Date(Date.now()+9*3600000).toISOString().slice(0,19).replace(/\D/g,'');const hash=crypto.createHash('sha256').update('green5797'+stamp+'synthetic-key').digest('hex');assert.equal((await f.notify(4,{responsedate:stamp,hash})).body,'SUCCESS');});
test('legacy and new 10-question orders grant and refund only at their recorded amounts',async()=>{
 for(const amount of [2500,3200]){
  const f=fixture();
  f.rows.set('paymentOrders/TAK-TEST-ORDER',{uid:'member',product:'ai_question_pack_10',amount,status:'pending'});
  const pack={goodname:'AI 질문권 10개'};
  assert.equal((await f.notify(4,{...pack,price:amount===2500?3200:2500})).body,'INVALID_PRICE');
  assert.equal((await f.notify(4,{...pack,price:amount})).body,'SUCCESS');
  assert.equal(f.rows.get('users/member').aiQuestionCredits,10);
  assert.equal(f.rows.get('stats/counters').revenue,amount);
  assert.equal((await f.notify(9,{...pack,price:amount})).body,'SUCCESS');
  assert.equal(f.rows.get('users/member').aiQuestionCredits,0);
  assert.equal(f.rows.get('stats/counters').revenue,0);
 }
});
test('payment preserves legacy time in front of a capped new pass, including after its refund',async()=>{
 const f=fixture();
 const previous=Date.now()+86400000;
 f.rows.set('users/member',{premium:true,premiumUntil:previous});
 f.rows.get('paymentOrders/TAK-TEST-ORDER').planVersion=2;
 assert.equal((await f.notify(4)).body,'SUCCESS');
 const member=f.rows.get('users/member');
 assert.deepEqual(Array.from(member.premiumLots,lot=>lot.planVersion),[undefined,2]);
 assert.equal((await f.notify(9)).body,'SUCCESS');
 assert.equal(f.rows.get('users/member').premiumUntil,previous);
});
const dateReport=require('../lib/date-report');
const seohwa=require('../lib/seohwa-report');
const seohwaTransfer=require('../lib/ai-transfer-consent');
const seohwaComparison={profile:{y:1990,m:1,d:1,calType:'solar',hourValue:'unknown',gender:'female'},choice:1};
const seohwaCheckout={operation:'prepare',comparison:seohwaComparison,checkout:true};

test('서화 결제·본편·별도 상담 3회는 같은 회원과 결제에 연결된다',async()=>{
 const f=fixture(),user='users/member';
 f.rows.set(user,{premium:false,aiFreeUsed:2,aiQuestionCredits:7});
 f.rows.set('siteSettings/checkout',{enabled:true});
 await assert.rejects(()=>seohwa.run(f.db,'member',seohwaCheckout),{code:'AI_TRANSFER_CONSENT_REQUIRED'});
 await seohwaTransfer.manage(f.db,'member',{operation:'grant',noticeVersion:seohwaTransfer.NOTICE_VERSION,expectedRevision:0});
 f.rows.set('siteSettings/checkout',{enabled:false});
 assert.equal((await seohwa.run(f.db,'member',seohwaCheckout)).state,'paused');
 f.rows.set('siteSettings/checkout',{enabled:true});
 const created=await seohwa.run(f.db,'member',seohwaCheckout);
 const {id,orderId}=created;
 const status={operation:'checkout-status',orderId};
 assert.equal(created.price,5900);
 assert.equal((await seohwa.run(f.db,'member',seohwaCheckout)).state,'pending');
 assert.deepEqual(await seohwa.run(f.db,'member',status),{state:'pending',waiting:'provider'});
 await assert.rejects(seohwa.run(f.db,'other',status),{code:'REPORT_ORDER_NOT_FOUND'});
 await assert.rejects(seohwa.run(f.db,'member',{...status,orderId:'../invalid'}),{code:'REPORT_ORDER_NOT_FOUND'});
 let providerCalls=0,finish,providerStart;
 const started=new Promise(resolve=>{providerStart=resolve;});
 const waiting=new Promise(resolve=>{finish=resolve;});
 const settings={env:{AI_PRIMARY_PROVIDER:'openai',OPENAI_MODEL:'gpt-6.2-sol',OPENAI_API_KEY:'synthetic'},fetchImpl:async(url,options)=>{
  providerCalls++; const request=JSON.parse(options.body),input=JSON.parse(request.input[0].content);
  assert.equal(new URL(url).origin,'https://api.openai.com');
  assert.equal(request.store,false);
  assert.equal(JSON.stringify(request).includes('1990'),false);
  assert.equal(Object.hasOwn(input,'profile'),false);
  providerStart(); await waiting;
  const chapters=input.chapterPlan.map(({requiredBasis,title},index)=>({highlight:title+'을 먼저 가만히 살펴봐요.',basisId:requiredBasis||'s1',
   paragraphs:[0,1,2,3].map(part=>title+'의 '+index+'번 장면과 '+part+'번째 이야기예요. '+'마음을 전한 뒤 실제 이어진 일을 생각하며 어떤 말이 오래 남았는지 돌아봐요. '.repeat(4))}));
  return {ok:true,json:async()=>({status:'completed',output:[{type:'function_call',name:'write_seohwa_report',arguments:JSON.stringify({chapters})}]})};
 }};
 await assert.rejects(()=>seohwa.generate(f.db,'member',id,settings),{code:'SEOHWA_REPORT_REQUIRED'});
 await assert.rejects(()=>seohwa.generate(f.db,'other',id,settings),{code:'SEOHWA_REPORT_REQUIRED'});
 assert.equal(providerCalls,0);
 const callback={var1:orderId,goodname:created.name,price:created.price};
 assert.equal((await f.notify(4,{...callback,price:1900})).body,'INVALID_PRICE');
 assert.equal((await f.notify(4,{...callback,goodname:'두 사람 관계 리포트'})).body,'INVALID_PRODUCT_NAME');
 const payAppCallback={...callback,goodname:'서화 연애 리포트 상담 3회'};
 assert.equal((await f.notify(1,payAppCallback)).body,'SUCCESS');
 assert.equal((await f.notify(10,payAppCallback)).body,'SUCCESS');
 assert.deepEqual(await seohwa.run(f.db,'member',status),{state:'pending',waiting:'deposit'});
 assert.equal((await f.notify(4,payAppCallback)).body,'SUCCESS');
 assert.equal((await f.notify(4,callback)).body,'SUCCESS');
 f.rows.set('siteSettings/checkout',{enabled:false});
 assert.deepEqual(await seohwa.run(f.db,'member',status),{state:'paid',id});
 assert.equal((await seohwa.run(f.db,'member',{operation:'open',id})).state,'paid');
 const result=seohwa.generate(f.db,'member',id,settings);
 await started;
 const running=await seohwa.generate(f.db,'member',id,settings);
 assert.equal(running.state,'generating');
 assert.equal((await seohwa.run(f.db,'member',status)).state,'generating');
 assert.ok(Number.isFinite(running.startedAtMs));
 finish();
 const full=await result;
 assert.equal(providerCalls,1);
 assert.equal(full.state,'ready');
 assert.equal(full.questionsLeft,3);
 assert.deepEqual(await seohwa.run(f.db,'member',status),full);
 assert.equal(full.report.body.length,5);
 const seed=seohwa.calculate(seohwa.validate(seohwaComparison));
 for(const snippet of seed.excerpts){
  assert.equal(full.report.body[snippet.index].paragraphs[0],snippet.text);
  assert.equal(full.report.body[snippet.index].basis.id,snippet.basisId);
 }
 assert.equal((await seohwa.run(f.db,'member',{operation:'list'})).reports[0].choice,1);
 const reserve=()=>f.db.runTransaction(tx=>seohwa.reserve(f.db,tx,'member',id,0,f.rows.get(user)));
 const one=await reserve();
 assert.equal(one.seohwaQuestionsLeft,2);
 assert.equal(one.context.point,full.report.body[0].highlight);
 await seohwa.rollback(f.db,'member',one);
 const results=await Promise.all([reserve(),reserve(),reserve()]);
 assert.deepEqual(results.map(row=>row.seohwaQuestionsLeft),[2,1,0]);
 await assert.rejects(reserve,{code:'SEOHWA_QUESTIONS_USED'});
 await f.notify(9,callback);
 assert.deepEqual(await seohwa.run(f.db,'member',status),{state:'refunded'});
 await seohwa.rollback(f.db,'member',results[2]);
 await assert.rejects(reserve,{code:'SEOHWA_REPORT_REQUIRED'});
 assert.equal((await seohwa.run(f.db,'member',{operation:'open',id})).state,'refunded');
 assert.equal(f.rows.get(user).aiFreeUsed,2);
 assert.equal(f.rows.get(user).aiQuestionCredits,7);
 assert.equal(f.rows.get('stats/counters').revenue,0);
});
const dateComparison={event:'결혼식',days:['2027-05-15','2027-05-16','2027-05-23'],mine:'화',partner:'목'};

test('신년운세 단품의 승인·중복 통보·환불은 해당 리포트만 바꾼다',async()=>{
 const f=fixture();
 const annual=require('../lib/newyear-purchase'),account=require('../lib/account-report');
 f.rows.set('siteSettings/checkout',{enabled:true});
 const existing=f.rows.get('users/member');
 const input={operation:'prepare',comparison:annual.comparison,allowResume:true,checkout:true};
 const results=await Promise.all([account.run(annual.CONFIG,f.db,'member',input),account.run(annual.CONFIG,f.db,'member',input)]);
 const created=results.find(result=>result.state==='checkout');
 assert.equal(created.price,6900);
 assert.equal(results.filter(result=>result.state==='pending').length,1);
 const event={var1:created.orderId,price:6900,goodname:annual.CONFIG.name};
 assert.equal(await annual.entitled(f.db,'member'),false);
 assert.equal(await annual.paymentState(f.db,'someone-else',created.orderId),'missing');
 assert.equal((await f.notify(4,{...event,price:8900})).body,'INVALID_PRICE');
 assert.equal((await f.notify(4,event)).body,'SUCCESS');
 assert.equal((await f.notify(4,event)).body,'SUCCESS');
 assert.equal(await annual.entitled(f.db,'member'),true);
 assert.equal(await annual.paymentState(f.db,'member',created.orderId),'paid');
 assert.equal(f.rows.get('stats/counters').revenue,6900);
 assert.deepEqual(f.rows.get('users/member'),existing);
 assert.equal((await f.notify(9,event)).body,'SUCCESS');
 assert.equal(await annual.entitled(f.db,'member'),false);
 assert.equal(await annual.paymentState(f.db,'member',created.orderId),'cancelled');
 assert.equal(f.rows.get('stats/counters').revenue,0);
 assert.deepEqual(f.rows.get('users/member'),existing);
});

test('각 대표 리포트의 승인과 후속 상담은 본인 주문과 담당 상담사로 한정된다',async()=>{
 for(const consultant of ['dogyeom','ijun','mujin']){
  const f=fixture(), service=seohwa.reports.get(consultant);
  f.rows.set('siteSettings/checkout',{enabled:true});
  await seohwaTransfer.manage(f.db,'member',{operation:'grant',noticeVersion:seohwaTransfer.NOTICE_VERSION,expectedRevision:0});
  const created=await service.run(f.db,'member',seohwaCheckout);
  const {id,orderId}=created;
  const status={operation:'checkout-status',orderId};
  const event={var1:orderId,price:5900,goodname:created.name};
  const wrong=seohwa.reports.get(consultant==='dogyeom'?'mujin':'dogyeom');
  await assert.rejects(wrong.run(f.db,'member',status),{code:'REPORT_ORDER_NOT_FOUND'});
  await assert.rejects(service.run(f.db,'other',status),{code:'REPORT_ORDER_NOT_FOUND'});
  assert.equal((await f.notify(4,{...event,goodname:wrong.CONFIG.name})).body,'INVALID_PRODUCT_NAME');
  assert.equal((await f.notify(4,event)).body,'SUCCESS');
  assert.equal((await f.notify(4,event)).body,'SUCCESS');
  assert.equal((await service.run(f.db,'member',status)).state,'paid');
  assert.equal(f.rows.get('stats/counters').purchases,1);
  let requests=0;
  const ready=await service.generate(f.db,'member',id,{env:{AI_PRIMARY_PROVIDER:'openai',OPENAI_MODEL:'gpt-6.2-sol',OPENAI_API_KEY:'synthetic'},fetchImpl:async(url,settings)=>{
   requests++;
   const req=JSON.parse(settings.body);
   assert(!JSON.stringify(req).includes('1990'));
   const input=JSON.parse(req.input[0].content);
   if(consultant==='dogyeom'){
    assert.deepEqual(input.wealth_judgment.timing.map(item=>item.kind),['income','margin','risk']);
    assert(input.wealth_judgment.timing.every(item=>item.basis&&item.talk&&!item.from));
    assert(input.chapterPlan.every(chapter=>chapter.wealthFocus));
   }else assert.equal(input.wealth_judgment,undefined);
   const chapters=input.chapterPlan.map(({requiredBasis,title},index)=>({highlight:title+'부터 차분히 살펴봐요.',basisId:requiredBasis||'s1',
    paragraphs:[0,1,2,3].map(p=>title+'에 관해 '+index+'번 장면의 '+p+'번째 이야기예요. '+'먼저 확인할 조건이 달라지면 해온 일에서 어떤 부분을 바꿔볼지 차분히 돌아봐요. '.repeat(4))}));
   return {ok:true,json:async()=>({status:'completed',output:[{type:'function_call',name:'write_featured_report',arguments:JSON.stringify({chapters})}]})};
  }});
  assert.equal(requests,1);
  assert.equal(ready.questionsLeft,3);
  assert.equal(ready.report.body.length,5);
  if(consultant==='dogyeom'){
   assert.equal(ready.report.calendar.rows.length,12);
   assert(!ready.report.calendar.pillars.hour);
   assert(ready.report.calendar.focuses.every(item=>item.reason&&item.action&&item.check));
   const saved=f.rows.get('users/member/dogyeomReports/'+id);
   const {version,judgment,...oldCalendar}=saved.report.calendar;
   f.rows.set('users/member/dogyeomReports/'+id,{...saved,report:{...saved.report,calendar:oldCalendar}});
   assert.deepEqual((await service.run(f.db,'member',{operation:'open',id})).report,ready.report);
   assert.equal(requests,1);
  }else assert.equal(ready.report.calendar,undefined);
  const reserve=()=>f.db.runTransaction(tx=>service.reserve(f.db,tx,'member',id,1,{aiFreeUsed:2,aiQuestionCredits:7}));
  const charges=await Promise.all([reserve(),reserve(),reserve()]);
  assert.deepEqual(charges.map(r=>r.reportQuestionsLeft),[2,1,0]);
  assert(charges.every(r=>r.consultantId===consultant&&r.freeUsed===2&&r.questionCreditsLeft===7));
  await assert.rejects(reserve,{code:'FEATURED_REPORT_QUESTIONS_USED'});
  assert.equal((await f.notify(9,event)).body,'SUCCESS');
  assert.equal((await service.run(f.db,'member',status)).state,'refunded');
  await assert.rejects(reserve,{code:'FEATURED_REPORT_REQUIRED'});
 }
});

test('도겸은 공통 원국에 따라 수입 통로와 절기 구간을 따로 읽는다',()=>{
 const service=seohwa.reports.get('dogyeom'),base=seohwaComparison.profile;
 const a=service.calculate({profile:base,choice:0}).calendar;
 const b=service.calculate({profile:{...base,d:4},choice:0}).calendar;
 const boundary=service.calculate({profile:{...base,d:5},choice:0}).calendar;
 assert.equal(a.judgment.route.key,'craft');
 assert.equal(b.judgment.route.key,'flexible');
 assert.notDeepEqual(a.judgment.timing.map(item=>item.from),b.judgment.timing.map(item=>item.from));
 assert(!boundary.pillars.month);
 const {calculate}=require('../lib/newyear-calculation');
 for(const [profile,calendar] of [[base,a],[{...base,d:4},b],[{...base,d:5},boundary]]){
  const periods=calculate(profile).months.flatMap(month=>month.segments);
  for(const window of calendar.judgment.timing){
   assert(periods.some(item=>item.from===window.from&&item.monthGanZhi===window.ganZhi));
   assert(periods.some(item=>item.untilExclusive===window.untilExclusive&&item.monthGanZhi===window.ganZhi));
   assert(window.untilExclusive>window.from);
  }
 }
});

test('신년 주요 시기와 10년 흐름은 계산 구간과 출생값에 맞춰 정한다',()=>{
 const {calculate}=require('../lib/newyear-calculation'), {buildDecisionGuide}=require('../lib/newyear-decision-guide');
 const base=seohwaComparison.profile;
 const natal=calculate(base), guide=buildDecisionGuide(natal), other=buildDecisionGuide(calculate({...base,d:2}));
 assert.deepEqual(guide.years.map(row=>row.year),[2027,2028,2029,2030,2031,2032,2033,2034,2035,2036]);
 assert.equal(guide.years[0].ganZhi,natal.annual.ganZhi);
 assert.notDeepEqual(guide.years.map(row=>row.basis),other.years.map(row=>row.basis));
 for(const {windows} of guide.areas){
  assert.equal(windows.length,3);
  for(const w of windows)assert(natal.months[w.month-1].segments.some(s=>s.from.startsWith(w.from)&&s.untilExclusive.startsWith(w.untilExclusive)));
 }
 assert.equal(buildDecisionGuide(null),null);
});
const prepareDate={operation:'prepare',comparison:dateComparison,checkout:true};
test('comparison stays free to preview, single-order purchases are blocked while paused, and existing premium can save',async()=>{
 const f=fixture();
 assert.deepEqual(await dateReport.run(f.db,'member',prepareDate),{state:'paused'});
 f.rows.set('siteSettings/checkout',{enabled:false});
 assert.deepEqual(await dateReport.run(f.db,'member',prepareDate),{state:'paused'});
 await f.notify(4);
 const saved=await dateReport.run(f.db,'member',prepareDate);
 assert.equal(saved.state,'ready');
 assert.equal(saved.report.candidates.length,3);
 assert.equal(f.rows.get('users/member').aiQuestionCredits,undefined);
 assert.equal([...f.rows.keys()].filter(k=>k.startsWith('paymentOrders/')).length,1);
 assert.equal((await dateReport.run(f.db,'member',{operation:'list'})).reports.length,1);
});
test('a single payment issues one account-bound date report; refund removes only that report',async()=>{
 const f=fixture();
 f.rows.set('users/member',{premium:false,aiQuestionCredits:7});
 f.rows.set('siteSettings/checkout',{enabled:true});
 const attempts=await Promise.all([dateReport.run(f.db,'member',prepareDate),dateReport.run(f.db,'member',prepareDate)]);
 const purchase=attempts.find(a=>a.state==='checkout');
 assert(purchase);
 assert.equal(purchase.price,3900);
 assert.equal(attempts.filter(a=>a.state==='pending').length,1);
 assert.deepEqual(await dateReport.run(f.db,'member',{operation:'open',id:purchase.id}),{state:'pending'});
 await assert.rejects(dateReport.run(f.db,'another-member',{operation:'open',id:purchase.id}),{code:'REPORT_NOT_FOUND'});
 const pay={var1:purchase.orderId,price:3900,goodname:purchase.name};
 assert.equal((await f.notify(4,{...pay,price:3800})).body,'INVALID_PRICE');
 assert.equal((await f.notify(4,pay)).body,'SUCCESS');
 assert.equal((await f.notify(4,pay)).body,'SUCCESS');
 assert.equal((await dateReport.run(f.db,'member',{operation:'list'})).reports.length,1);
 assert.equal((await dateReport.run(f.db,'member',prepareDate)).state,'ready');
 assert.equal(f.rows.get('stats/counters').revenue,3900);
 assert.equal(f.rows.get('users/member').aiQuestionCredits,7);
 assert.equal(f.rows.get('users/member').premium,false);
 assert.equal((await f.notify(9,pay)).body,'SUCCESS');
 assert.equal((await dateReport.run(f.db,'member',{operation:'open',id:purchase.id})).state,'refunded');
 assert.equal((await dateReport.run(f.db,'member',{operation:'list'})).reports.length,0);
 assert.equal(f.rows.get('stats/counters').revenue,0);
 assert.equal(f.rows.get('users/member').aiQuestionCredits,7);
});
test('5,900-won relationship report stays paused for everyone and issues only to its purchaser after confirmation',async()=>{
 const f=fixture();
 const relationship=require('../lib/relationship-report');
 const purchaseRequest={operation:'prepare',comparison:{first:2,second:5},checkout:true};
 await f.notify(4); // Existing premium still applies only to its included benefits.
 assert.deepEqual(await relationship.run(f.db,'member',purchaseRequest),{state:'paused'});
 f.rows.set('siteSettings/checkout',{enabled:true});
 const pending=await Promise.all([relationship.run(f.db,'member',purchaseRequest),relationship.run(f.db,'member',purchaseRequest)]);
 const purchase=pending.find(item=>item.state==='checkout');
 assert(purchase);
 assert.equal(purchase.price,5900);
 assert.equal(pending.filter(item=>item.state==='pending').length,1);
 assert.deepEqual(await relationship.run(f.db,'member',{operation:'open',id:purchase.id}),{state:'pending'});
 await assert.rejects(relationship.run(f.db,'other',{operation:'open',id:purchase.id}),{code:'REPORT_NOT_FOUND'});
 const pay={var1:purchase.orderId,price:5900,goodname:purchase.name};
 assert.equal((await f.notify(4,{...pay,price:3900})).body,'INVALID_PRICE');
 assert.equal((await f.notify(4,{...pay,goodname:dateReport.NAME})).body,'INVALID_PRODUCT_NAME');
 assert.equal((await f.notify(4,pay)).body,'SUCCESS');
 assert.equal((await f.notify(4,pay)).body,'SUCCESS');
 const {reports}=await relationship.run(f.db,'member',{operation:'list'});
 assert.equal(reports.length,1);
 assert.equal(reports[0].report.conversations.length,3);
 assert.equal(reports[0].report.chapters.length,12);
 const savedKey='users/member/relationshipReports/'+purchase.id;
 const stored=f.rows.get(savedKey);
 const {edition,chapters,routine,...legacy}=stored.report;
 f.rows.set(savedKey,{...stored,report:legacy});
 assert.equal((await relationship.run(f.db,'member',{operation:'open',id:purchase.id})).report.chapters.length,12);
 assert.equal((await relationship.run(f.db,'member',{operation:'list'})).reports[0].report.edition,3);
 assert.equal(f.rows.get(savedKey).report.edition,undefined);
 const compact=await relationship.run(f.db,'member',{operation:'list',summaryOnly:true});
 assert.deepEqual(compact.reports[0].days,stored.report.people.map(person=>person.day));
 assert.equal(compact.reports[0].report,undefined);
 assert.equal(f.rows.get('stats/counters').revenue,14800);
 assert.equal((await f.notify(9,pay)).body,'SUCCESS');
 assert.equal((await relationship.run(f.db,'member',{operation:'list'})).reports.length,0);
 assert.equal(f.rows.get('users/member').premium,true);
 assert.equal(f.rows.get('stats/counters').revenue,8900);
});
test('a signed unpaid report notification resumes the same checkout and an outstanding transfer cannot be reopened',async()=>{
 const relationship=require('../lib/relationship-report');
 const f=fixture(), input={operation:'prepare',comparison:{first:2,second:5},checkout:true,allowResume:true};
 f.rows.set('siteSettings/checkout',{enabled:true});
 const order=await relationship.run(f.db,'member',input);
 const pay={var1:order.orderId,price:5900,goodname:order.name,payurl:'http://payapp.kr/000000000000'};
 await f.notify(1,pay);
 const resume=await relationship.run(f.db,'member',input,Date.now()+45*60*1000);
 assert.deepEqual(resume,{state:'resume',id:order.id,resumeUrl:'https://payapp.kr/000000000000'});
 const open={operation:'open',id:order.id,allowResume:true};
 assert.deepEqual(await relationship.run(f.db,'member',open),resume);
 await assert.rejects(relationship.run(f.db,'other',open),{code:'REPORT_NOT_FOUND'});
 f.rows.set('siteSettings/checkout',{enabled:false});
 assert.deepEqual(await relationship.run(f.db,'member',open),{state:'pending'});
 f.rows.set('siteSettings/checkout',{enabled:true});
 await f.notify(10,pay);
 assert.equal((await relationship.run(f.db,'member',input)).waiting,'deposit');
 await f.notify(4,pay);
 assert.equal((await relationship.run(f.db,'member',open)).state,'ready');
 assert.equal([...f.rows.values()].filter(x=>x.product===relationship.CONFIG.product).length,1);
});

test('renamed new year pass keeps the previous PayApp name valid for refunds',async()=>{
  const f=fixture();
  assert.equal((await f.notify(4,{goodname:'2027 신년운세 · 30일 이용권'})).body,'SUCCESS');
  assert.equal(f.rows.get('users/member').premium,true);
  assert.equal((await f.notify(9)).body,'SUCCESS');
  assert.equal(f.rows.get('users/member').premium,false);
});
