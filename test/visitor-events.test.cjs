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
const preview=(field,session=visit.session)=>({kind:'preview',field,session});
const memberHeaders={origin:'https://taekilso.com',authorization:'Bearer member'};
const member={uid:'test-member',email:'fixture@example.com',firebase:{sign_in_provider:'google.com'}};

test('preview stages are ordered for the same tab and attributed to the exposure date across Korean midnight',async()=>{
 const midnight=Date.parse('2026-11-11T15:00:00Z');
 const f=fixture(member,midnight+3000);
 f.rows.set('users/'+member.uid,{});
 f.setTime(midnight-5000);
 assert.equal((await call(f,preview('previewStarts'))).body.reason,'PREVIOUS_STAGE_REQUIRED');
 assert.equal((await call(f,preview('previewViews'))).body.recorded,true);
 assert.equal((await call(f,preview('previewStarts','b'.repeat(32)))).body.reason,'PREVIOUS_STAGE_REQUIRED');
 assert.equal((await call(f,preview('previewSignups'),memberHeaders)).body.reason,'PREVIOUS_STAGE_REQUIRED');
 const starts=await Promise.all([call(f,preview('previewStarts')),call(f,preview('previewStarts'))]);
 assert.equal(starts.filter(r=>r.body.recorded).length,1);
 f.setTime(midnight+5000);
 assert.equal((await call(f,preview('previewViews'))).body.reason,'DUPLICATE');
 assert.equal((await call(f,preview('previewSignups'),memberHeaders)).body.recorded,true);
 assert.equal((await call(f,preview('previewSignups'),memberHeaders)).body.reason,'DUPLICATE');
 assert.deepEqual(f.rows.get('dailyFunnel/2026-11-11'),{date:'2026-11-11',previewViews:1,previewStarts:1,previewSignups:1});
 assert.equal(f.rows.has('dailyFunnel/2026-11-12'),false);
 const privateEntries=[...f.rows].filter(([key])=>key.startsWith('analytics'));
 assert(!JSON.stringify(privateEntries).includes(visit.session));
 assert(!JSON.stringify(privateEntries).includes(member.uid));
});

test('preview signup requires a new real member and counts across two tabs only once per account',async()=>{
 const f=fixture(member,now+4000),other='b'.repeat(32);
 for(const session of [visit.session,other]) {
  await call(f,preview('previewViews',session));
  await call(f,preview('previewStarts',session));
 }
 f.setTime(now+6000);
 assert.equal((await call(f,preview('previewSignups'))).code,401);
 assert.equal((await call(f,preview('previewSignups'),memberHeaders)).body.reason,'MEMBER_RECORD_REQUIRED');
 f.rows.set('users/'+member.uid,{});
 const conversions=await Promise.all([call(f,preview('previewSignups'),memberHeaders),call(f,preview('previewSignups',other),memberHeaders)]);
 assert.equal(conversions.filter(r=>r.body.recorded).length,1);
 assert.equal(f.rows.get('dailyFunnel/2026-11-11').previewSignups,1);

 const returning=fixture(member,now-10000);
 returning.rows.set('users/'+member.uid,{});
 await call(returning,preview('previewViews'));
 await call(returning,preview('previewStarts'));
 assert.equal((await call(returning,preview('previewSignups'),memberHeaders)).body.reason,'EXISTING_MEMBER');
});

test('expired preview cannot be converted and preview events cannot use ordinary counter writes',async()=>{
 const f=fixture();
 assert.equal((await call(f,{...preview('previewViews'),kind:'funnel'})).code,400);
 await call(f,preview('previewViews'));
 f.setTime(now+30*60000);
 assert.equal((await call(f,preview('previewStarts'))).body.reason,'WINDOW_CLOSED');
 assert.equal((await call(f,preview('previewViews'))).body.reason,'DUPLICATE');
 assert.equal(f.rows.get('dailyFunnel/2026-11-11').previewStarts,undefined);
});
