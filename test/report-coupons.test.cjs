'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID, createHash} = require('node:crypto');
const coupons = require('../lib/report-coupons');
const {authenticate} = require('../lib/member-access');
const {ADMIN_EMAIL} = require('../lib/admin-access');
const {anniversary} = require('../lib/report-retention');
const admin = {uid:'operator', email:ADMIN_EMAIL, signInProvider:'google.com', email_verified:true};
const member = {uid:'synthetic-member'}, other = {uid:'another-member'};
const products = ['seohwa_story','dogyeom_story','ijun_story','mujin_story','date','relationship','newyear_2027'].map(key => 'taekilso_' + key + '_report');

function fixture() {
  const rows = new Map([['users/'+member.uid, {}], ['users/'+other.uid, {}]]);
  const snapshot = key => ({id:key.split('/').pop(), ref:{key}, exists:rows.has(key), data:()=>rows.get(key)});
  function collection(path) {
    const query = {doc(id) {
      const key = path + '/' + id;
      return {key, get:async () => snapshot(key), delete:async()=>rows.delete(key), collection:name=>collection(key+'/'+name)};
    },where(field,op,value) {
      assert.equal(op, '==');
      this.filter = row=>row[field] === value; return this;
    },orderBy(field,dir) {
      assert.equal(dir, 'desc');
      this.compare = (a,b)=>rows.get(b)[field] - rows.get(a)[field]; return this;
    },startAfter(snap) {this.cursor=snap.id;return this;},limit(n) {this.cap=n;return this;},async get() {
      let keys = [...rows.keys()].filter(key =>
        key.slice(0,key.lastIndexOf('/')) === path && (!this.filter || this.filter(rows.get(key))));
      if (this.compare) keys.sort(this.compare);
      if (this.cursor) keys = keys.slice(keys.indexOf(path+'/'+this.cursor)+1);
      return {empty:!keys.length,docs:keys.slice(0,this.cap ?? keys.length).map(snapshot)};
    }};
    return query;
  }
  // Serializable, buffered commits. Rejected transactions leave every document unchanged.
  let queue = Promise.resolve();
  const db = {collection, batch(){
    const keys=[];
    return {delete:ref=>keys.push(ref.key),commit:async()=>keys.forEach(key=>rows.delete(key))};
  },runTransaction(fn) {
    const job = queue.then(async () => {
      const writes = [];
      const result = await fn({
        get:async ref => {assert.equal(writes.length,0,'reads must precede writes');return snapshot(ref.key);},
        set:(ref,value,opts)=>writes.push(()=>rows.set(ref.key, opts?.merge ? {...rows.get(ref.key), ...value} : {...value})),
        delete:ref=>writes.push(()=>rows.delete(ref.key))
      });
      writes.forEach(write=>write());
      return result;
    });
    queue=job.catch(()=>{});
    return job;
  }};
  let now=Date.UTC(2026,10,26,8);
  const run=(who,request)=>coupons.run(db,who,request,()=>now);
  const issue=(overrides={})=>run(admin,{action:'issue',product:products[0],requestId:randomUUID(),...overrides});
  const redeem=(who,code)=>run(who,{action:'redeem',code});
  return {db,rows,run,issue,redeem,get now(){return now;},advance:ms=>{now+=ms;}};
}

test('7 report products can be issued and listed with only metadata and a four-symbol hint',async()=>{
  const f=fixture();
  const codes=[];
  for(const product of products) {
    const result=await f.issue({product});
    assert.match(result.code,/^(?:[0-9A-HJKMNP-TV-Z]{4}-){3}[0-9A-HJKMNP-TV-Z]{4}$/);
    assert.equal(result.coupon.hint,result.code.slice(-4));
    assert.equal(result.coupon.expiresAtMs, f.now+30*86400000);
    assert.equal(result.coupon.product,product);
    assert.equal(result.coupon.status,'issued');
    const raw=result.code.replaceAll('-','');
    const digest=createHash('sha256').update(raw).digest('hex');
    assert.deepEqual(f.rows.get('reportCouponKeys/'+digest),{couponId:result.coupon.couponId});
    codes.push(raw);
  }
  assert.equal(new Set(codes).size,7);
  const listed=await f.run(admin,{action:'list'});
  assert.equal(listed.coupons.length,7);
  const stored=JSON.stringify([...f.rows])+JSON.stringify(listed);
  for(const code of codes) assert(!stored.includes(code) && !stored.includes(code.match(/.{4}/g).join('-')));
});

test('previously issued long codes redeem through their original lookup and remain single-account',async()=>{
  const f=fixture(), id=randomUUID(), raw='ABCD1234'.repeat(4);
  f.rows.set('reportCouponKeys/'+createHash('sha256').update(raw).digest('hex'),{couponId:id});
  f.rows.set('reportCoupons/'+id,{status:'issued',product:products[0],issuedAtMs:f.now,hint:raw.slice(-4)});
  const pass=await f.redeem(member,raw.toLowerCase().match(/.{4}/g).join('-'));
  assert.equal(pass.pass.couponId,id);
  await assert.rejects(f.redeem(other,raw),{code:'COUPON_UNAVAILABLE'});
});

test('only the verified Google administrator may issue, list or revoke and client-supplied privileges are ignored',async()=>{
  const f=fixture();
  for(const action of ['issue','list','revoke']) {
    const input={action,admin:true,uid:admin.uid,product:products[0],requestId:randomUUID()};
    await assert.rejects(f.run(null,input),{status:401});
    for(const who of [member,{...admin,email_verified:false},{...admin,signInProvider:'custom'},{...admin,email:'other@example.com'}]) {
      await assert.rejects(f.run(who,input),{status:403});
    }
  }
  for(const product of ['premium','ai_questions_10','nonexistent',null]) {
    await assert.rejects(f.issue({product}),{code:'INVALID_PRODUCT'});
  }
  for(const validDays of [0,-1,366,1.1,'30']) await assert.rejects(f.issue({validDays}),{code:'INVALID_VALIDITY'});
  await assert.rejects(f.issue({requestId:'invalid'}),{code:'INVALID_COUPON_ID'});
  assert.equal(f.rows.size,2);
});

test('ban enforced by the same verified-token middleware used on the coupon route',async()=>{
  const f=fixture();
  const identityHash=createHash('sha256').update('uid:'+member.uid).digest('hex');
  f.rows.set('memberBanKeys/'+identityHash,{banId:'test-ban'});
  f.rows.set('memberBans/test-ban',{active:true});
  const sdk={auth:()=>({verifyIdToken:async(token,checkRevoked)=>{
    assert.equal(checkRevoked,true);assert.equal(token,'synthetic');
    return {uid:member.uid,firebase:{sign_in_provider:'google.com'}};
  }})};
  await assert.rejects(authenticate({headers:{authorization:'Bearer synthetic'}},sdk,f.db),{code:'ACCOUNT_BANNED'});
});

test('coupon endpoint requires the current Firebase session even for a Kakao login',async()=>{
  const handle = require('../api/report-coupons');
  const response = {headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.code=code;return this;},json(body){this.body=body;}};
  await handle({method:'POST',headers:{'x-kakao-access-token':'synthetic-provider-token'},body:{action:'wallet'}},response);
  assert.equal(response.code,401);
  assert.equal(response.body.error,'UNAUTHORIZED');
  assert.equal(response.headers['Cache-Control'],'no-store');
});

test('admin can reach and revoke older codes beyond the first page',async()=>{
  const f=fixture(), all=[];
  for(let i=0;i<53;i++) {
    all.push((await f.issue()).coupon.couponId);
    f.advance(1);
  }
  const first=await f.run(admin,{action:'list'});
  assert.equal(first.coupons.length,50);
  const second=await f.run(admin,{action:'list',cursor:first.nextCursor});
  assert.deepEqual(second.coupons.map(c=>c.couponId),[all[2],all[1],all[0]]);
  assert.equal(second.nextCursor,null);
  assert.equal((await f.run(admin,{action:'revoke',couponId:second.coupons[2].couponId})).coupon.status,'revoked');
});

test('concurrent issuer retries mint one code, and concurrent redemption assigns one pass to exactly one member',async()=>{
  const f=fixture(),requestId=randomUUID();
  const issues=await Promise.allSettled([f.issue({requestId}),f.issue({requestId})]);
  const issued=issues.find(it=>it.status==='fulfilled').value;
  assert.equal(issues.find(it=>it.status==='rejected').reason.code,'COUPON_ALREADY_ISSUED');
  const claims=await Promise.allSettled([f.redeem(member,issued.code.toLowerCase().replaceAll('-',' ')),f.redeem(other,issued.code)]);
  assert.equal(claims[0].value.alreadyRedeemed,false);
  assert.equal(claims[1].reason.code,'COUPON_UNAVAILABLE');
  const retry=await f.redeem(member,issued.code);
  assert.equal(retry.alreadyRedeemed,true);
  assert.deepEqual(retry.pass,claims[0].value.pass);
  assert.equal(retry.pass.expiresAtMs,anniversary(f.now));
  assert.deepEqual((await f.run(member,{action:'wallet'})).passes,[retry.pass]);
  assert.deepEqual((await f.run(other,{action:'wallet'})).passes,[]);
  assert.equal((await f.run(admin,{action:'list'})).coupons[0].status,'redeemed');
  await assert.rejects(f.run(admin,{action:'revoke',couponId:requestId}),{code:'COUPON_NOT_REVOCABLE'});
  const globals=[...f.rows].filter(([key])=>!key.startsWith('users/'));
  assert(!JSON.stringify(globals).includes(member.uid));
  assert(!JSON.stringify(globals).includes(other.uid));
  assert.deepEqual([...new Set(globals.map(([key])=>key.split('/')[0]))].sort(),['reportCouponKeys','reportCoupons']);
  f.advance(retry.pass.expiresAtMs-f.now);
  assert.deepEqual((await f.run(member,{action:'wallet'})).passes,[]);
  await assert.rejects(f.redeem(member,issued.code),{code:'COUPON_UNAVAILABLE'});
});

test('expiry, missing profiles and competing revocations never consume a coupon',async()=>{
  const f=fixture(), expiring=await f.issue({validDays:1});
  await assert.rejects(f.redeem({uid:'missing'},expiring.code),{code:'PROFILE_NOT_READY'});
  f.advance(86400000);
  await assert.rejects(f.redeem(member,expiring.code),{code:'COUPON_UNAVAILABLE'});
  assert.equal((await f.run(admin,{action:'list'})).coupons[0].status,'expired');
  const open=await f.issue({validDays:null});
  assert.equal(open.coupon.expiresAtMs,null);
  const revoke={action:'revoke',couponId:open.coupon.couponId};
  const both=await Promise.allSettled([f.run(admin,revoke),f.redeem(member,open.code)]);
  assert.equal(both[0].value.coupon.status,'revoked');
  assert.equal(both[1].reason.code,'COUPON_UNAVAILABLE');
  assert.deepEqual(await f.run(admin,revoke),both[0].value);
  assert.deepEqual((await f.run(member,{action:'wallet'})).passes,[]);
});

test('failed registration attempts are bounded per member and release automatically',async()=>{
  const f=fixture(), issued=await f.issue();
  await assert.rejects(f.redeem(member,'A-'),{status:400});
  for(let i=0;i<12;i++) await assert.rejects(f.redeem(member,'Z'.repeat(32)),{status:409});
  await assert.rejects(f.redeem(member,issued.code),{status:429});
  assert.equal((await f.run(admin,{action:'list'})).coupons[0].status,'issued');
  f.advance(600000);
  assert.equal((await f.redeem(member,issued.code)).pass.product,products[0]);
});

test('withdrawal removes wallet and account checks, while rejoining cannot replay a redeemed code',async()=>{
  const f=fixture(), issued=await f.issue();
  await f.redeem(member,issued.code);
  await assert.rejects(f.redeem(member,'Z'.repeat(32)),{code:'COUPON_UNAVAILABLE'});
  await require('../api/_ban').deleteUserData(f.db,member.uid);
  assert(![...f.rows.keys()].some(key=>key.startsWith('users/'+member.uid)));
  assert.equal(f.rows.get('reportCoupons/'+issued.coupon.couponId).status,'redeemed');
  f.rows.set('users/'+member.uid,{});
  assert.deepEqual((await f.run(member,{action:'wallet'})).passes,[]);
  await assert.rejects(f.redeem(member,issued.code),{code:'COUPON_UNAVAILABLE'});
});
