const crypto = require('node:crypto');

function failure(code, status = 409) {
  return Object.assign(new Error(code), { code, status });
}
function millis(value) {
  return value && typeof value.toMillis === 'function' ? value.toMillis() : Number(value || 0);
}

// The receipt and usage reservation commit together. An unresolved request fails closed:
// never release it on a timer while an upstream request might still be running.
module.exports = function createUsageLedger({ db, fieldValue, secret, dateKey, now = Date.now }) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  function seal(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return [iv, cipher.getAuthTag(), body].map(x => x.toString('base64')).join('.');
  }
  function open(value) {
    const [iv, tag, body] = value.split('.').map(x => Buffer.from(x, 'base64'));
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(body), cipher.final()]).toString());
  }
  function refs(uid, requestId) {
    return {
      receipt: db.collection('aiRequestLedger').doc(hash(uid + ':' + requestId)),
      lock: db.collection('aiRequestLocks').doc(hash(uid)),
      user: db.collection('users').doc(uid)
    };
  }
  async function reserve(uid, isAdmin, requestId, fingerprint) {
    const ref = refs(uid, requestId);
    const today = dateKey();
    const daily = db.collection('aiDailyUsage').doc(`${uid}_${today}`);
    const attempt = crypto.randomUUID();
    return db.runTransaction(async tx => {
      const receipt = await tx.get(ref.receipt);
      if (receipt.exists) {
        const prior = receipt.data();
        if (prior.fingerprint !== fingerprint) throw failure('REQUEST_ID_CONFLICT');
        if (prior.state === 'completed') {
          try { return { replay: open(prior.response) }; }
          catch (_) { throw failure('REPLAY_UNAVAILABLE'); }
        }
        if (prior.state === 'pending') throw failure('REQUEST_IN_PROGRESS');
      }
      const lock = await tx.get(ref.lock);
      if (lock.exists) throw failure('REQUEST_IN_PROGRESS');
      const userSnap = await tx.get(ref.user);
      const user = userSnap.exists ? userSnap.data() : {};
      const premium = !!user.premium && millis(user.premiumUntil) > now();
      const dailySnap = await tx.get(daily);
      const count = dailySnap.exists ? Number(dailySnap.data().count || 0) : 0;
      const used = Math.max(0, Number(user.aiFreeUsed || 0));
      const credits = Math.max(0, Number(user.aiQuestionCredits || 0));
      let reservation;
      if (premium || isAdmin) {
        const limit = isAdmin ? 100 : 15;
        if (count >= limit) throw failure('DAILY_LIMIT_REACHED', 403);
        reservation = { kind: isAdmin ? 'admin' : 'premium', todayKey: today, freeUsed: null, usingCredit: false, questionCreditsLeft: null, dailyUsed: count + 1, dailyLimit: limit, isAdmin };
        tx.set(daily, { count: count + 1, uid, date: today, updatedAt: fieldValue.serverTimestamp() }, { merge: true });
      } else if (used < 3) {
        reservation = { kind: 'free', freeUsed: used + 1, usingCredit: false, questionCreditsLeft: credits, dailyUsed: null };
        tx.set(ref.user, { aiFreeUsed: used + 1 }, { merge: true });
      } else if (credits > 0) {
        reservation = { kind: 'credit', freeUsed: used, usingCredit: true, questionCreditsLeft: credits - 1, dailyUsed: null };
        tx.set(ref.user, { aiQuestionCredits: credits - 1 }, { merge: true });
      } else {
        throw failure('FREE_LIMIT_REACHED', 403);
      }
      const result = { ...reservation, requestId, attempt };
      tx.set(ref.receipt, { fingerprint, state: 'pending', reservation: result, startedAt: now() });
      tx.set(ref.lock, { requestId, attempt, startedAt: now() });
      return result;
    });
  }
  async function finish(uid, reservation, response) {
    const ref = refs(uid, reservation.requestId);
    await db.runTransaction(async tx => {
      const receipt = await tx.get(ref.receipt);
      if (!receipt.exists || receipt.data().state !== 'pending' || receipt.data().reservation.attempt !== reservation.attempt) throw failure('RESERVATION_MISMATCH');
      // Replay payload is encrypted. No question, profile, birth date or plain reply in this ledger.
      tx.update(ref.receipt, {
        state: 'completed', response: seal(response), completedAt: now(),
        model: response.model || null,
        tokenUsage: response.tokenUsage || null,
        usageKind: reservation.kind
      });
      tx.delete(ref.lock);
    });
  }
  async function rollback(uid, reservation) {
    if (!reservation || !reservation.requestId) return;
    const ref = refs(uid, reservation.requestId);
    await db.runTransaction(async tx => {
      const receipt = await tx.get(ref.receipt);
      if (!receipt.exists || receipt.data().state !== 'pending' || receipt.data().reservation.attempt !== reservation.attempt) return;
      const daily = db.collection('aiDailyUsage').doc(`${uid}_${reservation.todayKey}`);
      const target = ['admin', 'premium'].includes(reservation.kind) ? daily : ref.user;
      const snapshot = await tx.get(target);
      const current = snapshot.exists ? snapshot.data() : {};
      if (reservation.kind === 'free') tx.set(target, { aiFreeUsed: Math.max(0, Number(current.aiFreeUsed || 0) - 1) }, { merge: true });
      else if (reservation.kind === 'credit') tx.set(target, { aiQuestionCredits: Number(current.aiQuestionCredits || 0) + 1 }, { merge: true });
      else tx.set(target, { count: Math.max(0, Number(current.count || 0) - 1) }, { merge: true });
      tx.update(ref.receipt, { state: 'failed', failedAt: now() });
      tx.delete(ref.lock);
    });
  }
  return { reserve, finish, rollback };
};
