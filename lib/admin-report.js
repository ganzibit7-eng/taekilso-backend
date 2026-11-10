'use strict';

const ORIGINS=new Set(['https://taekilso.com','https://www.taekilso.com']);
const ADMIN_EMAIL='green092432@gmail.com';
const number=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):0;
function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}

module.exports=function createAdminReport({db,auth,documentId}){
  return async function handler(req,res){
    res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Origin');
    const origin=req.headers?.origin;
    if(origin&&!ORIGINS.has(origin))return res.status(403).json({error:'ORIGIN_NOT_ALLOWED'});
    if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
    if(req.method==='OPTIONS')return res.status(204).end();
    if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    const token=String(req.headers?.authorization||'').match(/^Bearer\s+(\S+)$/i)?.[1];
    if(!token)return res.status(401).json({error:'UNAUTHORIZED'});
    let actor;
    try{actor=await auth.verifyIdToken(token,true);}catch(_){return res.status(401).json({error:'UNAUTHORIZED'});}
    if(String(actor.email||'').trim().toLowerCase()!==ADMIN_EMAIL||actor.email_verified!==true)return res.status(403).json({error:'FORBIDDEN'});
    const {start,end}=req.query||{};
    if(!validDate(start)||!validDate(end)||start>end||Date.parse(end)-Date.parse(start)>179*86400000)return res.status(400).json({error:'INVALID_RANGE'});
    if(!db)return res.status(503).json({error:'REPORT_UNAVAILABLE'});
    try{
      const snap=await db.collection('dailySeoLanding').where(documentId,'>=',start+'__').where(documentId,'<=',end+'__\uf8ff').limit(2001).get();
      const rows=snap.docs.slice(0,2000).map(doc=>{
        const d=doc.data()||{};return {date:doc.id.slice(0,10),slug:String(d.slug||doc.id.slice(12)).slice(0,200),visits:number(d.visits),signups:number(d.signups),firstAiAnswers:number(d.firstAiAnswers),freeLimitExhausted:number(d.freeLimitExhausted),purchases:number(d.purchases)};
      });
      return res.status(200).json({rows,capped:snap.docs.length>2000,start,end});
    }catch(_){return res.status(503).json({error:'REPORT_UNAVAILABLE'});}
  };
};
