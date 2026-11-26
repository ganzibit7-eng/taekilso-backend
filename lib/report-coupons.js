'use strict';

const crypto = require('node:crypto');
const retention = require('./report-retention');
const {canOpenAdminReports} = require('./admin-access');
const products = new Set([
  ...require('./featured-report-core').all.map(reading => 'taekilso_' + reading.id + '_story_report'),
  require('./date-report').CONFIG.product,
  require('./relationship-report').CONFIG.product,
  require('./newyear-purchase').CONFIG.product
]);

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const dayMs = 86400000;
const attemptWindow = 10 * 60000;
const err = (status, code, message) => Object.assign(new Error(message), {status, code});
const unavailable = () => err(409, 'COUPON_UNAVAILABLE', '등록할 수 없는 쿠폰이에요. 번호와 등록 기한을 확인해 주세요.');
const digest = raw => crypto.createHash('sha256').update(raw).digest('hex');
const couponRef = (db, id) => db.collection('reportCoupons').doc(id);
const lookupRef = (db, raw) => db.collection('reportCouponKeys').doc(digest(raw));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(id) {
  if (typeof id !== 'string' || !uuid.test(id)) throw err(400, 'INVALID_COUPON_ID', '쿠폰을 다시 선택해 주세요.');
  return id.toLowerCase();
}
function generateCode() {
  // 32 independently uniform base32 symbols carry 160 bits of randomness.
  return Array.from(crypto.randomBytes(32), byte => alphabet[byte & 31]).join('');
}
function normalizeCode(value) {
  if (typeof value === 'string' && value.length <= 100) {
    const cleaned = value.replace(/[\s-]/g, '').toUpperCase();
    if (/^[0-9A-HJKMNP-TV-Z]{32}$/.test(cleaned)) return cleaned;
  }
  throw err(400, 'INVALID_COUPON_CODE', '32자리 쿠폰번호를 모두 입력해 주세요.');
}
function displayCoupon(id, data, now) {
  const expired = data.expiresAtMs != null && now >= data.expiresAtMs;
  return {
    couponId:id, product:data.product, hint:data.hint, issuedAtMs:data.issuedAtMs,
    expiresAtMs:data.expiresAtMs, status:data.status === 'issued' && expired ? 'expired' : data.status
  };
}
function displayPass(id, data) {
  return {
    couponId:id, product:data.product, state:data.state, redeemedAtMs:data.redeemedAtMs,
    ...retention.display(data), ...(data.reportId ? {reportId:data.reportId} : {})
  };
}

async function issue(db, input, clock) {
  if (!products.has(input.product)) throw err(400, 'INVALID_PRODUCT', '리포트 상품을 선택해 주세요.');
  const days = input.validDays === undefined ? 30 : input.validDays;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) {
    throw err(400, 'INVALID_VALIDITY', '등록 기한은 1~365일로 설정할 수 있어요.');
  }
  const id = validId(input.requestId);
  const ref = couponRef(db, id);
  const raw = generateCode();
  const key = lookupRef(db, raw);
  return db.runTransaction(async tx => {
    const [previous, duplicate] = await Promise.all([tx.get(ref), tx.get(key)]);
    if (previous.exists) throw err(409, 'COUPON_ALREADY_ISSUED', '이미 처리한 발급 요청이에요. 쿠폰 목록을 확인해 주세요.');
    if (duplicate.exists) throw err(503, 'COUPON_RETRY', '새 번호를 만들지 못했어요. 다시 시도해 주세요.');
    const now = clock();
    const coupon = {product:input.product, status:'issued', hint:raw.slice(-4), issuedAtMs:now, expiresAtMs:days === null ? null : now + days * dayMs};
    tx.set(ref, coupon);
    tx.set(key, {couponId:id});
    return {ok:true, code:raw.match(/.{4}/g).join('-'), coupon:displayCoupon(id, coupon, now)};
  });
}

async function revoke(db, input, clock) {
  const id = validId(input.couponId);
  const ref = couponRef(db, id);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw err(404, 'COUPON_NOT_FOUND', '쿠폰을 찾을 수 없어요.');
    const now = clock(), coupon = displayCoupon(id, snap.data(), now);
    if (coupon.status === 'revoked') return {ok:true, coupon};
    if (coupon.status !== 'issued') throw err(409, 'COUPON_NOT_REVOCABLE', '등록 대기 중인 쿠폰만 취소할 수 있어요.');
    tx.set(ref, {status:'revoked', revokedAtMs:now}, {merge:true});
    return {ok:true, coupon:{...coupon, status:'revoked'}};
  });
}

async function redeem(db, uid, input, clock) {
  const raw = normalizeCode(input.code);
  const member = db.collection('users').doc(uid);
  const attempts = member.collection('accountChecks').doc('couponRedemption');
  const result = await db.runTransaction(async tx => {
    const [user, throttle] = await Promise.all([tx.get(member), tx.get(attempts)]);
    if (!user.exists) throw err(409, 'PROFILE_NOT_READY', '회원 가입을 마친 뒤 다시 등록해 주세요.');
    const now = clock(), last = throttle.data();
    const withinWindow = last && now < last.untilMs;
    if (withinWindow && last.failures >= 12) throw err(429, 'COUPON_RATE_LIMITED', '등록 요청이 많아요. 10분 뒤에 다시 시도해 주세요.');
    const lookup = await tx.get(lookupRef(db, raw));
    const id = lookup.data()?.couponId;
    if (id) {
      const ref = couponRef(db, id);
      const owned = member.collection('reportCouponPasses').doc(id);
      const [voucher, pass] = await Promise.all([tx.get(ref), tx.get(owned)]);
      const data = voucher.data();
      if (data && products.has(data.product)) {
        const rights = pass.data();
        if (data.status === 'redeemed' && rights?.product === data.product &&
            ['available','used'].includes(rights.state) && retention.expiresAtMs(rights) > now) {
          return {ok:true, alreadyRedeemed:true, pass:displayPass(id, rights)};
        }
        if (displayCoupon(id, data, now).status === 'issued' && !pass.exists) {
          const rights = {product:data.product, state:'available', redeemedAtMs:now, [retention.FIELD]:new Date(retention.anniversary(now))};
          tx.set(owned, rights);
          tx.set(ref, {status:'redeemed', redeemedAtMs:now}, {merge:true});
          if (throttle.exists) tx.delete(attempts);
          return {ok:true, alreadyRedeemed:false, pass:displayPass(id, rights)};
        }
      }
    }
    // Commit the failed attempt before reporting the error to the caller.
    tx.set(attempts, {untilMs:withinWindow ? last.untilMs : now + attemptWindow, failures:withinWindow ? last.failures + 1 : 1});
    return null;
  });
  if (!result) throw unavailable();
  return result;
}

async function run(db, identity, input, clock = Date.now) {
  if (!identity?.uid) throw err(401, 'UNAUTHORIZED', '로그인이 필요해요.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw err(400, 'INVALID_REQUEST', '요청 내용을 다시 확인해 주세요.');
  if (input.action === 'redeem') return redeem(db, identity.uid, input, clock);
  if (input.action === 'wallet') {
    const existing = await db.collection('users').doc(identity.uid).collection('reportCouponPasses').where('state', '==', 'available').get();
    const now = clock();
    const passes = existing.docs.filter(ref => products.has(ref.data().product) && retention.expiresAtMs(ref.data()) > now).map(ref => displayPass(ref.id, ref.data()));
    return {ok:true, passes:passes.sort((a, b) => a.expiresAtMs - b.expiresAtMs || a.couponId.localeCompare(b.couponId))};
  }
  if (!canOpenAdminReports(identity)) throw err(403, 'FORBIDDEN', '쿠폰 발급 관리는 관리자만 이용할 수 있어요.');
  if (input.action === 'issue') return issue(db, input, clock);
  if (input.action === 'revoke') return revoke(db, input, clock);
  if (input.action === 'list') {
    let query = db.collection('reportCoupons').orderBy('issuedAtMs', 'desc');
    if (input.cursor != null) {
      const cursor = await couponRef(db, validId(input.cursor)).get();
      if (!cursor.exists) throw err(400, 'INVALID_CURSOR', '목록을 새로 불러와 주세요.');
      query = query.startAfter(cursor);
    }
    const existing = await query.limit(51).get();
    const page = existing.docs.slice(0, 50);
    const now = clock();
    return {ok:true, coupons:page.map(ref => displayCoupon(ref.id, ref.data(), now)), nextCursor:existing.docs.length > 50 ? page[49].id : null};
  }
  throw err(400, 'UNKNOWN_ACTION', '지원하지 않는 쿠폰 작업이에요.');
}

module.exports = {run};
