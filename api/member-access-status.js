const admin = require('firebase-admin');
const crypto = require('crypto');

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

function norm(v){ return String(v || '').trim().toLowerCase(); }
function sha(v){ return crypto.createHash('sha256').update(String(v || '')).digest('hex'); }

async function identifiers(uid, decoded){
  const ids = [`uid:${uid}`];
  if (decoded && decoded.email) ids.push(`email:${norm(decoded.email)}`);
  try {
    const user = await admin.auth().getUser(uid);
    if (user.email) ids.push(`email:${norm(user.email)}`);
    (user.providerData || []).forEach(p => {
      if (p && p.providerId && p.uid) ids.push(`provider:${p.providerId}:${p.uid}`);
      if (p && p.email) ids.push(`email:${norm(p.email)}`);
    });
  } catch(e){}
  if (String(uid).startsWith('kakao_')) ids.push(`provider:kakao:${String(uid).slice(6)}`);
  return [...new Set(ids.filter(Boolean))];
}

async function getBan(ids){
  for (const id of ids) {
    const key = await db.collection('memberBanKeys').doc(sha(id)).get();
    if (!key.exists) continue;
    const banId = String((key.data() || {}).banId || '');
    if (!banId) continue;
    const banDoc = await db.collection('memberBans').doc(banId).get();
    if (!banDoc.exists) continue;
    const ban = banDoc.data() || {};
    if (ban.active === false || ban.unbannedAt || ban.unbannedAtMs) continue;
    return { banId, ...ban };
  }
  return null;
}

async function getCooldown(ids){
  const now = Date.now();
  for (const coll of ['rejoinBlockKeys', 'memberRejoinKeys']) {
    for (const id of ids) {
      const snap = await db.collection(coll).doc(sha(id)).get();
      if (!snap.exists) continue;
      const d = snap.data() || {};
      const until = Number(d.rejoinAllowedAtMs || d.untilMs || 0);
      if (until > now) return { ...d, rejoinAllowedAtMs: until };
    }
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error:'METHOD_NOT_ALLOWED' });
  if (initError || !db) return res.status(500).json({ error:'INIT_ERROR', message:initError ? initError.message : 'Firebase init failed' });

  try {
    const header = String((req.headers && req.headers.authorization) || '').trim();
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error:'UNAUTHORIZED' });

    const decoded = await admin.auth().verifyIdToken(header.slice(7).trim());
    if (!decoded || !decoded.uid) return res.status(401).json({ error:'UNAUTHORIZED' });

    const ids = await identifiers(decoded.uid, decoded);
    const ban = await getBan(ids);
    if (ban) {
      return res.status(403).json({
        error:'ACCOUNT_BANNED',
        message:'관리자에 의해 이용이 제한된 계정입니다.',
        banId:ban.banId || null
      });
    }

    const cooldown = await getCooldown(ids);
    if (cooldown) {
      return res.status(403).json({
        error:'ACCOUNT_REJOIN_COOLDOWN',
        message:'회원탈퇴 후 30일 동안은 동일 계정으로 재가입할 수 없습니다.',
        rejoinAllowedAtMs:Number(cooldown.rejoinAllowedAtMs || 0)
      });
    }

    return res.status(200).json({ ok:true, allowed:true, uid:decoded.uid });
  } catch (e) {
    console.error('[member-access-status]', e);
    if (String(e && e.code || '').startsWith('auth/')) {
      return res.status(401).json({ error:'UNAUTHORIZED', message:'로그인 인증을 확인하지 못했습니다.' });
    }
    return res.status(500).json({ error:'SERVER_ERROR' });
  }
};
