'use strict';
const crypto = require('node:crypto');
const { ms } = require('./payment-entitlements');
const { hasPass } = require('./newyear-access');
const RETRY_AFTER = 30 * 60 * 1000;

function failure(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function record(snap, present) {
  const data = snap.data();
  return { id:snap.id, report:present ? present(data.report) : data.report, createdAtMs:data.createdAtMs };
}

function validateReportId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) {
    throw failure(400,'INVALID_REPORT','리포트가 올바르지 않아요.');
  }
  return id;
}

function pendingState(prior, id, uid, config, allowResume) {
  if (!prior || prior.uid!==uid || prior.product!==config.product || !(config.acceptedPrices||[config.price]).includes(prior.amount) ||
      prior[config.orderKey]!==id || prior.status!=='pending') return null;
  const state=Number(prior.lastPayState);
  if (allowResume && state===1 && prior.resumeUrl) return {state:'resume',id,resumeUrl:prior.resumeUrl};
  if (state===1 || state===10) return allowResume ? {state:'pending',id,waiting:state===10?'deposit':'provider'} : {state:'pending',id};
  return null;
}

async function run(config, db, uid, payload, now = Date.now()) {
  const { collection, product, price, name, orderKey, validate, calculate, includePremium, present } = config;
  const userRef = db.collection('users').doc(uid);
  const reports = userRef.collection(collection);
  if (payload.operation === 'list') {
    let query = reports.where('readyAtMs','>',0).orderBy('readyAtMs','desc');
    if (payload.before != null) {
      const cursor = await reports.doc(validateReportId(payload.before)).get();
      if (!cursor.data()?.ready) throw failure(409,'LIST_CHANGED','리포트 목록이 바뀌었어요. 처음부터 다시 확인해 주세요.');
      query = query.startAfter(cursor);
    }
    const compact = payload.summaryOnly === true && typeof config.listSummary === 'function';
    if (compact) query=query.select('createdAtMs','report.people','readyAtMs');
    const snap = await query.limit(31).get();
    const reportsPage=snap.docs.slice(0,30).map(doc=>{
      if (!compact) return record(doc,present);
      const data=doc.data();
      return {id:doc.id,createdAtMs:data.createdAtMs,...config.listSummary(data.report)};
    });
    return {reports:reportsPage,next:snap.docs.length>30?snap.docs[29].id:null};
  }
  if (payload.operation === 'open') {
    const snap = await reports.doc(validateReportId(payload.id)).get();
    if (!snap.exists) throw failure(404,'REPORT_NOT_FOUND','이 계정에서 리포트를 찾지 못했어요.');
    const stored=snap.data();
    if(stored.ready) return {state:'ready', ...record(snap,present)};
    if(payload.allowResume===true && stored.state==='pending' && stored.orderId) {
      const [order,setting]=await Promise.all([db.collection('paymentOrders').doc(stored.orderId).get(),db.collection('siteSettings').doc('checkout').get()]);
      if(setting.data()?.enabled===true){
        const pending=pendingState(order.data(),snap.id,uid,config,true);
        if(pending) return pending;
      }
    }
    return {state:stored.state};
  }
  if (payload.operation !== 'prepare') throw failure(400,'INVALID_OPERATION','요청을 다시 확인해 주세요.');
  const request = validate(payload.comparison);
  const id = crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const ref = reports.doc(id);
  const user = await userRef.get();
  if (!user.exists) throw failure(409,'PROFILE_NOT_READY','로그인이 완료된 뒤 다시 시도해 주세요.');
  const premium = includePremium && await hasPass(db,uid,user.data(),false,now);
  return db.runTransaction(async tx => {
    const [member, existing, setting] = await Promise.all([
      tx.get(userRef), tx.get(ref), tx.get(db.collection('siteSettings').doc('checkout'))
    ]);
    if (!member.exists) throw failure(409,'PROFILE_NOT_READY','로그인이 완료된 뒤 다시 시도해 주세요.');
    const stored = existing.data();
    if (stored?.ready) return { state:'ready', ...record(existing,present) };
    if (premium && member.data().premium === true && ms(member.data().premiumUntil) > now) {
      const report = calculate(request);
      tx.set(ref,{report,ready:true,readyAtMs:now,state:'ready',createdAtMs:now});
      return {state:'ready',id,report,createdAtMs:now};
    }
    if (!setting.exists || setting.data()?.enabled !== true) return {state:'paused'};
    if (payload.checkout !== true) return {state:'available'};
    if (stored?.orderId) {
      const prior = (await tx.get(db.collection('paymentOrders').doc(stored.orderId))).data();
      const pending=pendingState(prior,id,uid,config,payload.allowResume===true);
      if(pending) return pending;
      if (prior?.status === 'pending' &&
          (Number(prior.lastPayState) === 10 || now - ms(prior.createdAtMs) < RETRY_AFTER)) {
        return {state:'pending',id};
      }
    }
    const orderId = 'TAK-' + now.toString(36).toUpperCase() + '-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    tx.create(db.collection('paymentOrders').doc(orderId),{
      uid, product, amount:price, status:'pending', createdAtMs:now, [orderKey]:id
    });
    tx.set(ref,{report:calculate(request),orderId,ready:false,state:'pending',createdAtMs:now});
    return {state:'checkout',id,orderId,price,name};
  });
}


module.exports = { failure, run };
