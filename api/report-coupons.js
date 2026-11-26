'use strict';

const admin = require('firebase-admin');
const {authenticate} = require('../lib/member-access');
const coupons = require('../lib/report-coupons');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  // Both Google and Kakao members use a Firebase session with revocation checks.
  if (!String(req.headers?.authorization || '').startsWith('Bearer ')) {
    return res.status(401).json({error:'UNAUTHORIZED',message:'로그인 후 쿠폰을 이용해 주세요.'});
  }
  try {
    const db = admin.firestore();
    const identity = await authenticate(req, admin, db);
    return res.status(200).json(await coupons.run(db, identity, req.body));
  } catch (error) {
    if (error.status) return res.status(error.status).json({error:error.code, message:error.message});
    console.error('[report-coupons] request failed');
    return res.status(500).json({error:'SERVER_ERROR', message:'쿠폰을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'});
  }
};
