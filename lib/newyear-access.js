'use strict';
const ms=v=>v&&typeof v.toMillis==='function'?v.toMillis():Number(v||0);
function isNewyearRequest(message,history=[],scope){
  if(scope==='newyear')return true;
  const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\u200b-\u200f\ufeff]/g,'').replace(/\s/g,'');
  const test=s=>/(2027|이천이십칠|신년|새해|내년|연간운|년운세|년총운|newyear|nextyear|annualhoroscope|annualfortune|올해.*(전체운|총운|월별)|12개월.*(운|흐름)|열두달.*(운|흐름))/.test(normalize(s));
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
  const matches=o=>o&&o.uid===uid&&o.product==='taekilso_premium_30days'&&o.status==='paid'&&String(o.mul_no||'')&&Number(o.pay_state)===4&&[0,1,4,10].includes(Number(o.lastPayState||0));
  if(user.lastOrderId){const snap=await db.collection('paymentOrders').doc(String(user.lastOrderId)).get();if(snap.exists&&matches(snap.data()))return true;}
  const snap=await db.collection('paymentOrders').where('uid','==',uid).limit(500).get();
  return snap.docs.some(doc=>matches(doc.data()));
}
const REQUIRED={error:'NEWYEAR_PASS_REQUIRED',message:'2027 신년운세와 월별 흐름은 신년상담 이용권에 포함돼요. 이용권을 구매하면 신년 리포트와 30일 상담을 함께 이용할 수 있습니다. 이 질문은 횟수에서 차감하지 않았어요.',usageCharged:false,product:'taekilso_premium_30days',price:8900};
function containsAnnualReading(reply){
  // Requests and answers have different semantics: an answer may explain that
  // annual data was not supplied without delivering a paid annual reading.
  const content=String(reply||'').split(/\n|(?<=[.!?])\s+/).filter(s=>!/(?:제공되지|제공하지|포함하지|포함되지|자료가 없|자료는 없|계산되지|판단할 수 없|해석할 수 없|분석할 수 없|이용권.*필요|구매.*필요)/.test(s)).join('\n');
  return isNewyearRequest(content);
}
module.exports={hasPass,isNewyearRequest,containsAnnualReading,REQUIRED,ms};
