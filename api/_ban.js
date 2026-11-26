const crypto = require('crypto');

const BAN_KEYS_COLLECTION = 'memberBanKeys';
const BANS_COLLECTION = 'memberBans';

// 이전/중간 버전과의 호환을 위해 재가입 제한 컬렉션 이름을 모두 읽습니다.
const REJOIN_KEY_COLLECTIONS = ['rejoinBlockKeys', 'memberRejoinKeys'];

function hashIdentifier(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function uniq(list) {
  return [...new Set((list || []).filter(Boolean).map(v => String(v).trim()).filter(Boolean))];
}

async function buildIdentifiers(admin, db, uid, decoded = null) {
  // Only Firebase-controlled identity evidence may create cross-account keys.
  // Fail closed if authoritative identity lookup fails before a destructive action.
  const userRecord = await admin.auth().getUser(uid);
  return require('../lib/restriction-identities').restrictionIdentifiers(uid, decoded, userRecord);
}

async function findPermanentBan(db, identifiers) {
  const hashes = uniq(identifiers).map(hashIdentifier);
  for (const hash of hashes) {
    const snap = await db.collection(BAN_KEYS_COLLECTION).doc(hash).get();
    if (!snap.exists) continue;
    const key = snap.data() || {};
    const banId = String(key.banId || '');
    if (!banId) continue;
    const banSnap = await db.collection(BANS_COLLECTION).doc(banId).get();
    if (!banSnap.exists) continue;
    const ban = banSnap.data() || {};
    if (ban.active === false || ban.unbannedAt || ban.unbannedAtMs) continue;
    return { banId, ...ban };
  }
  return null;
}

async function findRejoinCooldown(db, identifiers, now = Date.now()) {
  const hashes = uniq(identifiers).map(hashIdentifier);
  for (const collectionName of REJOIN_KEY_COLLECTIONS) {
    for (const hash of hashes) {
      const snap = await db.collection(collectionName).doc(hash).get();
      if (!snap.exists) continue;
      const key = snap.data() || {};
      const until = Number(key.rejoinAllowedAtMs || key.untilMs || 0);
      if (until > now) return { ...key, rejoinAllowedAtMs: until };
    }
  }
  return null;
}

async function assertFreshSession(db, uid, authTime) {
  if (!Number.isInteger(authTime)) return;
  const marker = await db.collection('rejoinBlockKeys').doc('SESSION-' + hashIdentifier('uid:' + uid)).get();
  const cutoff = marker.data()?.revokedAuthTimeThrough;
  if (Number.isInteger(cutoff) && authTime <= cutoff) {
    throw Object.assign(new Error('이전 계정의 로그인 세션이에요. 다시 로그인해 주세요.'), {status:401, code:'TOKEN_REVOKED'});
  }
}

async function deleteUserData(db, uid) {
  await db.collection('aiGenerationAttempts').doc(require('../lib/generation-attempts').key(uid,'chat')).delete();
  // Annual reports are server-only documents outside the user's profile tree.
  const reportKey=require('node:crypto').createHash('sha256').update(uid).digest('hex')+'_2027';
  await db.collection('newyearReports').doc(reportKey).delete();
  const userRef = db.collection('users').doc(uid);
  if (typeof db.recursiveDelete === 'function') {
    await db.recursiveDelete(userRef);
  } else {
    // 구버전 firebase-admin fallback: 알려진 서브컬렉션을 먼저 지우고 users 문서를 삭제합니다.
    for (const sub of ['sajuProfiles', 'aiConversations', 'dateReports', 'relationshipReports', 'seohwaReports', 'dogyeomReports', 'ijunReports', 'mujinReports', 'newyearPurchases', 'reportCouponPasses', 'accountChecks']) {
      while (true) {
        const snap = await userRef.collection(sub).limit(500).get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }
    await userRef.delete();
  }
}

module.exports = {
  buildIdentifiers,
  findPermanentBan,
  findRejoinCooldown,
  assertFreshSession,
  deleteUserData
};
