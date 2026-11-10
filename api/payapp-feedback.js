'use strict';
const admin=require('firebase-admin'),crypto=require('node:crypto');
const entitlement=require('../lib/payment-entitlements');
let db=null,initError=null;
try{if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});db=admin.firestore();}catch(e){initError=e;}
const PRODUCTS={
 taekilso_premium_30days:{price:8900,names:['택일소 프리미엄 30일 이용권','2027 신년상담 · 30일 이용권']},
 ai_question_pack_5:{price:1900,names:['AI 질문권 5개']},
 ai_question_pack_10:{price:3200,names:['AI 질문권 10개']}
};
const value=(b,k)=>String(b?.[k]??'').trim();
function safeEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return !!x.length&&x.length===y.length&&crypto.timingSafeEqual(x,y);}
function signatureValid(body){
 const key=process.env.PAYAPP_REQUESTKEY;
 if(!key)return true; // Existing LINKVAL integration remains supported until configured.
 const stamp=value(body,'responsedate');if(!/^\d{14}$/.test(stamp))return false;
 const date=Date.parse(stamp.slice(0,4)+'-'+stamp.slice(4,6)+'-'+stamp.slice(6,8)+'T'+stamp.slice(8,10)+':'+stamp.slice(10,12)+':'+stamp.slice(12,14)+'+09:00');
 if(!Number.isFinite(date)||Math.abs(Date.now()-date)>15*60*1000)return false;
 return safeEqual(value(body,'hash').toLowerCase(),crypto.createHash('sha256').update('green5797'+stamp+key).digest('hex'));
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='POST')return res.status(405).send('METHOD_NOT_ALLOWED');
 if(initError||!db)return res.status(500).send('INIT_ERROR');
 if(!process.env.PAYAPP_LINKVAL)return res.status(500).send('MISSING_PAYAPP_LINKVAL');
 const body=req.body||{};
 // Reject unauthenticated traffic before any database/log write.
 if(value(body,'userid')!=='green5797')return res.status(200).send('INVALID_USER');
 if(!safeEqual(value(body,'linkval'),process.env.PAYAPP_LINKVAL))return res.status(200).send('INVALID_LINKVAL');
 if(process.env.PAYAPP_LINKKEY&&!safeEqual(value(body,'linkkey'),process.env.PAYAPP_LINKKEY))return res.status(200).send('INVALID_LINKKEY');
 if(!signatureValid(body))return res.status(200).send('INVALID_SIGNATURE');
 const orderId=value(body,'var1'),mulNo=value(body,'mul_no'),state=Number(value(body,'pay_state'));
 if(!/^TAK-[A-Z0-9]+-[A-Z0-9]+$/.test(orderId)||orderId.length>150||!mulNo||mulNo.length>100)return res.status(200).send('INVALID_ORDER');
 if(![1,4,8,32,9,64,10,70,71].includes(state))return res.status(200).send('INVALID_STATE');
 const partial=[70,71].includes(state),cancellation=[8,32,9,64,70,71].includes(state),price=Number(value(body,'price'));
 const originalNo=partial?value(body,'orig_mul_no'):mulNo;
 const eventId=crypto.createHash('sha256').update([orderId,state,mulNo,value(body,'canceldate'),price].join('|')).digest('hex');
 const orderRef=db.collection('paymentOrders').doc(orderId),eventRef=db.collection('payappTransactions').doc(eventId);
 try{
  await db.runTransaction(async tx=>{
   const snap=await tx.get(orderRef),event=await tx.get(eventRef);
   if(!snap.exists)throw new Error('UNKNOWN_ORDER');
   const order=snap.data(),product=PRODUCTS[order.product];
   if(!product||!order.uid||order.amount!==product.price)throw new Error('INVALID_ORDER_DATA');
   if(!product.names.includes(value(body,'goodname')))throw new Error('INVALID_PRODUCT_NAME');
   if(partial?(!originalNo||Number(value(body,'orig_price'))!==product.price||!Number.isInteger(price)||price<=0||price>product.price):(price!==product.price))throw new Error('INVALID_PRICE');
   if(order.mul_no&&String(order.mul_no)!==originalNo)throw new Error('TRANSACTION_MISMATCH');
   if(event.exists)return;
   const now=Date.now(),userRef=db.collection('users').doc(order.uid),userSnap=await tx.get(userRef),user=userSnap.exists?userSnap.data():{};
   const terminal=entitlement.isRefunded(order);
   if(state===4&&!terminal&&order.status!=='paid'){
    if(order.status!=='pending')throw new Error('ORDER_NOT_PENDING');
    // Do not recreate an account removed while its payment was in flight.
    let accountExists=true;
    if(typeof admin.auth==='function'){try{await admin.auth().getUser(order.uid);}catch(e){if(e.code==='auth/user-not-found')accountExists=false;else throw e;}}
    const patch=entitlement.grantPatch(user,orderId,order.product,now);
    if(accountExists)tx.set(userRef,{...patch,lastOrderId:orderId,lastPurchaseAt:now,lastVerificationMethod:order.product==='taekilso_premium_30days'?'server-verified':user.lastVerificationMethod||'server-verified',lastMulNoGranted:mulNo},{merge:true});
    tx.update(orderRef,{status:'paid',mul_no:mulNo,pay_state:4,lastPayState:4,paidAtMs:now,entitlementVersion:1,entitlementGranted:accountExists,entitlementReviewRequired:!accountExists,pay_type:value(body,'pay_type').slice(0,20),pay_date:value(body,'pay_date').slice(0,40),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    tx.set(db.collection('stats').doc('counters'),{purchases:admin.firestore.FieldValue.increment(1),revenue:admin.firestore.FieldValue.increment(product.price),purchasesByProduct:{[order.product]:admin.firestore.FieldValue.increment(1)}},{merge:true});
   }else if(cancellation){
    const alreadyFull=['cancelled','refunded'].includes(order.status),priorRefund=Math.max(0,Number(order.refundedAmount)||0);
    const refundedAmount=partial?Math.min(product.price,priorRefund+price):product.price;
    const priorGrant=order.entitlementGranted===true||order.status==='paid';
    const status=partial&&refundedAmount<product.price?'partially_refunded':priorGrant||order.paidAtMs?'refunded':'cancelled';
    if(!alreadyFull){
     let review=!!order.entitlementReviewRequired;
     if(priorGrant&&!order.entitlementRevokedAtMs&&userSnap.exists){const revoked=entitlement.revokePatch(user,orderId,order,now);tx.set(userRef,{...revoked.patch,...(revoked.needsReview?{entitlementReviewRequired:true}: {})},{merge:true});review=review||revoked.needsReview;}
     tx.update(orderRef,{status,lastPayState:state,lastMulNo:mulNo,mul_no:order.mul_no||originalNo,refundedAmount,entitlementRevokedAtMs:order.entitlementRevokedAtMs||now,entitlementReviewRequired:review,cancelledAtMs:now,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
     if(order.paidAtMs||order.status==='paid'){
      const refundDelta=Math.max(0,refundedAmount-priorRefund),firstRefund=!order.entitlementRevokedAtMs;
      tx.set(db.collection('stats').doc('counters'),{revenue:admin.firestore.FieldValue.increment(-refundDelta),...(firstRefund?{purchases:admin.firestore.FieldValue.increment(-1),purchasesByProduct:{[order.product]:admin.firestore.FieldValue.increment(-1)}}:{})},{merge:true});
     }
    }
   }else if(!terminal&&order.status!=='paid'){
    tx.update(orderRef,{lastPayState:state,lastMulNo:mulNo,mul_no:order.mul_no||mulNo,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
   }
   tx.set(eventRef,{orderId,uid:order.uid,state,mulNo,price,receivedAtMs:now,expiresAt:new Date(now+90*86400000)});
  });
  return res.status(200).send('SUCCESS');
 }catch(e){
  if(['UNKNOWN_ORDER','INVALID_ORDER_DATA','INVALID_PRODUCT_NAME','INVALID_PRICE','TRANSACTION_MISMATCH','ORDER_NOT_PENDING'].includes(e.message))return res.status(200).send(e.message);
  console.error('[payapp-feedback] transaction failed:',e.code||e.message);return res.status(500).send('ERROR');
 }
};
