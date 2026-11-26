'use strict';

const admin = require('firebase-admin');
const crypto = require('node:crypto');
const {canOpenAdminReports} = require('../lib/admin-access');
const {withdraw, retryWithdrawal, listRestrictions, release, validateId} = require('../lib/member-restrictions');
const {deleteUserData} = require('./_ban');

function failure(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}

async function requireAdmin(req, sdk) {
  const header = String(req.headers?.authorization || '').trim();
  if (!header.startsWith('Bearer ') || header.length > 8192) throw failure(401, 'UNAUTHORIZED', '관리자 로그인이 필요해요.');
  const actor = await sdk.auth().verifyIdToken(header.slice(7).trim(), true);
  if (!canOpenAdminReports({...actor, signInProvider:actor.firebase?.sign_in_provider})) {
    throw failure(403, 'FORBIDDEN', '관리자만 사용할 수 있어요.');
  }
  return actor;
}

function requireDeleteProof(body, actor, uid) {
  const expected = process.env.ADMIN_DELETE_PASSWORD;
  const sent = typeof body.deletePassword === 'string' ? body.deletePassword : '';
  if (sent) {
    if (expected) {
      const left = crypto.createHash('sha256').update(sent).digest();
      const right = crypto.createHash('sha256').update(expected).digest();
      if (crypto.timingSafeEqual(left, right)) return;
    }
    throw failure(403, 'INVALID_DELETE_PASSWORD', '관리자 삭제 비밀번호를 다시 확인해 주세요.');
  }
  const age = Date.now() / 1000 - actor.auth_time;
  if (body.confirmUid !== uid || !Number.isInteger(actor.auth_time) || age < -30 || age > 300) {
    throw failure(403, 'ADMIN_REAUTH_REQUIRED', '같은 관리자 Google 계정으로 다시 인증한 뒤 진행해 주세요.');
  }
}

function restrictionKind(value) {
  if (value === undefined || value === 'permanent') return 'permanent';
  if (value === 'cooldown') return value;
  throw failure(400, 'INVALID_RESTRICTION_KIND', '제한 종류를 확인해 주세요.');
}

function makeHandler(sdk, purge = deleteUserData) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    try {
      if (!sdk.apps.length) sdk.initializeApp({credential:sdk.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
      const actor = await requireAdmin(req, sdk);
      const db = sdk.firestore();
      const body = req.body || {};
      if (body.action === 'list_bans') {
        if (body.identityQuery !== undefined && (typeof body.identityQuery !== 'string' || body.identityQuery.length > 320)) throw failure(400, 'INVALID_QUERY', '이메일 또는 회원 ID를 입력해 주세요.');
        return res.status(200).json({ok:true, bans:await listRestrictions(db, body.identityQuery)});
      }
      if (body.action === 'unban_user') {
        const kind = restrictionKind(body.kind);
        const found = await release(sdk, db, kind, body.banId, actor);
        if (!found) throw failure(404, 'BAN_NOT_FOUND', '이미 해제되었거나 만료된 기록이에요.');
        return res.status(200).json({ok:true, unbanned:true, banId:body.banId});
      }
      if (['force_delete','delete_user','retry_withdrawal'].includes(body.action)) {
        let job;
        if (body.action === 'retry_withdrawal') {
          const kind = restrictionKind(body.kind);
          // Verify the exact stored subject before retrying, even for a passwordless confirmation.
          job = await retryWithdrawal(sdk, db, kind, body.banId, actor, purge, uid => requireDeleteProof(body, actor, uid));
        } else {
          const uid = validateId(body.uid);
          requireDeleteProof(body, actor, uid);
          job = await withdraw(sdk, db, {uid, actor, deleteUserData:purge});
        }
        return res.status(200).json({ok:true, deleted:true, uid:job.uid, banId:job.id, identityScope:job.identityScope || null, permanentlyBanned:job.kind === 'permanent'});
      }
      return res.status(400).json({error:'UNKNOWN_ACTION', message:'지원하지 않는 작업이에요.'});
    } catch (error) {
      if (error.status) return res.status(error.status).json({error:error.code, message:error.message});
      if (String(error.code || '').startsWith('auth/') && ['auth/id-token-expired','auth/id-token-revoked','auth/argument-error','auth/user-disabled','auth/user-not-found','auth/invalid-id-token'].includes(error.code)) {
        return res.status(401).json({error:'UNAUTHORIZED', message:'관리자 로그인 상태를 다시 확인해 주세요.'});
      }
      console.error('[admin-member-security] operation failed', error.code || 'INTERNAL');
      return res.status(500).json({error:'SERVER_ERROR', message:'처리를 마치지 못했어요. 제한 목록을 새로고침해 처리 상태를 확인해 주세요.'});
    }
  };
}
module.exports = makeHandler(admin);
module.exports.makeHandler = makeHandler;
