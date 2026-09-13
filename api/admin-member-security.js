const admin = require('firebase-admin');
const {
  buildIdentifiers,
  createPermanentBan,
  unbanPermanent,
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

const ADMIN_EMAIL = 'green092432@gmail.com';

async function requireAdmin(req) {
  const header = String(req.headers.authorization || '').trim();
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('관리자 로그인이 필요합니다.'), { status: 401, code: 'UNAUTHORIZED' });
  const decoded = await admin.auth().verifyIdToken(header.slice(7).trim());
  const email = String(decoded.email || '').trim().toLowerCase();
  if (!decoded.uid || email !== ADMIN_EMAIL) throw Object.assign(new Error('관리자 권한이 없습니다.'), { status: 403, code: 'FORBIDDEN' });
  return decoded;
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
    const me = await requireAdmin(req);
    const body = req.body || {};
    const action = String(body.action || '');

    if (action === 'list_bans') {
      const snap = await db.collection('memberBans').limit(200).get();
      const bans = [];
      snap.forEach(doc => {
        const b = doc.data() || {};
        if (b.active === false || b.unbannedAt || b.unbannedAtMs) return;
        bans.push({
          banId: doc.id,
          uid: b.uid || '',
          email: b.email || '',
          nickname: b.nickname || '',
          provider: b.provider || '',
          reason: b.reason || '',
          bannedAtMs: Number(b.bannedAtMs || 0)
        });
      });
      bans.sort((a, b) => b.bannedAtMs - a.bannedAtMs);
      return res.status(200).json({ ok: true, bans });
    }

    if (action === 'unban_user') {
      const banId = String(body.banId || '').trim();
      if (!banId) return res.status(400).json({ error: 'INVALID_BAN_ID', message: 'banId가 필요합니다.' });
      const ok = await unbanPermanent(admin, db, banId, me.uid);
      if (!ok) return res.status(404).json({ error: 'BAN_NOT_FOUND', message: '밴 기록을 찾지 못했습니다.' });
      return res.status(200).json({ ok: true, unbanned: true, banId });
    }

    if (action === 'force_delete') {
      const uid = String(body.uid || '').trim();
      const suppliedPassword = String(body.deletePassword || '');
      const expectedPassword = String(process.env.ADMIN_DELETE_PASSWORD || '');
      if (!expectedPassword) return res.status(500).json({ error: 'MISSING_ADMIN_DELETE_PASSWORD', message: 'ADMIN_DELETE_PASSWORD 환경변수가 비어있습니다.' });
      if (!uid) return res.status(400).json({ error: 'INVALID_UID', message: 'uid가 필요합니다.' });
      if (uid === me.uid) return res.status(400).json({ error: 'CANNOT_DELETE_SELF', message: '현재 로그인한 관리자 본인 계정은 강제탈퇴할 수 없습니다.' });
      if (suppliedPassword !== expectedPassword) return res.status(403).json({ error: 'INVALID_DELETE_PASSWORD', message: '관리자 삭제 비밀번호가 올바르지 않습니다.' });

      let record = null;
      try { record = await admin.auth().getUser(uid); } catch (e) {
        if (!e || e.code !== 'auth/user-not-found') throw e;
      }
      const userSnap = await db.collection('users').doc(uid).get();
      const u = userSnap.exists ? (userSnap.data() || {}) : {};
      const identifiers = await buildIdentifiers(admin, db, uid, null);
      const email = String((record && record.email) || u.email || '').trim().toLowerCase();
      const nickname = String(u.nickname || (record && record.displayName) || '');
      const provider = String(u.provider || ((record && record.providerData && record.providerData[0] && record.providerData[0].providerId) || ''));

      // 영구 밴이 저장된 뒤에만 실제 계정 데이터를 삭제합니다.
      const ban = await createPermanentBan(admin, db, {
        uid,
        identifiers,
        email,
        nickname,
        provider,
        reason: 'admin_force_delete',
        adminUid: me.uid
      });

      await deleteUserData(db, uid);
      await admin.auth().deleteUser(uid).catch((err) => {
        if (!err || err.code !== 'auth/user-not-found') throw err;
      });

      return res.status(200).json({
        ok: true,
        deleted: true,
        permanentlyBanned: true,
        banId: ban.banId
      });
    }

    return res.status(400).json({ error: 'UNKNOWN_ACTION', message: '지원하지 않는 action입니다.' });
  } catch (error) {
    console.error('[admin-member-security] error:', error);
    const status = Number(error && error.status) || (String(error && error.code || '').startsWith('auth/') ? 401 : 500);
    return res.status(status).json({
      error: (error && error.code) || 'SERVER_ERROR',
      message: (error && error.message) || '관리자 보안 작업 중 오류가 발생했습니다.'
    });
  }
};
