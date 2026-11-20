'use strict';
const crypto = require('node:crypto');
const {YEAR} = require('./newyear-calculation');
const {isPaidOrder,isRefunded} = require('./payment-entitlements');

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

async function entitled(db,uid,tx) {
  const get=ref=>tx?tx.get(ref):ref.get();
  const stored=(await get(purchase(db,uid))).data();
  if(!stored?.ready||!stored.paidOrderId)return false;
  return paid((await get(orders(db).doc(stored.paidOrderId))).data(),uid);
}

async function latestOrder(db,uid){
  return (await purchase(db,uid).get()).data()?.orderId||null;
}

async function paymentState(db,uid,orderId){
  if(typeof orderId!=='string'||orderId.length>150||!/^TAK-[A-Z0-9]+-[A-Z0-9]+$/.test(orderId))return 'missing';
  const order=(await orders(db).doc(orderId).get()).data();
  if(!belongs(order,uid))return 'missing';
  if(isRefunded(order))return 'cancelled';
  if(paid(order,uid))return 'paid';
  return order.status==='pending'?'pending':'review';
}

module.exports={CONFIG,id,comparison,entitled,latestOrder,paymentState};
