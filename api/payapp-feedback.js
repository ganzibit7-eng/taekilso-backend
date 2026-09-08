@'
// Vercel Serverless Function — 페이앱이 결제 완료를 서버끼리 직접 통보하는 곳입니다.
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  });
}
const db = admin.firestore();

const PAYAPP_USERID = 'green5797';
const PREMIUM_PRICE = 4900;
const PREMIUM_PRODUCT = 'taekilso_premium_30days';
const PREMIUM_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const PAYAPP_LINKVAL = process.env.PAYAPP_LINKVAL;

function postValue(body, key) {
  const value = body && body[key];
  return value == null ? '' : String(value).trim();
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('METHOD_NOT_ALLOWED');

    const body = req.body || {};
    const userid = postValue(body, 'userid');
    const linkval = postValue(body, 'linkval');
    const orderId = postValue(body, 'var1');
    const goodname = postValue(body, 'goodname');
    const price = Number(postValue(body, 'price'));
    const payState = Number(postValue(body, 'pay_state'));
    const mulNo = postValue(body, 'mul_no');

    if (userid !== PAYAPP_USERID) return res.status(200).send('INVALID_USER');
    if (!linkval || linkval !== PAYAPP_LINKVAL) return res.status(200).send('INVALID_LINKVAL');
    if (!orderId || !/^TAK-[A-Z0-9]+-[A-Z0-9]+$/.test(orderId)) return res.status(200).send('INVALID_ORDER');
    if (price !== PREMIUM_PRICE) return res.status(200).send('INVALID_PRICE');
    if (goodname !== '택일소 프리미엄 30일 이용권') return res.status(200).send('INVALID_PRODUCT');

    const ref = db.collection('paymentOrders').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(200).send('UNKNOWN_ORDER');
    const order = snap.data();

    if (order.amount !== PREMIUM_PRICE || order.product !== PREMIUM_PRODUCT) {
      return res.status(200).send('INVALID_ORDER_DATA');
    }

    if (order.status === 'paid' && order.mul_no === mulNo) {
      return res.status(200).send('SUCCESS');
    }

    if (payState === 4) {
      await db.runTransaction(async (tx) => {
        const latest = await tx.get(ref);
        if (!latest.exists) throw new Error('ORDER_NOT_FOUND');
        const latestOrder = latest.data();

        if (latestOrder.status === 'paid') return;
        if (latestOrder.status !== 'pending') throw new Error('ORDER_NOT_PENDING');
        if (latestOrder.amount !== PREMIUM_PRICE || latestOrder.product !== PREMIUM_PRODUCT) {
          throw new Error('ORDER_MISMATCH');
        }

        const userRef = db.collection('users').doc(latestOrder.uid);
        tx.set(userRef, {
          premium: true,
          premiumUntil: Date.now() + PREMIUM_DURATION_MS,
          lastOrderId: orderId,
          lastPurchaseAt: Date.now(),
          lastVerificationMethod: 'server-verified',
          premiumMulNo: mulNo || null
        }, { merge: true });

        tx.update(ref, {
          status: 'paid',
          mul_no: mulNo || null,
          pay_state: 4,
          pay_type: postValue(body, 'pay_type'),
          pay_date: postValue(body, 'pay_date'),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      return res.status(200).send('SUCCESS');
    }

    if ([8, 32, 9, 64, 70, 71, 10, 1].includes(payState)) {
      await ref.set({
        lastPayState: payState,
        lastMulNo: mulNo || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    return res.status(200).send('SUCCESS');
  } catch (error) {
    console.error('PayApp feedback error:', error);
    return res.status(500).send('ERROR');
  }
};
'@ | Out-File -Encoding utf8 api\payapp-feedback.js
