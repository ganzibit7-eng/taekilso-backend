const admin = require('firebase-admin');

let db = null;
let initError = null;

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


function normalizeProvider(value, decoded) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();

  if (raw === 'kakao') return 'kakao';

  if (
    raw === 'google.com' ||
    raw === 'google'
  ) {
    return 'google';
  }

  if (
    raw === 'password' ||
    raw === 'email'
  ) {
    return 'email';
  }

  const claimProvider = String(
    (decoded && decoded.loginProvider) ||
    (decoded &&
      decoded.firebase &&
      decoded.firebase.sign_in_provider) ||
    ''
  ).toLowerCase();

  if (claimProvider === 'kakao') {
    return 'kakao';
  }

  if (
    claimProvider === 'google.com' ||
    claimProvider === 'google'
  ) {
    return 'google';
  }

  if (
    claimProvider === 'password' ||
    claimProvider === 'email'
  ) {
    return 'email';
  }

  return 'firebase';
}


module.exports = async (req, res) => {
  /* =========================
     CORS
  ========================= */

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
    'Content-Type, Authorization'
  );

  res.setHeader(
    'Cache-Control',
    'no-store'
  );


  /* =========================
     OPTIONS
  ========================= */

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }


  /* =========================
     POST ONLY
  ========================= */

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED'
    });
  }


  /* =========================
     FIREBASE INIT CHECK
  ========================= */

  if (initError || !db) {
    console.error(
      '[member-last-seen] init error',
      initError
    );

    return res.status(500).json({
      error: 'INIT_ERROR',
      message:
        '최근 접속시간 서버 초기화에 실패했습니다.'
    });
  }


  try {
    /* =========================
       FIREBASE ID TOKEN
    ========================= */

    const authHeader = String(
      (req.headers &&
        req.headers.authorization) ||
      ''
    ).trim();

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'UNAUTHORIZED'
      });
    }


    const token = authHeader
      .slice(7)
      .trim();

    if (!token) {
      return res.status(401).json({
        error: 'UNAUTHORIZED'
      });
    }


    /* =========================
       VERIFY TOKEN
    ========================= */

    const decoded =
      await admin.auth().verifyIdToken(token);

    const uid = String(
      (decoded && decoded.uid) || ''
    ).trim();

    if (!uid) {
      return res.status(401).json({
        error: 'UNAUTHORIZED'
      });
    }


    /* =========================
       PROVIDER
    ========================= */

    const body = req.body || {};

    const provider =
      normalizeProvider(
        body.provider,
        decoded
      );

    const source =
      provider === 'kakao'
        ? 'kakao-login'
        : 'firebase-auth';

    const now = Date.now();


    /* =========================
       UPDATE LAST SEEN
    ========================= */

    await db
      .collection('users')
      .doc(uid)
      .set(
        {
          lastSeenAt:
            admin.firestore
              .FieldValue
              .serverTimestamp(),

          lastSeenAtMs: now,

          lastSeenProvider:
            provider,

          lastSeenSource:
            source
        },
        {
          merge: true
        }
      );


    /* =========================
       SUCCESS
    ========================= */

    return res.status(200).json({
      ok: true,
      uid,
      lastSeenAtMs: now,
      provider
    });

  } catch (err) {

    console.error(
      '[member-last-seen] error',
      err
    );

    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message:
        '최근 접속시간 인증에 실패했습니다.'
    });
  }
};
