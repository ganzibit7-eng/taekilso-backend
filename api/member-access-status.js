const admin = require('firebase-admin');
const crypto = require('crypto');

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://taekilso.com',
  'https://www.taekilso.com'
]);

function getAllowedOrigins() {
  const set = new Set(DEFAULT_ALLOWED_ORIGINS);
  String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .forEach(v => set.add(v));
  if (process.env.NODE_ENV !== 'production') {
    set.add('http://localhost:3000');
    set.add('http://127.0.0.1:3000');
    set.add('http://localhost:5500');
    set.add('http://127.0.0.1:5500');
  }
  return set;
}

function applySecurityHeaders(req, res, allowedHeaders) {
  const origin = String((req.headers && req.headers.origin) || '').trim();
  const allowed = getAllowedOrigins();
  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', allowedHeaders || 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return !origin || allowed.has(origin);
}


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
  const originAllowed = applySecurityHeaders(req, res, 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return originAllowed ? res.status(204).end() : res.status(403).end();
  }
  if (!originAllowed) return res.status(403).json({ error:'ORIGIN_NOT_ALLOWED' });
  if (req.method !== 'POST') return res.status(405).json({ error:'METHOD_NOT_ALLOWED' });
  if (initError || !db) return res.status(500).json({ error:'INIT_ERROR' });

  try {
    const header = String((req.headers && req.headers.authorization) || '').trim();
    if (!header.startsWith('Bearer ') || header.length > 8192) {
      return res.status(401).json({ error:'UNAUTHORIZED' });
    }

    // 민감한 계정 상태 확인은 폐기(revoked)된 토큰도 거부합니다.
    const decoded = await admin.auth().verifyIdToken(header.slice(7).trim(), true);
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
