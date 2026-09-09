// Vercel Serverless Function — 페이앱이 결제 완료를 서버끼리 직접 통보하는 곳입니다.
// Vercel 대시보드의 Runtime Logs가 잘 안 보이는 경우가 많아서(알려진 문제),
// 무슨 일이 있었는지 Firestore의 debugLogs 컬렉션에 직접 기록해서 확실하게 확인할 수 있게 합니다.
 
const admin = require('firebase-admin');
 
let db = null;
let initError = null;
try {
  if (!admin.apps.length) {
    // 서비스 계정 JSON 파일 전체를 그대로 하나의 환경변수(FIREBASE_SERVICE_ACCOUNT_JSON)로
    // 등록하는 방식입니다. Private Key를 따로 떼어내 붙여넣으면 줄바꿈이 깨지기 쉬운데,
    // JSON.parse()는 이스케이프된 개행(\n)을 항상 정확하게 처리해주기 때문에 이 문제 자체가
    // 생기지 않습니다.
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON 환경변수가 비어있습니다.');
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  db = admin.firestore();
} catch (e) {
  // 여기서 실패하면(예: 환경변수 형식 문제) 이 함수 전체가 원인도 안 남기고 그냥 죽어버릴 수
  // 있어서, 에러를 붙잡아뒀다가 아래 handler에서 무슨 문제인지 명확하게 응답합니다.
  initError = e;
}
 
const PAYAPP_USERID = 'green5797';
const PREMIUM_PRICE = 29900;
const PREMIUM_PRODUCT = 'taekilso_premium_30days';
const PREMIUM_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const PAYAPP_LINKVAL = process.env.PAYAPP_LINKVAL;
 
function postValue(body, key) {
  const value = body && body[key];
  return value == null ? '' : String(value).trim();
}
 
module.exports = async (req, res) => {
  if (initError) {
    console.error('[payapp-feedback] Firebase 초기화 실패:', initError);
    return res.status(500).send('INIT_ERROR: ' + initError.message);
  }
 
  const debugId = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  let result = 'UNKNOWN';
  let extra = {};
  let debugRef = null;
 
  try {
    debugRef = db.collection('debugLogs').doc(debugId);
    // 요청이 들어왔다는 기록은 응답 속도를 늦추지 않도록 기다리지 않고(비동기로) 남깁니다.
    // (페이앱이 응답을 기다리는 시간이 있어서, 여기서 시간을 끌면 "고객사 응답 실패"가 날 수 있습니다)
    debugRef.set({
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      method: req.method,
      body: req.body || null,
      hasLinkvalEnv: !!PAYAPP_LINKVAL
    }).catch(() => {});
 
    if (req.method !== 'POST') { result = 'METHOD_NOT_ALLOWED'; return res.status(405).send(result); }
 
    const body = req.body || {};
    const userid = postValue(body, 'userid');
    const linkval = postValue(body, 'linkval');
    const orderId = postValue(body, 'var1');
    const goodname = postValue(body, 'goodname');
    const price = Number(postValue(body, 'price'));
    const payState = Number(postValue(body, 'pay_state'));
    const mulNo = postValue(body, 'mul_no');
    extra = { userid, linkval, orderId, goodname, price, payState, mulNo };
 
    if (userid !== PAYAPP_USERID) { result = 'INVALID_USER'; return res.status(200).send(result); }
    if (!linkval || linkval !== PAYAPP_LINKVAL) { result = 'INVALID_LINKVAL'; return res.status(200).send(result); }
    if (!orderId || !/^TAK-[A-Z0-9]+-[A-Z0-9]+$/.test(orderId)) { result = 'INVALID_ORDER'; return res.status(200).send(result); }
    if (price !== PREMIUM_PRICE) { result = 'INVALID_PRICE'; return res.status(200).send(result); }
    if (goodname !== '택일소 프리미엄 30일 이용권') { result = 'INVALID_PRODUCT'; return res.status(200).send(result); }
 
    const ref = db.collection('paymentOrders').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) { result = 'UNKNOWN_ORDER'; return res.status(200).send(result); }
    const order = snap.data();
    extra.order = order;
 
    if (order.amount !== PREMIUM_PRICE || order.product !== PREMIUM_PRODUCT) {
      result = 'INVALID_ORDER_DATA';
      return res.status(200).send(result);
    }
 
    if (order.status === 'paid' && order.mul_no === mulNo) {
      result = 'SUCCESS_ALREADY_PAID';
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
          premiumMulNo: mulNo || null,
          // 새 결제 주기가 시작될 때마다 이용 횟수를 0으로 되돌립니다. 이 값은 서버(관리자
          // 지급 포함)만 초기화할 수 있고, 손님 쪽에서는 늘리는 것만(그것도 한 번에 1씩만)
          // 가능하도록 Firestore 규칙으로 막아둬서, 환불 요청 시 실제 이용 여부를 믿을 수
          // 있게 합니다.
          premiumUsageCount: 0
        }, { merge: true });
 
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
 
      result = 'SUCCESS_GRANTED';
      return res.status(200).send('SUCCESS');
    }
 
    if ([8, 32, 9, 64, 70, 71, 10, 1].includes(payState)) {
      await ref.set({
        lastPayState: payState,
        lastMulNo: mulNo || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
 
    result = 'SUCCESS_NOT_PAID_STATE';
    return res.status(200).send('SUCCESS');
  } catch (error) {
    result = 'EXCEPTION: ' + (error && error.message);
    console.error('[payapp-feedback] 예외 발생:', error);
    return res.status(500).send('ERROR');
  } finally {
    if (debugRef) {
      await debugRef.set({ result, extra: JSON.parse(JSON.stringify(extra)) }, { merge: true }).catch(() => {});
    }
  }
};
