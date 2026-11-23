'use strict';
const crypto = require('node:crypto');
const {YEAR} = require('./newyear-calculation');
const {isPaidOrder,isRefunded} = require('./payment-entitlements');
const retention = require('./report-retention');

const comparison={year:YEAR};
const id=crypto.createHash('sha256').update(JSON.stringify(comparison)).digest('hex');
const CONFIG={
  product:'taekilso_newyear_2027_report',price:6900,name:'2027 신년운세 리포트',
  collection:'newyearPurchases',orderKey:'newyearPurchaseId',storyReport:true,
  validate:()=>comparison,calculate:()=>comparison
};
const orders=db=>db.collection('paymentOrders');
const purchase=(db,uid)=>db.collection('users').doc(uid).collection(CONFIG.collection).doc(id);
const belongs=(order,uid)=>order?.uid===uid&&order.product===CONFIG.product&&order.amount===CONFIG.price&&order[CONFIG.orderKey]===id;
const paid=(order,uid)=>belongs(order,uid)&&isPaidOrder(order,uid)&&order.entitlementGranted===true&&!order.entitlementReviewRequired;

async function grant(db,uid,tx,now=Date.now()) {
  const get=ref=>tx?tx.get(ref):ref.get();
  const stored=(await get(purchase(db,uid))).data();
  if(!stored?.ready||!stored.paidOrderId||retention.expired(stored,now))return null;
  const order=(await get(orders(db).doc(stored.paidOrderId))).data();
  if(!paid(order,uid)||order.reportExpiresAtMs>0&&order.reportExpiresAtMs<=now)return null;
  return {orderId:stored.paidOrderId,...retention.display(stored)};
}
const entitled=async (...args)=>Boolean(await grant(...args));

async function latestOrder(db,uid){
  return (await purchase(db,uid).get()).data()?.orderId||null;
}

async function paymentState(db,uid,orderId,now=Date.now()){
  if(typeof orderId!=='string'||orderId.length>150||!/^TAK-[A-Z0-9]+-[A-Z0-9]+$/.test(orderId))return 'missing';
  const order=(await orders(db).doc(orderId).get()).data();
  if(!belongs(order,uid))return 'missing';
  if(isRefunded(order))return 'cancelled';
  if(paid(order,uid))return order.reportExpiresAtMs>0&&order.reportExpiresAtMs<=now?'expired':'paid';
  return order.status==='pending'?'pending':'review';
}

module.exports={CONFIG,id,comparison,entitled,grant,latestOrder,paymentState};
