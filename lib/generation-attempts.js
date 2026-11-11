'use strict';
const crypto=require('node:crypto');
const key=(uid,kind)=>crypto.createHash('sha256').update(kind+':'+uid).digest('hex');
// A separate attempt budget is never refunded with customer question credits.
// A fixed document per account/type bounds storage and resets hourly.
async function reserveAttempt(db,uid,kind,{now=Date.now(),limit=30}={}){
 const window=Math.floor(now/3600000),ref=db.collection('aiGenerationAttempts').doc(key(uid,kind));
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref),old=snap.exists?snap.data():{},count=old.window===window?Number(old.count||0):0;
  if(count>=limit)return {allowed:false,retryAfter:Math.max(1,Math.ceil(((window+1)*3600000-now)/1000))};
  tx.set(ref,{window,count:count+1});return {allowed:true};
 });
}
module.exports={reserveAttempt,key};
