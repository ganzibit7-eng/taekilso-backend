const admin = require('firebase-admin');

let db = null;
let initError = null;

try {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON 환경변수가 비어있습니다.');
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(raw))
    });
  }
  db = admin.firestore();
} catch (err) {
  initError = err;
}

const ALLOWED_FEATURES = new Set([
  'date_search',
  'premium_report',
  'compatibility',
  'saju_report',
  'wealth_report',
  'premium_feature'
]);

async function authenticateRequest(req) {
  const authHeader = String((req.headers && req.headers.authorization) || '').trim();
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        if (decoded && decoded.uid) return decoded.uid;
      } catch (err) {}
    }
  }

  const kakaoToken = String((req.headers && req.headers['x-kakao-access-token']) || '').trim();
  if (kakaoToken) {
    try {
      const kakaoRes = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: { Authorization: 'Bearer ' + kakaoToken }
      });
      if (kakaoRes.ok) {
        const me = await kakaoRes.json();
        if (me && me.id) return 'kakao_' + String(me.id);
      }
    } catch (err) {}
  }

  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Kakao-Access-Token');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (initError) return res.status(500).json({ error: 'INIT_ERROR' });

  try {
    const uid = await authenticateRequest(req);
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const featureRaw = String((req.body && req.body.feature) || 'premium_feature').slice(0, 60);
    const feature = ALLOWED_FEATURES.has(featureRaw) ? featureRaw : 'premium_feature';

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: 'USER_NOT_FOUND' });

    const data = userSnap.data() || {};
    const until = data.premiumUntil && typeof data.premiumUntil.toMillis === 'function'
      ? data.premiumUntil.toMillis()
      : Number(data.premiumUntil || 0);

    if (!(data.premium === true && until > Date.now())) {
      return res.status(403).json({ error: 'PREMIUM_REQUIRED' });
    }

    const eventRef = db.collection('premiumUsageEvents').doc();
    const batch = db.batch();

    batch.set(eventRef, {
      uid,
      feature,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now()
    });

    batch.set(userRef, {
      premiumUsageCount: admin.firestore.FieldValue.increment(1),
      lastPremiumUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastPremiumFeature: feature
    }, { merge: true });

    await batch.commit();

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[premium-usage] error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
};
