'use strict';
// Non-billable preview smoke check; never exposes configured secrets or users.
module.exports=(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({error:'NOT_FOUND'});
 if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const {FIXTURES,MODEL,CLAUDE}=require('../lib/openai-comparison');
 const bundle=require('../lib/consultation-calculation').build(FIXTURES.career,new Date('2026-11-18T00:00:00Z'),false);
 return res.status(200).json({environment:'preview',node:process.version,billable_calls:0,
  primary_model:MODEL,fallback_model:CLAUDE,configured:{openai:!!process.env.OPENAI_API_KEY,claude:!!process.env.ANTHROPIC_API_KEY,firebase:!!process.env.FIREBASE_SERVICE_ACCOUNT_JSON},
  fixture:'career',synthetic:true,calculation_version:bundle.version,day:bundle.charts[0].candidates[0].pillars.day.ganZhi,
  prompt_version:require('../lib/consultation-prompt').VERSION});
};
