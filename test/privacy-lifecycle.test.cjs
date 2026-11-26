const {test}=require('node:test'),assert=require('node:assert/strict');
const {recentlyAuthenticated}=require('../lib/deletion-reauth');
const {putRestriction}=require('../lib/member-restrictions');
test('account deletion requires intent, fresh Google authentication or a matching single-use Kakao code',async()=>{
  const google={uid:'sample',firebase:{sign_in_provider:'google.com'},auth_time:100};
  const now=()=>400000;
  assert.equal(await recentlyAuthenticated(google,{confirm:true},{now}),true);
  assert.equal(await recentlyAuthenticated({...google,auth_time:99},{confirm:true},{now}),false);
  assert.equal(await recentlyAuthenticated(google,{},{now}),false);
  const kakao={uid:'kakao_456',firebase:{sign_in_provider:'custom'},auth_time:400};
  assert.equal(await recentlyAuthenticated(kakao,{confirm:true},{now}),false);
  for(const id of [123,456]){
    const transport=async url=>({ok:true,json:async()=>url.includes('/oauth/token')?{access_token:'fixture'}:{id}});
    assert.equal(await recentlyAuthenticated(kakao,{confirm:true,kakaoCode:'fixture'},{transport}),id===456);
  }
});
test('every cooldown and identifier is scheduled for deletion at the end of the restriction',async()=>{
  const docs=[],batch={set:(_,data)=>docs.push(data),commit:async()=>{}};
  const db={batch:()=>batch,collection:()=>({doc:()=>({})})};
  const admin={firestore:{FieldValue:{serverTimestamp:()=>null}}};
  const result=putRestriction(batch,admin,db,'cooldown',{uid:'fixture',identifiers:['sample']});
  assert.equal(docs.length,4);
  for(const doc of docs)assert.equal(doc.expiresAt.getTime(),result.rejoinAllowedAtMs);
});
