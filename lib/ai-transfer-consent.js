'use strict';

const NOTICE_VERSION = '2026-11-19-v1';
const REQUIRED = {
  error: 'AI_TRANSFER_CONSENT_REQUIRED',
  message: 'AI 상담을 시작하려면 개인정보 국외 이전에 동의해 주세요.',
  usageCharged: false
};
const failure = (status,code,message) => Object.assign(new Error(message),{status,code});

function status(user) {
  const record = user?.aiTransferConsent;
  const agreed = record?.version === NOTICE_VERSION && record.state === 'granted';
  return {
    noticeVersion: NOTICE_VERSION,
    revision: Number.isSafeInteger(record?.revision) ? record.revision : 0,
    state: agreed ? 'granted' : record?.state === 'withdrawn' ? 'withdrawn' : record?.state === 'granted' ? 'renewal_required' : 'not_granted',
    changedAtMs: Number.isSafeInteger(record?.changedAtMs) ? record.changedAtMs : null
  };
}

async function manage(db,uid,body,now=Date.now) {
  const {operation,noticeVersion,expectedRevision} = body;
  if (!['status','grant','withdraw'].includes(operation)) throw failure(400,'INVALID_CONSENT_OPERATION','요청을 확인해 주세요.');
  if (operation==='grant' && noticeVersion!==NOTICE_VERSION) throw failure(409,'AI_CONSENT_NOTICE_VERSION','안내가 바뀌었어요. 새로고침한 뒤 확인해 주세요.');
  const ref = db.collection('users').doc(uid);
  const read = snapshot => {
    if (!snapshot.exists) throw failure(401,'UNAUTHORIZED','로그인한 계정을 확인해 주세요.');
    return status(snapshot.data());
  };
  if (operation==='status') return read(await ref.get());
  return db.runTransaction(async tx => {
    const previous = read(await tx.get(ref));
    const state = operation==='grant' ? 'granted' : 'withdrawn';
    if (previous.state===state) return previous;
    // A form opened before a withdrawal cannot grant consent again by retrying.
    if (operation==='grant' && expectedRevision!==previous.revision) {
      throw failure(409,'AI_CONSENT_STATE_CHANGED','동의 상태가 바뀌었어요. 다시 확인해 주세요.');
    }
    const record = {version:NOTICE_VERSION,state,revision:previous.revision+1,changedAtMs:now()};
    tx.update(ref,{aiTransferConsent:record});
    return status({aiTransferConsent:record});
  });
}

async function assertGranted(db,uid,revision) {
  const snapshot = await db.collection('users').doc(uid).get();
  const current = status(snapshot.data());
  if (current.state!=='granted' || (revision!==undefined && current.revision!==revision)) {
    throw failure(403,REQUIRED.error,REQUIRED.message);
  }
  return current.revision;
}

function guardProvider(db,uid,revision,fetchImpl) {
  return async (url,options) => {
    await assertGranted(db,uid,revision);
    return fetchImpl(url,options);
  };
}

module.exports = {NOTICE_VERSION,REQUIRED,status,manage,assertGranted,guardProvider};
