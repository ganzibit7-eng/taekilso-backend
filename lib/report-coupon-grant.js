'use strict';
const {isPaidOrder,isRefunded}=require('./payment-entitlements');
const retention=require('./report-retention');

const validId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);
const passRef=(user,id)=>user.collection('reportCouponPasses').doc(id);
const fail=(code,message)=>Object.assign(new Error(message),{status:409,code});

async function verifyUsed(user,passId,product,reportId,get,now) {
  if(!validId(passId))return false;
  const pass=(await get(passRef(user,passId))).data();
  return pass?.product===product && pass.state==='used' && pass.reportId===reportId && retention.expiresAtMs(pass)>now;
}

async function ensurePaymentSettled(db,tx,user,stored,config,id,now) {
  if(!stored?.orderId)return;
  const order=(await tx.get(db.collection('paymentOrders').doc(stored.orderId))).data();
  if(order?.uid===user.id && order.product===config.product && order[config.orderKey]===id &&
      !order.entitlementReviewRequired && (isRefunded(order) || isPaidOrder(order,user.id) &&
        order.entitlementGranted===true && order.reportExpiresAtMs>0 && order.reportExpiresAtMs<=now))return;
  throw fail('REPORT_PAYMENT_IN_PROGRESS','이 리포트의 기존 결제 상태를 먼저 확인해 주세요. 쿠폰은 그대로 보관돼요.');
}

async function applyPass(tx,user,passId,product,reportId,now) {
  if(!validId(passId))throw fail('REPORT_COUPON_UNAVAILABLE','사용할 리포트 쿠폰을 다시 선택해 주세요.');
  const ref=passRef(user,passId),pass=(await tx.get(ref)).data();
  if(pass?.product!==product || pass.state!=='available' || !(retention.expiresAtMs(pass)>now)){
    throw fail('REPORT_COUPON_UNAVAILABLE','이 리포트에 사용할 수 있는 쿠폰을 찾지 못했어요.');
  }
  tx.update(ref,{state:'used',reportId,usedAtMs:now});
  return {couponGrantId:passId,[retention.FIELD]:new Date(retention.expiresAtMs(pass))};
}

module.exports={verifyUsed,ensurePaymentSettled,applyPass};
