'use strict';
const admin=require('firebase-admin');
const {authenticate}=require('../lib/member-access');
const {isPaidOrder,paidAt,ms,grantPatch,premiumLots}=require('../lib/payment-entitlements');
let db,initError;
try{if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});db=admin.firestore();}catch(e){initError=e;}
module.exports=async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Kakao-Access-Token');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 if(initError)return res.status(500).json({error:'INIT_ERROR'});
 try{
  const identity=await authenticate(req,admin,db);if(!identity)return res.status(401).json({error:'UNAUTHORIZED'});
  const uid=identity.uid,userRef=db.collection('users').doc(uid),now=Date.now();
  // Re-read both the user and orders in one transaction so a concurrent refund
  // or administrator revocation cannot be overwritten by recovery.
  const result=await db.runTransaction(async tx=>{
   const userSnap=await tx.get(userRef);if(!userSnap.exists)return {ok:true,active:false,premiumUntil:0,recovered:false,source:'no_user'};
   const user=userSnap.data(),until=ms(user.premiumUntil);
   if(user.premium===true&&until>now)return {ok:true,active:true,premiumUntil:until,recovered:false,source:'user_document'};
   const orders=await tx.get(db.collection('paymentOrders').where('uid','==',uid));
   const revoked=ms(user.lastAdminPremiumRevokeAt);
   const eligible=orders.docs.map(d=>({id:d.id,...d.data()})).filter(o=>isPaidOrder(o,uid)&&o.product==='taekilso_premium_30days'&&!o.entitlementReviewRequired&&paidAt(o)>revoked&&paidAt(o)<=now).sort((a,b)=>paidAt(a)-paidAt(b));
   let restored={};for(const order of eligible)restored={...restored,...grantPatch(restored,order.id,order.product,paidAt(order))};
   const restoredUntil=ms(restored.premiumUntil);
   if(restoredUntil<=now)return {ok:true,active:false,premiumUntil:until||restoredUntil||0,recovered:false,source:revoked?'admin_revoked':eligible.length?'expired_paid_orders':'no_verified_paid_order'};
   tx.set(userRef,{premium:true,premiumUntil:restoredUntil,premiumLots:premiumLots(restored,now),premiumLedgerAt:now,lastVerificationMethod:'server-recovered',premiumRecoveredAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
   return {ok:true,active:true,premiumUntil:restoredUntil,recovered:true,source:'verified_paid_orders',paidPremiumOrders:eligible.length};
  });
  return res.status(200).json(result);
 }catch(e){console.error('[premium-status]',e.code||e.message);return res.status(e.status||500).json({error:e.code||'SERVER_ERROR',message:e.status?e.message:'프리미엄 상태 확인 중 오류가 발생했습니다.'});}
};
