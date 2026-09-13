const crypto = require('crypto');

const BAN_KEYS_COLLECTION = 'memberBanKeys';
const BANS_COLLECTION = 'memberBans';

// 이전/중간 버전과의 호환을 위해 재가입 제한 컬렉션 이름을 모두 읽습니다.
const REJOIN_KEY_COLLECTIONS = ['rejoinBlockKeys', 'memberRejoinKeys'];
const REJOIN_BLOCK_COLLECTIONS = ['rejoinBlocks', 'memberRejoinBlocks'];

function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function hashIdentifier(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function uniq(list) {
  return [...new Set((list || []).filter(Boolean).map(v => String(v).trim()).filter(Boolean))];
}

async function buildIdentifiers(admin, db, uid, decoded = null) {
  const identifiers = [];
  if (uid) identifiers.push(`uid:${uid}`);

  const decodedEmail = normalizeEmail(decoded && decoded.email);
  if (decodedEmail) identifiers.push(`email:${decodedEmail}`);

  let userRecord = null;
  try {
    userRecord = await admin.auth().getUser(uid);
  } catch (_) {}

  if (userRecord) {
    const email = normalizeEmail(userRecord.email);
    if (email) identifiers.push(`email:${email}`);
    for (const p of userRecord.providerData || []) {
      if (p && p.providerId && p.uid) identifiers.push(`provider:${p.providerId}:${p.uid}`);
      const pe = normalizeEmail(p && p.email);
      if (pe) identifiers.push(`email:${pe}`);
    }
  }

  try {
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) {
      const u = snap.data() || {};
      const email = normalizeEmail(u.email);
      if (email) identifiers.push(`email:${email}`);
      if (u.provider && u.providerUid) identifiers.push(`provider:${u.provider}:${u.providerUid}`);
      if (u.kakaoId) identifiers.push(`provider:kakao:${u.kakaoId}`);
    }
  } catch (_) {}

  // 카카오 Firebase UID가 kakao_<id> 형식이므로 안정적인 식별자로 한 번 더 저장합니다.
  if (String(uid || '').startsWith('kakao_')) {
    identifiers.push(`provider:kakao:${String(uid).slice(6)}`);
  }

  return uniq(identifiers);
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
    if (ban.active === false || ban.unbannedAt) continue;
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

async function createRejoinCooldown(admin, db, { uid, identifiers, days = 30, reason = 'self_delete' }) {
  const now = Date.now();
  const rejoinAllowedAtMs = now + days * 24 * 60 * 60 * 1000;
  const blockId = `RJ-${now}-${crypto.randomBytes(6).toString('hex')}`;
  const hashes = uniq(identifiers).map(hashIdentifier);

  const block = {
    uid: String(uid || ''),
    reason,
    createdAtMs: now,
    rejoinAllowedAtMs,
    keyHashes: hashes,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const batch = db.batch();
  for (const c of REJOIN_BLOCK_COLLECTIONS) batch.set(db.collection(c).doc(blockId), block, { merge: true });
  for (const c of REJOIN_KEY_COLLECTIONS) {
    for (const hash of hashes) {
      batch.set(db.collection(c).doc(hash), {
        blockId,
        uid: String(uid || ''),
        reason,
        rejoinAllowedAtMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  }
  await batch.commit();
  return { blockId, rejoinAllowedAtMs };
}

async function createPermanentBan(admin, db, { uid, identifiers, email = '', nickname = '', provider = '', reason = 'admin_force_delete', adminUid = '' }) {
  const now = Date.now();
  const banId = `BAN-${now}-${crypto.randomBytes(6).toString('hex')}`;
  const hashes = uniq(identifiers).map(hashIdentifier);

  const batch = db.batch();
  batch.set(db.collection(BANS_COLLECTION).doc(banId), {
    uid: String(uid || ''),
    email: normalizeEmail(email),
    nickname: String(nickname || ''),
    provider: String(provider || ''),
    reason,
    active: true,
    bannedAtMs: now,
    bannedByUid: String(adminUid || ''),
    keyHashes: hashes,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  for (const hash of hashes) {
    batch.set(db.collection(BAN_KEYS_COLLECTION).doc(hash), {
      banId,
      uid: String(uid || ''),
      active: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  await batch.commit();
  return { banId, bannedAtMs: now };
}

async function unbanPermanent(admin, db, banId, adminUid = '') {
  const ref = db.collection(BANS_COLLECTION).doc(String(banId || ''));
  const snap = await ref.get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  const hashes = Array.isArray(data.keyHashes) ? data.keyHashes : [];

  const batch = db.batch();
  batch.set(ref, {
    active: false,
    unbannedAtMs: Date.now(),
    unbannedByUid: String(adminUid || ''),
    unbannedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  for (const hash of hashes) batch.delete(db.collection(BAN_KEYS_COLLECTION).doc(hash));
  await batch.commit();
  return true;
}

async function deleteUserData(db, uid) {
  const userRef = db.collection('users').doc(uid);
  if (typeof db.recursiveDelete === 'function') {
    await db.recursiveDelete(userRef);
  } else {
    // 구버전 firebase-admin fallback: 알려진 서브컬렉션을 먼저 지우고 users 문서를 삭제합니다.
    for (const sub of ['sajuProfiles', 'aiConversations']) {
      const snap = await userRef.collection(sub).limit(500).get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }
    await userRef.delete().catch(() => {});
  }
}

module.exports = {
  buildIdentifiers,
  findPermanentBan,
  findRejoinCooldown,
  createRejoinCooldown,
  createPermanentBan,
  unbanPermanent,
  deleteUserData
};
