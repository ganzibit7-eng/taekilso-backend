'use strict';
const {kst}=require('./visitor-events');
async function recordMilestone(db,uid,field,metadata={},now=Date.now()){
 if(!db||!uid||!['firstAiAnswers','freeLimitExhausted'].includes(field))return false;
 const user=db.collection('users').doc(uid);
 return db.runTransaction(async tx=>{
  const snap=await tx.get(user);if(!snap.exists)return false;const data=snap.data()||{};
  if(String(data.email||'').toLowerCase()==='green092432@gmail.com'||data.analyticsMilestones?.[field])return false;
  const date=kst(now),daily=db.collection('dailyFunnel').doc(date),slug=/^[a-z0-9][a-z0-9-]{0,49}$/.test(metadata?.seoSlug||'')?metadata.seoSlug:null;
  const dailySnap=await tx.get(daily),seo=slug?db.collection('dailySeoLanding').doc(date+'__'+slug):null,seoSnap=seo?await tx.get(seo):null;
  tx.set(user,{analyticsMilestones:{...(data.analyticsMilestones||{}),[field]:now}},{merge:true});
  tx.set(daily,{date,[field]:Number(dailySnap.data()?.[field]||0)+1},{merge:true});
  if(seo)tx.set(seo,{date,slug,[field]:Number(seoSnap.data()?.[field]||0)+1},{merge:true});
  return true;
 });
}
module.exports={recordMilestone};
