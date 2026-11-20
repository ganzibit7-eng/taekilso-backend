'use strict';
const {isPaidOrder}=require('./payment-entitlements');
const ms=v=>v&&typeof v.toMillis==='function'?v.toMillis():Number(v||0);
function isNewyearRequest(message,history=[],scope,allowMoving=true){
  if(scope==='newyear')return true;
  const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\u200b-\u200f\ufeff]/g,'').replace(/\s/g,'');
  const test=s=>/(2027|이천이십칠|신년|새해|내년|연간운|년운세|년총운|newyear|nextyear|annualhoroscope|annualfortune|올해.*(전체운|총운|월별)|12개월.*(운|흐름)|열두달.*(운|흐름))/.test(normalize(s));
  const moving=require('./moving-month');
  if(allowMoving && (moving.saleRequest(message,history)||moving.standalone(moving.request(message,history))))return false;
  if(test(message))return true;
  return /^(그럼|그러면|그때|그달|월별|몇월|좋은달|주의할달|더자세)/.test(normalize(message))&&Array.isArray(history)&&history.slice(-6).some(x=>x&&test(x.content));
}
async function hasPass(db,uid,user,isAdmin,now=Date.now()){
  if(isAdmin)return true;
  if(!user||user.premium!==true||ms(user.premiumUntil)<=now)return false;
  if(user.grantedByAdmin===true&&user.lastVerificationMethod==='admin-grant')return true;
  // Credits and client claims never unlock annual consultation. Require a paid premium order.
  // JS PayApp first notifies state 1 (request), and virtual accounts can notify
  // state 10 (waiting). Older paid callbacks left that preliminary field intact.
  // A server-confirmed paid order/state 4 is authoritative over those two
  // preliminary states; cancellations, partial cancellations and unknown states
  // must still fail. Client premium flags and pending orders remain insufficient.
  const matches=o=>isPaidOrder(o,uid)&&o.product==='taekilso_premium_30days'&&!o.entitlementReviewRequired;
  if(user.lastOrderId){const snap=await db.collection('paymentOrders').doc(String(user.lastOrderId)).get();if(snap.exists&&matches(snap.data()))return true;}
  const snap=await db.collection('paymentOrders').where('uid','==',uid).get();
  return snap.docs.some(doc=>matches(doc.data()));
}
const {CONFIG}=require('./newyear-purchase');
const REQUIRED={error:'NEWYEAR_PASS_REQUIRED',message:'2027년 전체 운세와 월별 흐름은 신년운세 리포트에서 확인할 수 있어요. 이 질문은 횟수에서 차감하지 않았어요.',usageCharged:false,product:CONFIG.product,price:CONFIG.price};
function containsAnnualReading(reply){
  // Requests and answers have different semantics: an answer may explain that
  // annual data was not supplied without delivering a paid annual reading.
  const content=String(reply||'').split(/\n|(?<=[.!?])\s+/).filter(s=>!/(?:제공되지|제공하지|포함하지|포함되지|자료가 없|자료는 없|계산되지|판단할 수 없|해석할 수 없|분석할 수 없|이용권.*필요|구매.*필요)/.test(s)).join('\n');
  return isNewyearRequest(content,[],undefined,false);
}
module.exports={hasPass,isNewyearRequest,containsAnnualReading,REQUIRED,ms};
