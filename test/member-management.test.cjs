'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {withdraw, retryWithdrawal, listRestrictions, release} = require('../lib/member-restrictions');
const {assertMemberAllowed} = require('../lib/member-access');
const {makeHandler} = require('../api/admin-member-security');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const actor = {uid:'operator', email:'green092432@gmail.com', email_verified:true, firebase:{sign_in_provider:'google.com'}, auth_time:Math.floor(Date.now()/1000)};
const google = {uid:'old', email:'test@example.test', emailVerified:true, displayName:'테스트', providerData:[{providerId:'google.com',uid:'stable-google'}]};
const freshGoogle = {uid:'new',firebase:{identities:{'google.com':['stable-google']}}};

function fixture(users=[google], current=actor) {
  const rows = new Map(), identities = new Map(users.map(u=>[u.uid,{...u}]));
  const ref = (name,id) => ({id,path:name+'/'+id, async get(){const value=rows.get(this.path);return {id,ref:this,exists:value!==undefined,data:()=>value};}});
  function query(name, predicates=[]) {
    return {doc:id=>ref(name,id), where:(k,op,v)=>query(name,[...predicates,[k,op,v]]),limit(){return this;},orderBy(){return this;},
      async get(){
        const docs=[];
        for (const [path,row] of rows) {
          const parts=path.split('/');
          if(parts.length!==2 || parts[0]!==name || !predicates.every(([k,op,v])=>op==='=='?row[k]===v:row[k]>v)) continue;
          docs.push(await ref(name,parts[1]).get());
        }
        return {docs,empty:!docs.length,size:docs.length};
      }};
  }
  const writer = () => {
    const operations=[];
    return {get:r=>r.get(), set(r,d,opt){operations.push(()=>rows.set(r.path,opt?.merge?{...rows.get(r.path),...d}:d));}, delete(r){operations.push(()=>rows.delete(r.path));},async commit(){operations.forEach(op=>op());}};
  };
  const db = {collection:query,batch:writer,async runTransaction(fn){const tx=writer();const result=await fn(tx);await tx.commit();return result;}};
  const sdk = {apps:[{}],firestore:()=>db,auth:()=>({
    async verifyIdToken(token,revoked){assert.equal(revoked,true);return current;},
    async getUser(uid){if(!identities.has(uid))throw Object.assign(Error('missing'),{code:'auth/user-not-found'});return identities.get(uid);},
    async updateUser(uid,patch){Object.assign(identities.get(uid),patch);},
    async deleteUser(uid){identities.delete(uid);}
  })};
  sdk.firestore.FieldValue={serverTimestamp:()=>Date.now()};
  const purge = async(db,uid)=>{for(const k of [...rows.keys()])if(k==='users/'+uid || k.startsWith('users/'+uid+'/'))rows.delete(k);};
  return {rows,identities,db,sdk,purge,async request(body){
    const res={setHeader(){},status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}};
    await makeHandler(sdk,purge)({method:'POST',headers:{authorization:'Bearer token'},body},res);return res;
  }};
}

test('forced withdrawal, verified provider blocks a new Google UID, protected records survive, release allows the same identity', async()=>{
  const f=fixture();
  for(const [k,v] of [['users/old',{}], ['users/old/sajuProfiles/mine',{}], ['inquiries/general',{ownerUid:'old',source:'general-firebase'}],
    ['inquiries/dispute',{ownerUid:'old',source:'general-firebase',legalHold:true}], ['paymentOrders/paid',{uid:'old'}]])f.rows.set(k,v);
  const r=await f.request({action:'force_delete',uid:'old',confirmUid:'old'});
  assert.equal(r.statusCode,200);assert.equal(r.body.permanentlyBanned,true);
  assert.equal(f.identities.has('old'),false);assert(!f.rows.has('users/old/sajuProfiles/mine'));assert(!f.rows.has('inquiries/general'));
  assert(f.rows.has('paymentOrders/paid'));assert(f.rows.has('inquiries/dispute'));
  assert.equal((await listRestrictions(f.db)).length,1);
  const repeat=await f.request({action:'force_delete',uid:'old',confirmUid:'old'});assert.equal(repeat.body.banId,r.body.banId);
  await assert.rejects(assertMemberAllowed(f.db,freshGoogle),{code:'ACCOUNT_BANNED'});
  assert.equal((await f.request({action:'unban_user',banId:r.body.banId})).statusCode,200);
  await assertMemberAllowed(f.db,freshGoogle);assert.equal((await listRestrictions(f.db)).length,0);
  const cutoff=f.rows.get('rejoinBlockKeys/SESSION-'+hash('uid:old'));assert(cutoff.revokedAuthTimeThrough);assert(cutoff.expiresAt>Date.now());
});

test('voluntary 30-day block is listed once without raw email, verified identifier lookup and early release work across both mirrors',async()=>{
  const f=fixture();
  const job=await withdraw(f.sdk,f.db,{uid:'old',decoded:{uid:'old'},deleteUserData:f.purge});
  const bans=await listRestrictions(f.db,'TEST@example.test');
  assert.equal(bans.length,1);assert.equal(bans[0].banId,job.id);assert.equal(bans[0].kind,'cooldown');assert.equal(bans[0].email,'');
  assert.ok(Math.abs(bans[0].rejoinAllowedAtMs-Date.now()-30*86400000)<5000);
  await assert.rejects(assertMemberAllowed(f.db,freshGoogle),{code:'ACCOUNT_REJOIN_COOLDOWN'});
  await release(f.sdk,f.db,'cooldown',job.id,actor);await assertMemberAllowed(f.db,freshGoogle);
  for (const [key,value] of f.rows) assert.notEqual(value.blockId,job.id,key);
});

test('legacy alternate-only restriction, stale owner and calendar expiry',async()=>{
  const f=fixture();
  const untilMs=Date.now()+60000, hashA=hash('uid:old'),hashB=hash('uid:other');
  f.rows.set('memberRejoinBlocks/r',{uid:'old',untilMs,keyHashes:[hashA,hashB]});
  f.rows.set('memberRejoinKeys/'+hashA,{uid:'old',blockId:'r',untilMs});
  f.rows.set('memberRejoinKeys/'+hashB,{uid:'other',blockId:'newer',untilMs});
  f.rows.set('memberRejoinBlocks/expired',{uid:'gone',untilMs:Date.now()-100});
  assert.deepEqual((await listRestrictions(f.db)).map(b=>b.banId),['r']);
  await assert.rejects(assertMemberAllowed(f.db,{uid:'old'}),{code:'ACCOUNT_REJOIN_COOLDOWN'});
  assert.equal(await release(f.sdk,f.db,'cooldown','r',actor),true);
  await assertMemberAllowed(f.db,{uid:'old'});
  await assert.rejects(assertMemberAllowed(f.db,{uid:'other'}),{code:'ACCOUNT_REJOIN_COOLDOWN'});
});

test('partial cleanup remains restricted and can be safely resumed without duplicating records',async()=>{
  const f=fixture([{uid:'kakao_123',providerData:[]}]);
  await assert.rejects(withdraw(f.sdk,f.db,{uid:'kakao_123',actor,deleteUserData:async()=>{throw Error('transient');}}),/transient/);
  assert.equal(f.identities.get('kakao_123').disabled,true);
  const [record]=await listRestrictions(f.db);assert.equal(record.deletionPending,true);
  await assert.rejects(release(f.sdk,f.db,'permanent',record.banId,actor),{code:'DELETION_PENDING'});
  const bad=await f.request({action:'retry_withdrawal',banId:record.banId,confirmUid:'someone-else'});assert.equal(bad.statusCode,403);
  const r=await f.request({action:'retry_withdrawal',banId:record.banId,confirmUid:'kakao_123'});assert.equal(r.statusCode,200);
  const remaining=await listRestrictions(f.db);assert.equal(remaining.length,1);assert.equal(remaining[0].deletionPending,false);
  await assert.rejects(assertMemberAllowed(f.db,{uid:'kakao_123'}),{code:'ACCOUNT_BANNED'});
  assert.equal(await release(f.sdk,f.db,'permanent',record.banId,actor),true);await assertMemberAllowed(f.db,{uid:'kakao_123'});
});

test('normal member, unverified admin, wrong provider, stale reauthentication, wrong subject and administrator target cannot delete',async()=>{
  const request={action:'force_delete',uid:'old',confirmUid:'old'};
  for(const replacement of [{email:'other@example.test'},{email_verified:false},{firebase:{sign_in_provider:'password'}},{auth_time:actor.auth_time-600}]){
    const f=fixture([google],{...actor,...replacement});assert.equal((await f.request(request)).statusCode,403);
    assert.equal(f.rows.size,0);assert(f.identities.has('old'));
  }
  for(const [uid,users] of [['operator',[]],['another-admin',[{uid:'another-admin',email:actor.email,emailVerified:true}]]]){
    const f=fixture(users);assert.equal((await f.request({...request,uid,confirmUid:uid})).statusCode,403);assert.equal(f.rows.size,0);
  }
  assert.equal((await fixture().request({...request,confirmUid:'other'})).statusCode,403);
});

test('admin can clean up an orphan profile by its real UID without linking another user via its editable email',async()=>{
  const f=fixture([]);
  f.rows.set('users/orphan',{email:'unrelated@example.test',provider:'google.com',providerUid:'unrelated'});
  const r=await f.request({action:'force_delete',uid:'orphan',confirmUid:'orphan'});
  assert.equal(r.statusCode,200);assert.equal(r.body.identityScope,'previous_uid');assert(!f.rows.has('users/orphan'));
  await assert.rejects(assertMemberAllowed(f.db,{uid:'orphan'}),{code:'ACCOUNT_BANNED'});
  await assertMemberAllowed(f.db,{uid:'new',email:'unrelated@example.test',email_verified:true});
  const missing=await f.request({action:'force_delete',uid:'missing',confirmUid:'missing'});
  assert.equal(missing.statusCode,404);
});

test('short-lived session marker is not renewed by repeated release; no member information remains in released ban record',async()=>{
  const f=fixture();
  const {body}=await f.request({action:'force_delete',uid:'old',confirmUid:'old'});
  await f.request({action:'unban_user',banId:body.banId});
  const key='rejoinBlockKeys/SESSION-'+hash('uid:old');
  const cutoff=f.rows.get(key);
  assert.equal(f.rows.has('memberBans/'+body.banId),false);
  assert.equal((await f.request({action:'unban_user',banId:body.banId})).statusCode,200);
  assert.deepEqual(f.rows.get(key),cutoff);
});

test('self deletion repair remains available after TTL, with no identifier hashes and without deleting a rejoined Kakao user',async()=>{
  for (const recreated of [false,true]) {
    const f=fixture([{uid:'kakao_3',providerData:[],metadata:{creationTime:new Date(Date.now()-100000).toUTCString()}}]);
    await assert.rejects(withdraw(f.sdk,f.db,{uid:'kakao_3',decoded:{uid:'kakao_3'},deleteUserData:async()=>{throw Error('temporary');}}));
    const [pending]=await listRestrictions(f.db);
    const repair=f.rows.get('memberWithdrawalRepairs/'+pending.banId);
    assert(!repair.keyHashes);assert(!repair.email);
    repair.rejoinAllowedAtMs=Date.now()-1000;
    if (recreated) f.identities.set('kakao_3',{uid:'kakao_3',metadata:{creationTime:new Date(Date.now()+90000).toUTCString()}});
    for(const name of ['rejoinBlocks','memberRejoinBlocks'])f.rows.delete(name+'/'+pending.banId);
    const [expired]=await listRestrictions(f.db);
    assert.equal(expired.deletionPending,true);
    const r=await f.request({action:'retry_withdrawal',kind:'cooldown',banId:expired.banId,confirmUid:'kakao_3'});
    assert.equal(r.statusCode,200);
    assert.equal(f.rows.has('memberWithdrawalRepairs/'+pending.banId),false);
    assert.equal(f.identities.has('kakao_3'),recreated);
  }
});

test('API rejects stale Firebase bearer after early release and accepts fresh reauthentication and current Kakao OAuth',async()=>{
  const f=fixture();
  const {body}=await f.request({action:'force_delete',uid:'old',confirmUid:'old'});
  await f.request({action:'unban_user',banId:body.banId});
  const cutoff=f.rows.get('rejoinBlockKeys/SESSION-'+hash('uid:old')).revokedAuthTimeThrough;
  await assert.rejects(assertMemberAllowed(f.db,{uid:'old',auth_time:cutoff}),{code:'TOKEN_REVOKED'});
  await assertMemberAllowed(f.db,{uid:'old',auth_time:cutoff+1});
  await assertMemberAllowed(f.db,{uid:'old'});
});

test('new UID cannot replace an existing restriction on the same verified provider and email',async()=>{
  const f=fixture();
  const r=await f.request({action:'force_delete',uid:'old',confirmUid:'old'});
  f.identities.set('new',{...google,uid:'new'});
  await assert.rejects(withdraw(f.sdk,f.db,{uid:'new',decoded:{uid:'new'},deleteUserData:f.purge}),{code:'ALREADY_RESTRICTED'});
  assert.equal((await f.request({action:'force_delete',uid:'new',confirmUid:'new'})).statusCode,409);
  assert.equal(f.rows.get('memberBanKeys/'+hash('provider:google.com:stable-google')).banId,r.body.banId);
});
