'use strict';

const crypto = require('node:crypto');
const {restrictionIdentifiers} = require('./restriction-identities');
const {isAdminEmail} = require('./admin-access');
const {deleteGeneralInquiries} = require('./inquiry-retention');

const types = {
  permanent: {records: ['memberBans'], keys: ['memberBanKeys'], owner: 'banId'},
  cooldown: {records: ['rejoinBlocks', 'memberRejoinBlocks'], keys: ['rejoinBlockKeys', 'memberRejoinKeys'], owner: 'blockId'}
};
const dayMs = 86400000;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const failure = (status, code, message) => Object.assign(new Error(message), {status, code});
const until = data => Number(data.rejoinAllowedAtMs || data.untilMs || 0);
const isActive = (kind, data, now) => data && (kind === 'cooldown' ? until(data) > now : data.active !== false && !data.unbannedAt && !data.unbannedAtMs);
const refsFor = (db, collections, id) => collections.map(collection => db.collection(collection).doc(id));

function validateId(value) {
  if (typeof value !== 'string' || !value || value.length > 128 || /[/\x00-\x1f]/.test(value) || value === '.' || value === '..') {
    throw failure(400, 'INVALID_ID', '회원 또는 제한 기록을 다시 선택해 주세요.');
  }
  return value;
}

function checkTarget(actor, uid, record) {
  if (actor?.uid === uid || isAdminEmail(record?.email) || (record?.providerData || []).some(p => p.providerId === 'google.com' && isAdminEmail(p.email))) {
    throw failure(403, 'PROTECTED_ADMIN', '관리자 계정은 이 작업의 대상이 될 수 없어요.');
  }
}

async function getRecord(admin, uid) {
  try { return await admin.auth().getUser(uid); }
  catch (error) {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
  }
}

function putRestriction(writer, admin, db, kind, {uid, identifiers, email = '', nickname = '', provider = '', adminUid = '', days = 30}, state = {}) {
  const now = Date.now();
  const id = (kind === 'permanent' ? 'BAN-' : 'RJ-') + now + '-' + crypto.randomBytes(8).toString('hex');
  const spec = types[kind];
  const keyHashes = [...new Set(identifiers.map(digest))];
  const createdAt = admin.firestore.FieldValue.serverTimestamp();
  const timing = kind === 'cooldown' ? {rejoinAllowedAtMs: now + days * dayMs, expiresAt: new Date(now + days * dayMs)} : {};
  const reason = kind === 'cooldown' ? 'self_delete' : 'admin_force_delete';
  const identityScope = identifiers.every(value => value.startsWith('uid:')) ? 'previous_uid' : 'linked_identity';
  const details = kind === 'cooldown' ? {createdAtMs: now} : {active: true, bannedAtMs: now, bannedByUid: adminUid, email, nickname, provider, identityScope};
  for (const ref of refsFor(db, spec.records, id)) writer.set(ref, {uid, reason, keyHashes, createdAt, ...details, ...timing, ...state});
  for (const hash of keyHashes) {
    for (const ref of refsFor(db, spec.keys, hash)) writer.set(ref, {uid, [spec.owner]: id, reason, updatedAt: createdAt, ...timing});
  }
  const job = {kind, id, uid, identityScope, createdAtMs:now, ...timing, ...state};
  if (kind === 'cooldown' && state.deletionState === 'pending') writeRepair(writer, db, job);
  return job;
}

async function lookup(tx, db, kind, id) {
  const docs = await Promise.all(refsFor(db, types[kind].records, id).map(ref => tx.get(ref)));
  const record = docs.find(doc => doc.exists)?.data();
  if (kind !== 'cooldown' || (record && until(record) > Date.now())) return record;
  return (await tx.get(repairRef(db,id))).data() || record;
}

// Cleanup can be retried after the 30-day identity hashes expire. Keep only the
// subject UID and work state, never email, provider IDs or restriction hashes.
const repairs = 'memberWithdrawalRepairs';
const repairRef = (db,id) => db.collection(repairs).doc(id);
function writeRepair(writer, db, job) {
  writer.set(repairRef(db, job.id), {
    uid:job.uid, createdAtMs:job.createdAtMs, rejoinAllowedAtMs:job.rejoinAllowedAtMs,
    leaseId:job.leaseId, leaseUntilMs:job.leaseUntilMs, deletionState:'pending'
  });
}

const leaseMs = 10 * 60000;
function lease() {
  return {deletionState:'pending', leaseId:crypto.randomUUID(), leaseUntilMs:Date.now() + leaseMs};
}

function resume(tx, db, kind, id, data) {
  if (data.deletionState !== 'pending') return {kind, id, uid:data.uid, identityScope:data.identityScope, rejoinAllowedAtMs:until(data)};
  if (data.leaseUntilMs > Date.now()) throw failure(409, 'WITHDRAWAL_IN_PROGRESS', '탈퇴 처리 중이에요. 잠시 후 목록을 다시 확인해 주세요.');
  const state = lease();
  const job = {kind, id, uid:data.uid, createdAtMs:data.createdAtMs || data.bannedAtMs, identityScope:data.identityScope, rejoinAllowedAtMs:until(data), ...state};
  if (isActive(kind,data,Date.now())) for (const ref of refsFor(db, types[kind].records, id)) tx.set(ref, {...data, ...state});
  if (kind === 'cooldown') writeRepair(tx, db, job);
  return job;
}

async function begin(admin, db, kind, uid, actor, decoded) {
  validateId(uid);
  const record = await getRecord(admin, uid);
  if (kind === 'permanent') checkTarget(actor, uid, record);
  const ids = restrictionIdentifiers(uid, decoded, record);
  const hashes = ids.map(digest);
  return db.runTransaction(async tx => {
    // Read both kinds before claiming so a simultaneous self/admin request cannot start two deletions.
    for (const other of ['permanent', 'cooldown']) {
      const keyRefs = hashes.flatMap(hash => refsFor(db, types[other].keys, hash));
      const keyDocs = await Promise.all(keyRefs.map(ref => tx.get(ref)));
      for (const key of keyDocs) {
        if (!key.exists) continue;
        const id = key.data()[types[other].owner];
        if (!id) continue;
        const data = await lookup(tx, db, other, id);
        if (!isActive(other, data, Date.now())) continue;
        if (other !== kind || data.uid !== uid) throw failure(409, 'ALREADY_RESTRICTED', '이미 다른 이용 제한이 있어요. 제한 목록을 확인해 주세요.');
        // Older versions wrote the permanent ban before deleting the account, without a completion flag.
        // An explicit repeat on a still-existing auth account must finish that interrupted cleanup.
        if (other === 'permanent' && !data.deletionState && (record || (await tx.get(db.collection('users').doc(uid))).exists)) {
          const state = lease();
          for (const ref of refsFor(db, types[kind].records, id)) tx.set(ref, {...data, ...state});
          return {kind, id, uid, ...state};
        }
        return resume(tx, db, kind, id, data);
      }
    }
    if (!record) {
      const profile = kind === 'permanent' && await tx.get(db.collection('users').doc(uid));
      if (!profile?.exists) throw failure(404, 'AUTH_USER_NOT_FOUND', '회원 기록을 찾을 수 없어요. 목록을 새로고침해 주세요.');
      // Orphan profiles can be purged, but their editable email/provider are not proof of cross-account identity.
    }
    return putRestriction(tx, admin, db, kind, {uid, identifiers:ids, email:record?.emailVerified ? record.email : '', nickname:record?.displayName || '', provider:record?.providerData?.[0]?.providerId || (uid.startsWith('kakao_') ? 'kakao' : ''), adminUid:actor?.uid || ''}, lease());
  });
}

async function setDeletionState(db, job, success) {
  await db.runTransaction(async tx => {
    const data = await lookup(tx, db, job.kind, job.id);
    if (!data || data.leaseId !== job.leaseId) throw failure(409, 'STALE_WITHDRAWAL', '탈퇴 처리 상태가 변경되었어요. 목록을 다시 확인해 주세요.');
    if (job.kind === 'cooldown') {
      if (success) tx.delete(repairRef(db,job.id));
      else writeRepair(tx, db, {...job, leaseUntilMs:0, leaseId:''});
    }
    if (!isActive(job.kind,data,Date.now())) {
      for (const ref of refsFor(db, types[job.kind].records, job.id)) tx.delete(ref);
      return;
    }
    for (const ref of refsFor(db, types[job.kind].records, job.id)) tx.set(ref, {
      ...data, deletionState:success ? 'complete' : 'pending', ...(success ? {deletionCompletedAtMs:Date.now()} : {}), leaseUntilMs:0, leaseId:''
    });
  });
}

async function finish(admin, db, job, actor, deleteUserData) {
  if (!job.leaseId) return job;
  try {
    const record = await getRecord(admin, job.uid);
    if (job.kind === 'cooldown' && job.rejoinAllowedAtMs <= Date.now() && (!record || Date.parse(record.metadata?.creationTime) > job.createdAtMs)) {
      // All profile data is purged before Auth deletion. The original user is gone;
      // a new Kakao login may already have reused the same UID after the deadline.
      await setDeletionState(db, job, true);
      return job;
    }
    if (job.kind === 'permanent' || actor) checkTarget(actor, job.uid, record);
    if (record && !record.disabled) await admin.auth().updateUser(job.uid, {disabled:true});
    await deleteGeneralInquiries(db, job.uid);
    await deleteUserData(db, job.uid);
    if (record) {
      try { await admin.auth().deleteUser(job.uid); }
      catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    }
    await setDeletionState(db, job, true);
    return job;
  } catch (error) {
    await setDeletionState(db, job, false);
    throw error;
  }
}

async function withdraw(admin, db, {uid, actor, decoded, deleteUserData}) {
  const job = await begin(admin, db, actor ? 'permanent' : 'cooldown', uid, actor, decoded);
  return finish(admin, db, job, actor, deleteUserData);
}

async function retryWithdrawal(admin, db, kind, id, actor, deleteUserData, verifyProof) {
  validateId(id);
  const job = await db.runTransaction(async tx => {
    const data = await lookup(tx, db, kind, id);
    if (!data || (!isActive(kind, data, Date.now()) && data.deletionState !== 'pending')) throw failure(404, 'RESTRICTION_NOT_FOUND', '유효한 제한 기록을 찾지 못했어요.');
    verifyProof(data.uid);
    checkTarget(actor, data.uid);
    return resume(tx, db, kind, id, data);
  });
  return finish(admin, db, job, actor, deleteUserData);
}

async function listRestrictions(db, identityQuery = '') {
  const now = Date.now();
  const result = [];
  const needle = String(identityQuery || '').trim();
  const searchHashes = needle ? [digest('uid:' + needle), digest('email:' + needle.toLowerCase())] : [];
  for (const [kind, spec] of Object.entries(types)) {
    const seen = new Set();
    const searches = spec.records.flatMap(name => {
      const collection = db.collection(name);
      return kind === 'cooldown' ? ['rejoinAllowedAtMs','untilMs'].map(field => collection.where(field, '>', now)) : [collection];
    });
    const pages = await Promise.all(searches.map(query => query.get()));
    for (const page of pages) for (const doc of page.docs) {
      const data = doc.data();
      if (seen.has(doc.id) || !isActive(kind, data, now)) continue;
      seen.add(doc.id);
      if (needle && data.uid !== needle && !searchHashes.some(h => data.keyHashes?.includes(h)) && String(data.email || '').toLowerCase() !== needle.toLowerCase()) continue;
      result.push({kind, banId:doc.id, uid:data.uid || '', reason:data.reason || (kind === 'cooldown' ? 'self_delete' : 'admin_force_delete'),
        bannedAtMs:Number(data.bannedAtMs || data.createdAtMs || 0), rejoinAllowedAtMs:kind === 'cooldown' ? until(data) : null,
        email:data.email || '', nickname:data.nickname || '', provider:data.provider || '', identityScope:data.identityScope || null, deletionPending:data.deletionState === 'pending'});
    }
  }
  const pending = await db.collection(repairs).get();
  const listed = new Set(result.map(row => row.banId));
  for (const doc of pending.docs) {
    const data = doc.data();
    if (listed.has(doc.id) || until(data) > now || (needle && data.uid !== needle)) continue;
    result.push({kind:'cooldown', banId:doc.id, uid:data.uid, reason:'self_delete', deletionPending:true,
      bannedAtMs:data.createdAtMs, rejoinAllowedAtMs:until(data)});
  }
  return result.sort((a,b) => b.bannedAtMs - a.bannedAtMs || a.banId.localeCompare(b.banId));
}

async function release(admin, db, kind, id, actor) {
  validateId(id);
  const spec = types[kind];
  return db.runTransaction(async tx => {
    const recordRefs = refsFor(db, spec.records, id);
    const docs = await Promise.all(recordRefs.map(ref => tx.get(ref)));
    const records = docs.filter(doc => doc.exists).map(doc => doc.data());
    if (kind === 'cooldown' && (await tx.get(repairRef(db,id))).exists) throw failure(409, 'DELETION_PENDING', '회원 데이터 삭제를 먼저 마쳐 주세요.');
    if (!records.length) return true;
    if (records.some(record => record.deletionState === 'pending')) throw failure(409, 'DELETION_PENDING', '회원 데이터 삭제를 먼저 마쳐 주세요.');
    // Include legacy keys missing from the parent and only remove keys still owned by this restriction.
    const pages = await Promise.all(spec.keys.map(name => tx.get(db.collection(name).where(spec.owner, '==', id))));
    const record = records[0];
    const cutoff = Number(record.deletionCompletedAtMs || record.bannedAtMs || record.createdAtMs || Date.now());
    if (record.uid && cutoff > Date.now() - 2 * 3600000) {
      const marker = db.collection('rejoinBlockKeys').doc('SESSION-' + digest('uid:' + record.uid));
      const previous = await tx.get(marker);
      tx.set(marker, {revokedAuthTimeThrough:Math.max(Number(previous.data()?.revokedAuthTimeThrough || 0), Math.floor(cutoff / 1000)),
        expiresAt:new Date(Date.now() + 2 * 3600000)});
    }
    for (const page of pages) for (const key of page.docs) tx.delete(key.ref);
    for (const ref of recordRefs) tx.delete(ref);
    return true;
  });
}

module.exports = {putRestriction, withdraw, retryWithdrawal, listRestrictions, release, validateId};
