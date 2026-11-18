const {test}=require('node:test'),assert=require('node:assert/strict');
const router=require('../lib/consultation-router');
const env={AI_PRIMARY_PROVIDER:'openai',OPENAI_MODEL:'gpt-6.2-sol',OPENAI_API_KEY:'not-a-real-key'};
const options={body:{provider:'attacker',model:'attacker'},key:'claude-server-key'};
test('default and rollback retain original Claude options and ignore client model choice',async()=>{
 for(const setting of [undefined,'anthropic']){let received;await router.generate(options,{env:{AI_PRIMARY_PROVIDER:setting},generateImpl:async o=>{received=o;return {};}});assert.equal(received,options);}
});
test('GPT is primary and successful response never calls Claude',async()=>{
 const models=[];const r=await router.generate(options,{env,generateImpl:async o=>{models.push(o.model);return {reply:'ok',diagnostics:{}};}});
 assert.deepEqual(models,['gpt-6.2-sol']);assert.equal(r.diagnostics.fallback_used,false);
});
test('transient GPT errors fall back once to the existing Claude model',async()=>{
 for(const code of router.FALLBACK_ERRORS){const models=[];const r=await router.generate(options,{env,generateImpl:async o=>{models.push(o.model);if(models.length===1)throw Object.assign(new Error(code),{code});return {reply:'fallback',diagnostics:{}};}});assert.deepEqual(models,['gpt-6.2-sol','claude-haiku-4-5-20251001']);assert.equal(r.diagnostics.fallback_used,true);}
});
test('budget exhaustion, expiry, refusal or validation failure never bypass limits through fallback',async()=>{
 for(const code of ['COMPARISON_BUDGET_EXHAUSTED','COMPARISON_APPROVAL_EXPIRED','AI_INCOMPLETE_RESPONSE','AI_EVIDENCE_VALIDATION_FAILED']){let calls=0;await assert.rejects(router.generate(options,{env,generateImpl:async()=>{calls++;throw Object.assign(new Error(code),{code});}}),{code});assert.equal(calls,1);}
});
test('both providers failing cannot loop and model configuration fails closed',async()=>{
 let calls=0;await assert.rejects(router.generate(options,{env,generateImpl:async()=>{calls++;throw Object.assign(new Error('timeout'),{code:'AI_TIMEOUT'});}}));assert.equal(calls,2);
 await assert.rejects(router.generate(options,{env:{...env,OPENAI_MODEL:'unapproved'}}),{code:'AI_MODEL_NOT_ALLOWED'});
});
