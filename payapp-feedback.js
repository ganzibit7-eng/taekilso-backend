// Vercel Serverless Function — 페이앱이 결제 완료를 서버끼리 직접 통보하는 곳입니다.
// 기존 Firebase Cloud Function(payappFeedback)과 로직은 완전히 동일하고,
// firebase-admin으로 여전히 같은 Firestore 데이터베이스에 접근합니다.
// Vercel은 Google Cloud 소속이 아니라서, 서비스 계정 키를 직접 넣어줘야 합니다.

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel 환경변수에 줄바꿈이 \n 문자로 들어오기 때문에 실제 줄바꿈으로 되돌려줍니다.
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

    // 디버깅용: 페이앱이 실제로 뭘 보냈는지, 어느 검증에서 걸리는지 로그로 남깁니다.
    console.log('[payapp-feedback] 수신된 원본 body:', JSON.stringify(body));
    console.log('[payapp-feedback] 파싱값:', { userid, linkval, orderId, goodname, price, payState, mulNo });

    // 브라우저를 신뢰하지 않고, 페이앱이 보낸 값을 여기서 직접 검증합니다.
    if (userid !== PAYAPP_USERID) { console.log('[payapp-feedback] INVALID_USER:', userid); return res.status(200).send('INVALID_USER'); }
    if (!linkval || linkval !== PAYAPP_LINKVAL) { console.log('[payapp-feedback] INVALID_LINKVAL. 받은값:', linkval, '/ 환경변수 설정여부:', !!PAYAPP_LINKVAL); return res.status(200).send('INVALID_LINKVAL'); }
    if (!orderId || !/^TAK-[A-Z0-9]+-[A-Z0-9]+$/.test(orderId)) { console.log('[payapp-feedback] INVALID_ORDER:', orderId); return res.status(200).send('INVALID_ORDER'); }
    if (price !== PREMIUM_PRICE) { console.log('[payapp-feedback] INVALID_PRICE:', price); return res.status(200).send('INVALID_PRICE'); }
    if (goodname !== '택일소 프리미엄 30일 이용권') { console.log('[payapp-feedback] INVALID_PRODUCT:', goodname); return res.status(200).send('INVALID_PRODUCT'); }

    const ref = db.collection('paymentOrders').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) { console.log('[payapp-feedback] UNKNOWN_ORDER:', orderId); return res.status(200).send('UNKNOWN_ORDER'); }
    const order = snap.data();
    console.log('[payapp-feedback] 찾은 주문:', JSON.stringify(order));

    if (order.amount !== PREMIUM_PRICE || order.product !== PREMIUM_PRODUCT) {
      console.log('[payapp-feedback] INVALID_ORDER_DATA. 주문:', JSON.stringify(order));
      return res.status(200).send('INVALID_ORDER_DATA');
    }

    if (order.status === 'paid' && order.mul_no === mulNo) {
      console.log('[payapp-feedback] 이미 처리된 주문(중복 통보):', orderId);
      return res.status(200).send('SUCCESS');
    }

    console.log('[payapp-feedback] pay_state:', payState, payState === 4 ? '→ 프리미엄 지급 시도' : '→ 완료 상태 아님, 지급 안함');
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

        // 관리자 대시보드의 "총 구매수"는 실제로 검증된 이 시점에만 올라갑니다.
        const statsRef = db.collection('stats').doc('counters');
        tx.set(statsRef, {
          purchases: admin.firestore.FieldValue.increment(1)
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
