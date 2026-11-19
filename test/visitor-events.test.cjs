const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../lib/visitor-events'),{recordMilestone}=require('../lib/consultation-metrics');
const now=Date.parse('2026-11-11T12:00:00Z');
function fixture(actor=null,accountCreated=now){
 const rows=new Map();let queue=Promise.resolve(),reads=0,time=now;
 const db={collection:name=>({doc:id=>({key:name+'/'+id})}),runTransaction(fn){const run=queue.then(()=>fn({get:async ref=>{reads++;return {exists:rows.has(ref.key),data:()=>rows.get(ref.key)}},set(ref,value,opts){const old=rows.get(ref.key)||{},out=opts?.merge?{...old}:{};for(const [key,v] of Object.entries(value))out[key]=v?.inc?(old[key]||0)+v.inc:v;rows.set(ref.key,out);}}));queue=run.catch(()=>{});return run;}};
 const handler=create({db,auth:{verifyIdToken:async(t,revoked)=>{assert.equal(revoked,true);if(actor instanceof Error)throw actor;return actor;},getUser:async()=>({metadata:{creationTime:new Date(accountCreated).toISOString()}})},secret:'dummy-fixture-key',increment:n=>({inc:n}),now:()=>time});
 return {db,rows,handler,reads:()=>reads,setTime:value=>{time=value;}};
}
function response(){return {setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this},end(){return this}};}
const visit={session:'a'.repeat(32),kind:'visit',channel:'google'};
test('campaign increments only an aggregate on the first recorded daily visit',async()=>{
 const f=fixture(),event={...visit,campaign:'겨울 상담'};
 await Promise.all([call(f,event),call(f,event)]);
 await call(f,{...event,campaign:'later'});
 await call(f,{...event,session:'b'.repeat(32)});
 await call(f,{...visit,session:'c'.repeat(32)});
 const totals=[...f.rows].filter(([k])=>k.startsWith('dailyCampaignVisits/'));
 assert.equal(totals.length,1);
 assert.deepEqual(totals[0][1],{date:'2026-11-11',campaign:event.campaign,count:2});
 assert.equal(f.rows.get('stats/counters').visits,3);
 assert(!JSON.stringify([...f.rows].filter(([k])=>!k.startsWith('dailyCampaignVisits/'))).includes(event.campaign));
 for(const bad of [{...visit,campaign:'me@example.com'},{...event,orderId:'order'},{...event,kind:'funnel',field:'signups'}]){
   assert.equal((await call(f,bad)).code,400);
 }
});
async function call(f,body=visit,headers={origin:'https://taekilso.com','x-forwarded-for':'192.0.2.1'}){const res=response();await f.handler({method:'POST',headers,body},res);return res;}
test('simultaneous repeated visit records one atomic aggregate and no raw network identifier',async()=>{
 const f=fixture();const results=await Promise.all([call(f),call(f)]);assert.equal(results.filter(x=>x.body.recorded).length,1);assert.equal(f.rows.get('stats/counters').visits,1);assert.equal(f.rows.get('dailyVisits/2026-11-11').count,1);assert.equal(f.rows.get('dailyTrafficSources/2026-11-11').google,1);assert(!JSON.stringify([...f.rows]).includes('192.0.2.1'));
});
test('visitor cannot submit counts, money, confirmed purchases or AI completion milestones',async()=>{
 for(const body of [{...visit,count:999},{...visit,question:'private'},{session:visit.session,kind:'funnel',field:'purchases'},{session:visit.session,kind:'funnel',field:'firstAiAnswers'}]){const f=fixture(),r=await call(f,body);assert.equal(r.code,400);assert.equal(f.reads(),0);}
});
test('admin, invalid origin and revoked tokens never modify telemetry',async()=>{
 const a=fixture({email:'green092432@gmail.com',uid:'owner'});assert.equal((await call(a,visit,{origin:'https://taekilso.com',authorization:'Bearer admin'})).body.reason,'ADMIN_EXCLUDED');assert.equal(a.reads(),0);
 const f=fixture();assert.equal((await call(f,visit,{origin:'https://evil.example'})).code,403);assert.equal(f.reads(),0);
 const revoked=fixture(new Error('revoked'));assert.equal((await call(revoked,visit,{origin:'https://taekilso.com',authorization:'Bearer invalid'})).code,401);assert.equal(revoked.reads(),0);
});
test('signup events require verified membership and cannot become anonymous counter writes',async()=>{const f=fixture();assert.equal((await call(f,{session:visit.session,kind:'funnel',field:'signups'})).code,401);assert.equal(f.rows.size,0);});
test('network budget refuses new sessions without growing counters',async()=>{const f=fixture();await call(f);const key=[...f.rows.keys()].find(k=>k.startsWith('analyticsRateLimits/'));f.rows.get(key).count=1000;assert.equal((await call(f,{...visit,session:'b'.repeat(32)})).code,429);assert.equal(f.rows.get('stats/counters').visits,1);});
test('actual first-answer milestone is atomic, once per account, and scoped to the supplied SEO page',async()=>{
 const f=fixture();f.rows.set('users/member',{email:'test@example.com'});await Promise.all([recordMilestone(f.db,'member','firstAiAnswers',{seoSlug:'free-saju'},now),recordMilestone(f.db,'member','firstAiAnswers',{seoSlug:'free-saju'},now)]);assert.equal(f.rows.get('dailyFunnel/2026-11-11').firstAiAnswers,1);assert.equal(f.rows.get('dailySeoLanding/2026-11-11__free-saju').firstAiAnswers,1);
});

test('activity totals are independent, idempotent and assigned to the action day in Korea',async()=>{
 const f=fixture(), action=(field,id)=>({kind:'activity',field,eventId:id.repeat(32)});
 const open=action('consultationOpens','a'), view=action('exampleReads','a');
 await Promise.all([call(f,open),call(f,open)]);
 assert.equal(f.rows.get('dailyFunnel/2026-11-11').consultationOpens,1);
 f.setTime(Date.parse('2026-11-11T15:01:00Z'));
 assert.equal((await call(f,open)).body.reason,'DUPLICATE');
 assert.equal((await call(f,view)).body.recorded,true);
 assert.equal(f.rows.get('dailyFunnel/2026-11-12').exampleReads,1);
 const marks=[...f.rows].filter(([k])=>k.startsWith('analyticsEventBuckets/'));
 assert.equal(marks.length,2);
 for(const [,record] of marks)assert.deepEqual(Object.keys(record),['expiresAt']);
 for(const invalid of [{...open,session:visit.session},{kind:'preview',field:'previewSignups',session:visit.session}]){
   assert.equal((await call(f,invalid)).code,400);
 }
});
test('new signup counts without a preview or start and uses the account creation date',async()=>{
 const created=Date.parse('2026-11-11T14:59:00Z');
 const f=fixture({uid:'member',email:'test@example.invalid'},created);
 f.setTime(created+120000);
 const body={session:visit.session,kind:'funnel',field:'signups'};
 const headers={origin:'https://taekilso.com',authorization:'Bearer member'};
 assert.equal((await call(f,body,headers)).body.recorded,true);
 assert.equal((await call(f,{...body,session:'c'.repeat(32)},headers)).body.reason,'DUPLICATE');
 assert.equal(f.rows.get('dailyFunnel/2026-11-11').signups,1);
 assert.equal(await recordMilestone(f.db,'member','firstAiAnswers',{disabled:true}),false);
});
