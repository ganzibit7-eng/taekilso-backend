'use strict';
const service=require('./consultation-service');
const {transport,MODEL,CLAUDE}=require('./openai-comparison');
const FALLBACK_ERRORS=new Set(['AI_UPSTREAM_ERROR','AI_TIMEOUT','COMPARISON_PROVIDER_LIMIT']);
const fail=code=>Object.assign(new Error(code),{code,status:503});
// Default and emergency rollback use the original Claude path unchanged.
// Only server settings select providers; request bodies cannot override them.
async function generate(options,{db,env=process.env,generateImpl=service.generate}={}){
 if(env.AI_PRIMARY_PROVIDER!=='openai')return generateImpl(options);
 if(env.OPENAI_MODEL!==MODEL)throw fail('AI_MODEL_NOT_ALLOWED');
 const limits={AI_COMPARE_DAILY_USD:env.AI_PROVIDER_DAILY_USD,AI_COMPARE_MONTHLY_USD:env.AI_PROVIDER_MONTHLY_USD,
  AI_COMPARE_TOTAL_USD:env.AI_PROVIDER_TOTAL_USD,AI_COMPARE_APPROVED_UNTIL:env.AI_PROVIDER_APPROVED_UNTIL};
 const records=[],now=options.now||new Date();let primaryError;
 for(const provider of ['openai','anthropic']){
  if(provider==='anthropic'&&(!primaryError||!FALLBACK_ERRORS.has(primaryError.code)))break;
  const key=provider==='openai'?env.OPENAI_API_KEY:options.key;
  if(!key)throw fail('AI_PROVIDER_KEY_MISSING');
  try{
   const result=await generateImpl({...options,now,model:provider==='openai'?MODEL:CLAUDE,key:'server-transport',
    fetchImpl:transport({provider,key,db,env:limits,fetchImpl:options.fetchImpl||fetch,now,records,namespace:'aiProvider'})});
   const known=records.every(r=>Number.isFinite(r.estimated_usd));
   return {...result,diagnostics:{...result.diagnostics,selected_provider:provider,fallback_used:!!primaryError,
    provider_calls:records.length,models:[...new Set(records.map(r=>r.model))],
    estimated_usd:known?records.reduce((n,r)=>n+r.estimated_usd,0):null,
    cost_basis:'Standard USD estimates for GPT-6.2 Sol and Claude Haiku 4.5. Shared conservative reservations cover primary and fallback, including failures. Excludes tax/FX.',
    routing_calls:records}};
  }catch(error){
   if(provider==='openai'&&FALLBACK_ERRORS.has(error.code)){primaryError=error;continue;}
   throw error;
  }
 }
 throw primaryError||fail('AI_UPSTREAM_ERROR');
}
module.exports={generate,FALLBACK_ERRORS};
