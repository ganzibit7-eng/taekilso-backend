const admin = require('firebase-admin');
const {
  buildIdentifiers,
  findPermanentBan,
  createRejoinCooldown,
  deleteUserData
} = require('./_ban');

let db = null;
let initError = null;
try {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON 환경변수가 비어있습니다.');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  db = admin.firestore();
} catch (e) { initError = e; }

const COOLDOWN_DAYS = 30;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (initError || !db) return res.status(500).json({ error: 'INIT_ERROR', message: initError ? initError.message : 'Firebase init failed' });

  try {
    const header = String(req.headers.authorization || '').trim();
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const decoded = await admin.auth().verifyIdToken(header.slice(7).trim());
    const uid = decoded && decoded.uid;
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const identifiers = await buildIdentifiers(admin, db, uid, decoded);
    const existingBan = await findPermanentBan(db, identifiers);
    if (existingBan) return res.status(403).json({ error: 'ACCOUNT_BANNED', message: '관리자에 의해 이용이 제한된 계정입니다.' });

    // 계정을 삭제하기 전에 먼저 재가입 제한 키를 저장해야 합니다.
    const cooldown = await createRejoinCooldown(admin, db, {
      uid,
      identifiers,
      days: COOLDOWN_DAYS,
      reason: 'self_delete'
    });

    // 결제(paymentOrders/payappTransactions)와 문의(inquiries)는 top-level이라 보존됩니다.
    await deleteUserData(db, uid);
    await admin.auth().deleteUser(uid).catch((err) => {
      if (!err || err.code !== 'auth/user-not-found') throw err;
    });

    return res.status(200).json({
      ok: true,
      deleted: true,
      cooldownDays: COOLDOWN_DAYS,
      rejoinAllowedAtMs: cooldown.rejoinAllowedAtMs
    });
  } catch (error) {
    console.error('[member-self-delete] error:', error);
    if (error && String(error.code || '').startsWith('auth/')) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: '회원 인증을 확인하지 못했습니다.' });
    }
    return res.status(500).json({ error: 'SERVER_ERROR', message: '회원탈퇴 처리 중 오류가 발생했습니다.' });
  }
};
