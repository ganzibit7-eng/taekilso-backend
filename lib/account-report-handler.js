'use strict';
const admin = require('firebase-admin');
const { authenticate } = require('./member-access');
const { canOpenAdminReports } = require('./admin-access');

module.exports = function accountReportHandler(run, label) {
  return async (req,res) => {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Kakao-Access-Token');
    res.setHeader('Cache-Control','no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    try {
      const db = admin.firestore();
      const identity = await authenticate(req,admin,db);
      if (!identity) return res.status(401).json({error:'UNAUTHORIZED'});
      const result = await run(db,identity.uid,req.body || {},Date.now(),canOpenAdminReports(identity));
      return res.status(200).json(result);
    } catch (error) {
      if (error.status) return res.status(error.status).json({error:error.code,message:error.message});
      console.error('['+label+']',error.code || 'SERVER_ERROR');
      return res.status(500).json({error:'SERVER_ERROR',message:'리포트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'});
    }
  };
};
