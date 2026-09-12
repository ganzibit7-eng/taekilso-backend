const admin = require('firebase-admin');

let db = null;
let initError = null;

const PREMIUM_PRODUCT = 'taekilso_premium_30days';
const PREMIUM_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

try {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (!raw) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON 환경변수가 비어있습니다.'
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(raw))
    });
  }

  db = admin.firestore();
} catch (err) {
  initError = err;
}

function toMillis(value) {
  if (!value) return 0;

  if (typeof value.toMillis === 'function') {
    return value.toMillis();
  }

  if (typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePayDate(value) {
  const s = String(value || '').trim();

  if (!s) return 0;

  const parsed = Date.parse(s);

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const digits = s.replace(/\D/g, '');

  if (digits.length >= 8) {
    const y = Number(digits.slice(0, 4));
    const mo = Number(digits.slice(4, 6) || 1) - 1;
    const d = Number(digits.slice(6, 8) || 1);
    const h = Number(digits.slice(8, 10) || 0);
    const mi = Number(digits.slice(10, 12) || 0);
    const sec = Number(digits.slice(12, 14) || 0);

    const ms = new Date(
      y,
      mo,
      d,
      h,
      mi,
      sec
    ).getTime();

    return Number.isFinite(ms) ? ms : 0;
  }

  return 0;
}

async function authenticateRequest(req) {
  const authHeader = String(
    (req.headers && req.headers.authorization) || ''
  ).trim();

  // Firebase 로그인
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();

    if (token) {
      try {
        const decoded = await admin.auth().verifyIdToken(token);

        if (decoded && decoded.uid) {
          return decoded.uid;
        }
      } catch (err) {
        console.warn(
          '[premium-status] Firebase token verify failed'
        );
      }
    }
  }

  // 카카오 로그인 fallback
  const kakaoToken = String(
    (req.headers &&
      req.headers['x-kakao-access-token']) ||
      ''
  ).trim();

  if (kakaoToken) {
    try {
      const kakaoRes = await fetch(
        'https://kapi.kakao.com/v2/user/me',
        {
          headers: {
            Authorization: 'Bearer ' + kakaoToken
          }
        }
      );

      if (kakaoRes.ok) {
        const me = await kakaoRes.json();

        if (me && me.id) {
          return 'kakao_' + String(me.id);
        }
      }
    } catch (err) {
      console.warn(
        '[premium-status] Kakao verify failed'
      );
    }
  }

  return null;
}

module.exports = async (req, res) => {
  res.setHeader(
    'Access-Control-Allow-Origin',
    '*'
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Kakao-Access-Token'
  );

  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED'
    });
  }

  if (initError || !db) {
    console.error(
      '[premium-status] Firebase init error',
      initError
    );

    return res.status(500).json({
      error: 'INIT_ERROR'
    });
  }

  try {
    const uid = await authenticateRequest(req);

    if (!uid) {
      return res.status(401).json({
        error: 'UNAUTHORIZED'
      });
    }

    const userRef =
      db.collection('users').doc(uid);

    const userSnap =
      await userRef.get();

    const userData =
      userSnap.exists
        ? (userSnap.data() || {})
        : {};

    const now = Date.now();

    const currentUntil =
      toMillis(userData.premiumUntil);

    // ------------------------------------
    // 현재 프리미엄 상태가 정상인 경우
    // ------------------------------------

    if (
      userData.premium === true &&
      currentUntil > now
    ) {
      return res.status(200).json({
        ok: true,
        active: true,
        premiumUntil: currentUntil,
        recovered: false,
        source: 'user_document'
      });
    }

    // 관리자가 프리미엄을 회수한 시각
    const adminRevokedAt =
      toMillis(
        userData.lastAdminPremiumRevokeAt
      );

    // ------------------------------------
    // 실제 결제 완료 기록 확인
    // ------------------------------------

    const ordersSnap =
      await db
        .collection('paymentOrders')
        .where('uid', '==', uid)
        .limit(100)
        .get();

    const paidOrders = [];

    ordersSnap.forEach((doc) => {
      const o = doc.data() || {};

      if (o.status !== 'paid') {
        return;
      }

      if (
        o.product !== PREMIUM_PRODUCT
      ) {
        return;
      }

      const paidAt =
        toMillis(o.updatedAt) ||
        toMillis(o.createdAt) ||
        Number(o.createdAtMs || 0) ||
        parsePayDate(o.pay_date);

      if (!paidAt) {
        return;
      }

      paidOrders.push({
        id: doc.id,
        paidAt
      });
    });

    paidOrders.sort(
      (a, b) => a.paidAt - b.paidAt
    );

    // ------------------------------------
    // 결제 내역으로 만료일 재계산
    // ------------------------------------

    let reconstructedUntil = 0;
    let latestPaidAt = 0;

    for (const order of paidOrders) {
      latestPaidAt =
        Math.max(
          latestPaidAt,
          order.paidAt
        );

      const base =
        reconstructedUntil > order.paidAt
          ? reconstructedUntil
          : order.paidAt;

      reconstructedUntil =
        base + PREMIUM_DURATION_MS;
    }

    // ------------------------------------
    // 관리자가 결제 이후 회수한 경우
    // 자동 복구 금지
    // ------------------------------------

    if (
      adminRevokedAt &&
      adminRevokedAt >= latestPaidAt
    ) {
      return res.status(200).json({
        ok: true,
        active: false,
        premiumUntil: 0,
        recovered: false,
        source: 'admin_revoked'
      });
    }

    // ------------------------------------
    // 아직 기간이 남아 있다면 자동 복구
    // ------------------------------------

    if (reconstructedUntil > now) {
      await userRef.set(
        {
          premium: true,
          premiumUntil:
            reconstructedUntil,

          lastVerificationMethod:
            'server-recovered',

          premiumRecoveredAt:
            admin.firestore
              .FieldValue
              .serverTimestamp()
        },
        {
          merge: true
        }
      );

      return res.status(200).json({
        ok: true,
        active: true,

        premiumUntil:
          reconstructedUntil,

        recovered: true,

        source:
          'verified_paid_orders',

        paidPremiumOrders:
          paidOrders.length
      });
    }

    // ------------------------------------
    // 유효한 결제가 없는 경우
    // ------------------------------------

    return res.status(200).json({
      ok: true,
      active: false,

      premiumUntil:
        currentUntil ||
        reconstructedUntil ||
        0,

      recovered: false,

      source:
        paidOrders.length
          ? 'expired_paid_orders'
          : 'no_verified_paid_order'
    });

  } catch (err) {
    console.error(
      '[premium-status] error',
      err
    );

    return res.status(500).json({
      error: 'SERVER_ERROR',

      message:
        '프리미엄 상태 확인 중 오류가 발생했습니다.'
    });
  }
};
