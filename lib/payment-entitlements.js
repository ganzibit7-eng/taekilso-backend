'use strict';
const DAY=86400000, PREMIUM_MS=30*DAY;
const ms=v=>v&&typeof v.toMillis==='function'?v.toMillis():Number(v||0);
const refundStates=new Set([8,32,9,64,70,71]);
function isRefunded(order){return !!order&&(refundStates.has(Number(order.lastPayState))||refundStates.has(Number(order.pay_state))||['cancelled','refunded','partially_refunded'].includes(order.status));}
function isPaidOrder(order,uid){return !!order&&(!uid||order.uid===uid)&&order.status==='paid'&&Number(order.pay_state)===4&&!!String(order.mul_no||'')&&!isRefunded(order)&&[0,1,4,10].includes(Number(order.lastPayState||0));}
function paidAt(order){
 const explicit=ms(order.paidAtMs)||ms(order.paidAt);if(explicit)return explicit;
 // Legacy callbacks stored the provider's immutable Korean payment date.
 const raw=String(order.pay_date||'').replace(/\D/g,'');
 if(/^\d{14}$/.test(raw)){const iso=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T${raw.slice(8,10)}:${raw.slice(10,12)}:${raw.slice(12,14)}+09:00`;const parsed=Date.parse(iso);if(Number.isFinite(parsed))return parsed;}
 // A request's creation time is conservative; mutable updatedAt is NEVER used.
 return ms(order.createdAtMs)||ms(order.createdAt)||0;
}

// A compact FIFO ledger attributes only newly tracked purchases. Existing/admin
// balances remain a distinct unattributed lot, never silently assigned to an order.
function creditLots(user){
 const balance=Math.max(0,Number(user.aiQuestionCredits)||0);
 const lots=(Array.isArray(user.creditLots)?user.creditLots:[]).map(x=>({orderId:String(x.orderId||''),remaining:Math.max(0,Number(x.remaining)||0)})).filter(x=>x.remaining>0);
 let sum=lots.reduce((n,x)=>n+x.remaining,0);
 if(sum<balance)lots.unshift({orderId:'',remaining:balance-sum});
 for(let excess=Math.max(0,sum-balance);excess>0&&lots.length;){const used=Math.min(excess,lots[0].remaining);lots[0].remaining-=used;excess-=used;if(!lots[0].remaining)lots.shift();}
 return lots;
}
function consumeCreditPatch(user){
 const lots=creditLots(user);if(!lots.length)return null;
 const creditOrderId=lots[0].orderId;lots[0].remaining--;const remaining=lots.filter(x=>x.remaining>0);
 return {patch:{aiQuestionCredits:Math.max(0,Number(user.aiQuestionCredits)||0)-1,creditLots:remaining},creditOrderId};
}
function rollbackCreditPatch(user,reservation,order){
 if(reservation.creditOrderId&&(!order||isRefunded(order)))return null;
 const lots=creditLots(user),id=String(reservation.creditOrderId||''),lot=lots.find(x=>x.orderId===id);
 if(lot)lot.remaining++;else lots.unshift({orderId:id,remaining:1});
 return {aiQuestionCredits:Math.max(0,Number(user.aiQuestionCredits)||0)+1,creditLots:lots};
}
function premiumLots(user,now){
 const until=ms(user.premiumUntil),remaining=Math.max(0,until-now);
 if(!remaining||user.premium!==true)return [];
 let lots=(Array.isArray(user.premiumLots)?user.premiumLots:[]).map(x=>({orderId:String(x.orderId||''),remainingMs:Math.max(0,Number(x.remainingMs)||0)})).filter(x=>x.remainingMs>0);
 let elapsed=Math.max(0,now-ms(user.premiumLedgerAt));
 if(!ms(user.premiumLedgerAt))lots=[];
 while(elapsed&&lots.length){const used=Math.min(elapsed,lots[0].remainingMs);lots[0].remainingMs-=used;elapsed-=used;if(!lots[0].remainingMs)lots.shift();}
 const total=lots.reduce((n,x)=>n+x.remainingMs,0);
 if(total<remaining)lots.push({orderId:'',remainingMs:remaining-total});
 // Administrative revocation/reduction wins over the ledger.
 for(let excess=Math.max(0,total-remaining);excess>0&&lots.length;){const i=lots.length-1,used=Math.min(excess,lots[i].remainingMs);lots[i].remainingMs-=used;excess-=used;if(!lots[i].remainingMs)lots.pop();}
 return lots;
}
function grantPatch(user,orderId,product,now){
 if(product==='taekilso_premium_30days'){
  const lots=premiumLots(user,now);lots.push({orderId,remainingMs:PREMIUM_MS});
  return {premium:true,premiumUntil:now+lots.reduce((n,x)=>n+x.remainingMs,0),premiumLots:lots,premiumLedgerAt:now,premiumUsageCount:0};
 }
 const count=product==='ai_question_pack_5'?5:product==='ai_question_pack_10'?10:0;
 const lots=creditLots(user);lots.push({orderId,remaining:count});
 return {aiQuestionCredits:Math.max(0,Number(user.aiQuestionCredits)||0)+count,creditLots:lots};
}
function revokePatch(user,orderId,order,now){
 if(order.product==='taekilso_premium_30days'){
  const lots=premiumLots(user,now),tracked=lots.some(x=>x.orderId===orderId),kept=lots.filter(x=>x.orderId!==orderId),remaining=kept.reduce((n,x)=>n+x.remainingMs,0);
  return {patch:{premium:remaining>0,premiumUntil:remaining?now+remaining:0,premiumLots:kept,premiumLedgerAt:now},needsReview:!tracked&&!order.entitlementVersion&&ms(user.premiumUntil)>now};
 }
 const lots=creditLots(user),tracked=lots.some(x=>x.orderId===orderId),kept=lots.filter(x=>x.orderId!==orderId);
 return {patch:{aiQuestionCredits:kept.reduce((n,x)=>n+x.remaining,0),creditLots:kept},needsReview:!tracked&&!order.entitlementVersion&&Number(user.aiQuestionCredits)>0};
}
module.exports={DAY,PREMIUM_MS,ms,isRefunded,isPaidOrder,paidAt,creditLots,premiumLots,consumeCreditPatch,rollbackCreditPatch,grantPatch,revokePatch};
