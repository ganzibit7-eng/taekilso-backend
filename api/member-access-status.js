const admin = require('firebase-admin');
const {
  buildIdentifiers,
  findPermanentBan,
  findRejoinCooldown
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
} catch (e) {
  initError = e;
}

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
    if (!decoded || !decoded.uid) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const identifiers = await buildIdentifiers(admin, db, decoded.uid, decoded);

    const ban = await findPermanentBan(db, identifiers);
    if (ban) {
      return res.status(403).json({
        error: 'ACCOUNT_BANNED',
        message: '관리자에 의해 이용이 제한된 계정입니다.',
        banId: ban.banId || null
      });
    }

    const cooldown = await findRejoinCooldown(db, identifiers);
    if (cooldown) {
      return res.status(403).json({
        error: 'ACCOUNT_REJOIN_COOLDOWN',
        message: '회원탈퇴 후 30일 동안은 동일 계정으로 재가입할 수 없습니다.',
        rejoinAllowedAtMs: Number(cooldown.rejoinAllowedAtMs || 0)
      });
    }

    return res.status(200).json({ ok: true, allowed: true });
  } catch (error) {
    console.error('[member-access-status] error:', error);
    if (error && String(error.code || '').startsWith('auth/')) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: '로그인 인증을 확인하지 못했습니다.' });
    }
    return res.status(500).json({ error: 'SERVER_ERROR', message: '회원 이용상태 확인 중 오류가 발생했습니다.' });
  }
};
