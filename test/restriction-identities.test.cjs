const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {restrictionIdentifiers}=require('../lib/restriction-identities');
const {buildIdentifiers,createRejoinCooldown,createPermanentBan}=require('../api/_ban');
const {assertMemberAllowed}=require('../lib/member-access');
function fixture(){const rows=new Map();const ref=(c,id)=>({key:c+'/'+id,async get(){const d=rows.get(this.key);return {exists:!!d,data:()=>d}}});const db={collection:c=>({doc:id=>ref(c,id)}),batch:()=>({set(r,d){rows.set(r.key,d);return this},async commit(){}})};return {db,rows};}
test('only verified email and trusted provider IDs become global restriction keys',()=>{
 const ids=restrictionIdentifiers('A',{email:'victim@example.test',email_verified:false},{email:'also-victim@example.test',emailVerified:false,providerData:[{providerId:'google.com',uid:'trusted-A',email:'forged@example.test'}]});
 assert.deepEqual(ids,['uid:A','provider:google.com:trusted-A']);
 assert(restrictionIdentifiers('A',{email:' A@EXAMPLE.TEST ',email_verified:true}).includes('email:a@example.test'));
 assert(restrictionIdentifiers('kakao_42').includes('provider:kakao:42'));
});
test('editing A profile cannot impose cooldown or permanent ban on B',async()=>{
 for(const permanent of [false,true]){const f=fixture();f.rows.set('users/A',{email:'b@example.test',provider:'google.com',providerUid:'B',kakaoId:'B'});
 const admin={auth:()=>({getUser:async()=>({uid:'A',email:'a@example.test',emailVerified:true,providerData:[{providerId:'google.com',uid:'A'}]})}),firestore:{FieldValue:{serverTimestamp:()=>0}}};
 const identifiers=await buildIdentifiers(admin,f.db,'A',{email:'a@example.test',email_verified:true});
 assert(!identifiers.some(x=>x.includes('b@example')||x.endsWith(':B')));
 if(permanent)await createPermanentBan(admin,f.db,{uid:'A',identifiers});else await createRejoinCooldown(admin,f.db,{uid:'A',identifiers});
 await assertMemberAllowed(f.db,{uid:'B',email:'b@example.test',email_verified:true});
 await assert.rejects(assertMemberAllowed(f.db,{uid:'A',email:'a@example.test',email_verified:true}));
 assert(!f.rows.has('rejoinBlockKeys/'+crypto.createHash('sha256').update('email:b@example.test').digest('hex')));
 }
});
test('authoritative identity lookup failure aborts before restriction writes',async()=>{
 await assert.rejects(buildIdentifiers({auth:()=>({getUser:async()=>{throw Error('offline')}})},{},'A'),/offline/);
});
