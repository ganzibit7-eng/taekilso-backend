'use strict';
const crypto=require('node:crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
async function assertMemberAllowed(db,identity,now=Date.now()){
 if(!identity?.uid)throw Object.assign(new Error('로그인이 필요합니다.'),{status:401,code:'UNAUTHORIZED'});
 const uid=String(identity.uid),ids=[`uid:${uid}`];
 if(identity.email)ids.push(`email:${String(identity.email).trim().toLowerCase()}`);
 if(uid.startsWith('kakao_'))ids.push(`provider:kakao:${uid.slice(6)}`);
 for(const id of ids){
  const key=await db.collection('memberBanKeys').doc(hash(id)).get();
  if(key.exists&&key.data()?.banId){const ban=await db.collection('memberBans').doc(String(key.data().banId)).get();if(ban.exists&&ban.data().active!==false&&!ban.data().unbannedAt&&!ban.data().unbannedAtMs)throw Object.assign(new Error('관리자에 의해 이용이 제한된 계정입니다.'),{status:403,code:'ACCOUNT_BANNED'});}
  for(const collection of ['rejoinBlockKeys','memberRejoinKeys']){const entry=await db.collection(collection).doc(hash(id)).get();if(entry.exists&&Number(entry.data().rejoinAllowedAtMs||entry.data().untilMs||0)>now)throw Object.assign(new Error('회원탈퇴 후 30일 동안은 동일 계정으로 재가입할 수 없습니다.'),{status:403,code:'ACCOUNT_REJOIN_COOLDOWN'});}
 }
 return identity;
}
async function authenticate(req,admin,db,fetchImpl=fetch){
 const bearer=String(req.headers?.authorization||'').trim();let identity;
 if(bearer){
  if(!bearer.startsWith('Bearer ')||bearer.length>8192)return null;
  try{const decoded=await admin.auth().verifyIdToken(bearer.slice(7).trim(),true);if(!decoded?.uid||decoded.firebase?.sign_in_provider==='anonymous')return null;identity={uid:decoded.uid,email:decoded.email,email_verified:decoded.email_verified};}catch(_){return null;}
 }else{
  const token=String(req.headers?.['x-kakao-access-token']||'').trim();if(!token||token.length>4096)return null;
  try{const response=await fetchImpl('https://kapi.kakao.com/v2/user/me',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});if(!response.ok)return null;const me=await response.json();if(!me?.id)return null;identity={uid:'kakao_'+String(me.id)};}catch(_){return null;}
 }
 return assertMemberAllowed(db,identity);
}
module.exports={assertMemberAllowed,authenticate};
