const admin = require('firebase-admin');
const {withdraw} = require('../lib/member-restrictions');
const {deleteUserData, assertFreshSession} = require('./_ban');

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
    const decoded = await admin.auth().verifyIdToken(header.slice(7).trim(), true);
    const uid = decoded && decoded.uid;
    if (!uid) return res.status(401).json({ error: 'UNAUTHORIZED' });
    await assertFreshSession(db, uid, decoded.auth_time);
    if (!await require('../lib/deletion-reauth').recentlyAuthenticated(decoded, req.body)) {
      return res.status(403).json({error:'REAUTH_REQUIRED',message:'같은 계정으로 본인 확인을 다시 한 뒤 탈퇴해 주세요.'});
    }

    const cooldown = await withdraw(admin, db, {uid, decoded, deleteUserData});

    return res.status(200).json({
      ok: true,
      deleted: true,
      cooldownDays: COOLDOWN_DAYS,
      rejoinAllowedAtMs: cooldown.rejoinAllowedAtMs
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({error:error.code, message:error.message});
    console.error('[member-self-delete] error:', error.code || 'INTERNAL');
    if (error && String(error.code || '').startsWith('auth/')) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: '회원 인증을 확인하지 못했습니다.' });
    }
    return res.status(500).json({ error: 'SERVER_ERROR', message: '회원탈퇴 처리 중 오류가 발생했습니다.' });
  }
};
