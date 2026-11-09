const test = require('node:test');
const assert = require('node:assert/strict');
const createLedger = require('../lib/ai-usage');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

function fixture(initial = {}) {
  let records = new Map(Object.entries(initial));
  let queue = Promise.resolve();
  const snapshot = (map, path) => ({ exists: map.has(path), data: () => structuredClone(map.get(path)) });
  const db = {
    collection: name => ({ doc: id => ({ path: `${name}/${id}`, get: async () => snapshot(records, `${name}/${id}`) }) }),
    runTransaction: callback => {
      const result = queue.then(async () => {
        const staged = new Map(structuredClone([...records]));
        let written = false;
        const tx = {
          get: async ref => { assert.equal(written, false, 'Firestore requires all reads before writes'); return snapshot(staged, ref.path); },
          set: (ref, data, options) => { written = true; staged.set(ref.path, options?.merge ? { ...staged.get(ref.path), ...data } : data); },
          update: (ref, data) => { written = true; assert(staged.has(ref.path)); staged.set(ref.path, { ...staged.get(ref.path), ...data }); },
          delete: ref => { written = true; staged.delete(ref.path); }
        };
        const value = await callback(tx);
        records = staged;
        return value;
      });
      queue = result.catch(() => {});
      return result;
    }
  };
  const ledger = createLedger({db, secret:'test-only-secret', fieldValue:{serverTimestamp:()=>123}, dateKey:()=> '2026-11-10', now:()=>1000});
  return { db, ledger, read: path => records.get(path), all: () => [...records] };
}
test('concurrent duplicate has one reservation; retry returns exact successful response', async () => {
  const f = fixture({'users/a':{aiFreeUsed:0, aiQuestionCredits:5, premiumUntil:0}});
  const results = await Promise.allSettled([f.ledger.reserve('a',false,'request-00000001','same'), f.ledger.reserve('a',false,'request-00000001','same')]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.find(x=>x.status==='rejected').reason.code,'REQUEST_IN_PROGRESS');
  const reservation = results.find(x=>x.status==='fulfilled').value;
  await f.ledger.finish('a',reservation,{reply:'완료',freeUsed:1});
  assert.deepEqual(await f.ledger.reserve('a',false,'request-00000001','same'),{replay:{reply:'완료',freeUsed:1}});
  assert.equal(f.read('users/a').aiFreeUsed,1);
  assert.equal(f.read('users/a').aiQuestionCredits,5);
  assert(!JSON.stringify(f.all()).includes('완료'), 'receipt must not contain plaintext reply');
});
test('different concurrent requests for one account fail closed', async () => {
  const f = fixture();
  await f.ledger.reserve('a',false,'request-00000001','one');
  await assert.rejects(f.ledger.reserve('a',false,'request-00000002','two'),{code:'REQUEST_IN_PROGRESS'});
});
test('rollback is idempotent and an old attempt cannot refund a later retry', async () => {
  const f = fixture({'users/a':{aiFreeUsed:3,aiQuestionCredits:2}});
  const first = await f.ledger.reserve('a',false,'request-00000001','one');
  await f.ledger.rollback('a', first);
  await f.ledger.rollback('a', first);
  assert.equal(f.read('users/a').aiQuestionCredits,2);
  const retry = await f.ledger.reserve('a',false,'request-00000001','one');
  await f.ledger.rollback('a',first);
  assert.equal(f.read('users/a').aiQuestionCredits,1);
  await f.ledger.finish('a',retry,{reply:'ok'});
  await f.ledger.rollback('a',retry);
  assert.equal(f.read('users/a').aiQuestionCredits,1);
});
test('free 3 is lifetime, credits and premium expiry are preserved',async()=>{
  const f=fixture({'users/a':{aiFreeUsed:2,aiQuestionCredits:2,premium:true,premiumUntil:999}});
  const first=await f.ledger.reserve('a',false,'request-00000001','one');
  assert.equal(first.kind,'free'); await f.ledger.finish('a',first,{reply:'ok'});
  const next=await f.ledger.reserve('a',false,'request-00000002','two');
  assert.equal(next.kind,'credit'); assert.equal(next.freeUsed,3);
  assert.equal(f.read('users/a').premiumUntil,999);
});
test('premium daily cap, administrator cap, no entitlement',async()=>{
  const premium=fixture({'users/a':{premium:true,premiumUntil:99999,aiFreeUsed:3},'aiDailyUsage/a_2026-11-10':{count:15}});
  await assert.rejects(premium.ledger.reserve('a',false,'request-00000001','one'),{code:'DAILY_LIMIT_REACHED'});
  const admin=fixture({'aiDailyUsage/a_2026-11-10':{count:100}});
  await assert.rejects(admin.ledger.reserve('a',true,'request-00000001','one'),{code:'DAILY_LIMIT_REACHED'});
  const free=fixture({'users/a':{aiFreeUsed:3}});
  await assert.rejects(free.ledger.reserve('a',false,'request-00000001','one'),{code:'FREE_LIMIT_REACHED'});
});
test('request IDs cannot be reused with different contents or another account',async()=>{
  const f=fixture(); const a=await f.ledger.reserve('a',false,'request-00000001','one'); await f.ledger.finish('a',a,{reply:'private'});
  await assert.rejects(f.ledger.reserve('a',false,'request-00000001','two'),{code:'REQUEST_ID_CONFLICT'});
  const b=await f.ledger.reserve('b',false,'request-00000001','one'); assert.equal(b.freeUsed,1); assert.equal(b.replay,undefined);
});

function handlerFixture({upstream, identity={uid:'a',email:'member@example.com',email_verified:true,firebase:{sign_in_provider:'google.com'}}}={}) {
  const f=fixture({'users/a':{aiFreeUsed:0}});
  let calls=0;
  function firestore(){return f.db;}
  firestore.FieldValue={serverTimestamp:()=>123};
  const admin={apps:[{}],firestore,auth:()=>({verifyIdToken:async()=>identity})};
  const sandbox={module:{exports:{}},require:name=>name==='firebase-admin'?admin:name==='../lib/ai-usage'?createLedger:require(name),process:{env:{ANTHROPIC_API_KEY:'test',FIREBASE_SERVICE_ACCOUNT_JSON:'test-secret'}},console:{error(){},warn(){}},setTimeout,clearTimeout,AbortController,Buffer,fetch:async()=>{calls++; if(upstream instanceof Error)throw upstream; if(typeof upstream==='function')return upstream(calls); return upstream || {ok:true,json:async()=>({content:[{type:'text',text:'상담 답변'}],stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:5}})};}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/ai-chat.js'),'utf8'),sandbox);
  async function invoke(overrides={}) {
    const req={method:'POST',headers:{authorization:'Bearer test'},body:{requestId:'request-00000001',message:'업무 방식이 궁금해요',history:[],...overrides}};
    const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(value){return {status:this.statusCode,body:value};},end(){return {status:this.statusCode};}};
    return sandbox.module.exports(req,res);
  }
  return {...f,invoke,calls:()=>calls};
}
test('endpoint rejects unauthenticated and unverified password users before AI',async()=>{
  const guest=handlerFixture({identity:null}); assert.equal((await guest.invoke()).status,401); assert.equal(guest.calls(),0);
  const user=handlerFixture({identity:{uid:'a',firebase:{sign_in_provider:'password'},email_verified:false}});
  assert.equal((await user.invoke()).body.error,'EMAIL_VERIFICATION_REQUIRED'); assert.equal(user.calls(),0);
});
test('endpoint replays success without another AI call or charge',async()=>{
  const f=handlerFixture(); const first=await f.invoke(); assert.equal(first.status,200);
  const second=await f.invoke(); assert.equal(second.status,200);assert.equal(second.body.reply,first.body.reply);
  assert.equal(f.calls(),1); assert.equal(f.read('users/a').aiFreeUsed,1);
});
for(const [name,upstream] of [
  ['empty response',{ok:true,json:async()=>({content:[]})}],
  ['invalid JSON',{ok:true,json:async()=>{throw new Error('invalid JSON');}}],
  ['upstream failure',{ok:false,status:500,text:async()=>''}],
  ['timeout',Object.assign(new Error('timeout'),{name:'AbortError'})]
]) test(`${name} refunds exactly once`,async()=>{
  const f=handlerFixture({upstream}); const result=await f.invoke(); assert(result.status>=500);
  assert.equal(f.read('users/a').aiFreeUsed,0);
});
test('restricted questions never call AI or consume entitlement',async()=>{
  const f=handlerFixture();const r=await f.invoke({message:'로또 당첨 번호 알려줘'});
  assert.equal(r.body.usageCharged,false);assert.equal(f.calls(),0);assert.equal(f.read('users/a').aiFreeUsed,0);
});
test('claimed UID cannot spend another account entitlement',async()=>{
  const f=handlerFixture();const r=await f.invoke({uid:'victim'});assert.equal(r.status,200);
  assert.equal(f.read('users/a').aiFreeUsed,1);assert.equal(f.read('users/victim'),undefined);
});
test('continuation tokens are counted and replay never regenerates either call',async()=>{
  const f=handlerFixture({upstream:async call=>({ok:true,json:async()=>({content:[{type:'text',text:call===1?'첫 문장.':'마지막 문장.'}],stop_reason:call===1?'max_tokens':'end_turn',usage:{input_tokens:10,output_tokens:5}})})});
  const r=await f.invoke();assert.equal(r.status,200);assert.equal(r.body.reply,'첫 문장.\n마지막 문장.');
  assert.equal(r.body.tokenUsage.input,20);assert.equal(r.body.tokenUsage.output,10);assert.equal(f.calls(),2);
  await f.invoke();assert.equal(f.calls(),2);assert.equal(f.read('users/a').aiFreeUsed,1);
});
