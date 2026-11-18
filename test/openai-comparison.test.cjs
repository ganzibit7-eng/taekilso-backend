'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const cmp=require('../lib/openai-comparison'),budget=require('../lib/comparison-budget');
const env={AI_COMPARE_ENABLED:'true',OPENAI_API_KEY:'secret-openai-fixture',ANTHROPIC_API_KEY:'secret-claude-fixture',OPENAI_COMPARE_MODEL:cmp.MODEL,AI_COMPARE_DAILY_USD:'1',AI_COMPARE_MONTHLY_USD:'1',AI_COMPARE_TOTAL_USD:'1',AI_COMPARE_APPROVED_UNTIL:'2026-12-09T00:00:00Z'};
const now=new Date('2026-11-18T00:00:00Z');
function dbMock(){
 const values=new Map();let chain=Promise.resolve();
 const ref=(collection,id)=>({path:collection+'/'+id,async set(data,options){const old=values.get(this.path)||{};values.set(this.path,options?.merge?{...old,...data}:data);}});
 return {values,collection:name=>({doc:id=>ref(name,id)}),runTransaction(fn){
  const run=chain.then(async()=>{const writes=[];const result=await fn({get:async r=>({exists:values.has(r.path),data:()=>values.get(r.path)}),set:(r,d)=>writes.push([r,d])});for(const [r,d]of writes)await r.set(d);return result;});chain=run.catch(()=>{});return run;
 }};
}
function answer(){return {status:'answer',headline:'업무 조건을 같은 기준으로 살펴봐요.',blocks:[{kind:'practical_suggestion',title:'확인할 조건',text:'연봉과 야근 조건을 제안서로 확인해 보세요.',reference_id:null}],options:[],actions:['희망 조건을 적어보세요.'],follow_up_question:null,data_limitations:[]};}
function fakeFetch(calls,{invalidFirst=false,timeout=false,refusal=false}={}){return async(url,options)=>{
 const p=JSON.parse(options.body);calls.push({url,p,headers:options.headers});
 if(timeout)throw Object.assign(new Error('secret provider body'),{name:'AbortError'});
 const a=invalidFirst&&calls.length===1?{...answer(),headline:'내 용신은 금입니다.'}:answer();
 if(url.includes('openai'))return {ok:true,json:async()=>({status:'completed',model:cmp.MODEL,usage:{input_tokens:100,output_tokens:200},output:refusal?[{type:'message',content:[{type:'refusal',refusal:'no'}]}]:[{type:'reasoning',encrypted_content:'opaque-reasoning'},{type:'function_call',call_id:'openai-call',name:'write_consultation',arguments:JSON.stringify(a)}]})};
 return {ok:true,json:async()=>({model:cmp.CLAUDE,stop_reason:'tool_use',usage:{input_tokens:100,output_tokens:200},content:[{type:'tool_use',id:'claude-call',name:'write_consultation',input:a}]})};
};}
test('comparison is disabled and rejects unconfigured models and unknown fixtures before network',async()=>{
 for(const options of [{env:{...env,AI_COMPARE_ENABLED:'false'}},{env:{...env,OPENAI_COMPARE_MODEL:'expensive-model'}},{fixtureId:'__proto__'},{env:{...env,OPENAI_API_KEY:''}}]){
  let calls=0;await assert.rejects(cmp.compare({fixtureId:'career',db:dbMock(),env,now,fetchImpl:async()=>calls++,...options}));assert.equal(calls,0);
 }
});
test('same synthetic chart, prompt and tool schema reach both providers; customer data is ignored',async()=>{
 const calls=[],db=dbMock(),r=await cmp.compare({fixtureId:'career',db,env,now,fetchImpl:fakeFetch(calls),body:{message:'CUSTOMER_PRIVATE'}});
 assert.equal(r.initial_input_identical,true);assert.equal(r.results.anthropic.status,'passed');assert.equal(r.results.openai.status,'passed');
 assert.equal(calls.length,2);const a=calls[0].p,o=calls[1].p;
 assert.equal(o.instructions,a.system);assert.deepEqual(o.input,a.messages);assert.deepEqual(o.tools[0].parameters,a.tools[0].input_schema);
 assert.equal(o.store,false);assert.equal(o.service_tier,'default');assert.equal(o.max_output_tokens,2400);assert.equal(o.model,cmp.MODEL);assert(!('temperature'in o));
 assert.equal(r.calls[1].estimated_usd,.0022);assert(!JSON.stringify([...db.values.values(),r]).includes(env.OPENAI_API_KEY));
 assert(!JSON.stringify(calls).includes('CUSTOMER_PRIVATE'));
});
test('OpenAI validation retry replays encrypted reasoning and the rejected function result',async()=>{
 const db=dbMock(),calls=[],records=[];
 const fetchImpl=cmp.transport({provider:'openai',key:env.OPENAI_API_KEY,db,env,now,records,fetchImpl:fakeFetch(calls)});
 const payload={system:'same',messages:[{role:'user',content:'question'}],tools:[{name:'write_consultation',input_schema:{type:'object',properties:{},required:[],additionalProperties:false}}]};
 const one=await (await fetchImpl('',{body:JSON.stringify(payload)})).json();
 const repair=require('../lib/consultation-repair').repairMessages(payload.messages,one.content[0],['UNSUPPORTED_GANZHI']);
 await fetchImpl('',{body:JSON.stringify({...payload,messages:repair})});
 assert.equal(calls[1].p.input.at(-1).type,'function_call_output');assert.equal(calls[1].p.input.at(-1).call_id,'openai-call');
 assert(calls[1].p.input.some(item=>item.encrypted_content==='opaque-reasoning'));assert.equal(records.length,2);
 await assert.rejects(fetchImpl('',{body:JSON.stringify(payload)}),{code:'COMPARISON_CALL_LIMIT'});
});
test('refusal and incomplete output never become a successful consultation',()=>{
 assert.equal(cmp.normalize({status:'incomplete',output:[{type:'function_call',name:'write_consultation',arguments:'{}'}]}).stop_reason,'incomplete');
 assert.equal(cmp.normalize({status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]}).content.length,0);
 assert.equal(cmp.normalize({status:'completed',output:[{type:'function_call',name:'write_consultation',arguments:'bad json'}]}).content.length,0);
});
test('concurrent reservations cannot exceed caps; timeout reserves remain consumed and never leak keys',async()=>{
 const db=dbMock(),tiny={...env,AI_COMPARE_DAILY_USD:'.08'},payload={input:'test'};
 const outcomes=await Promise.allSettled(Array.from({length:10},()=>budget.reserve(db,payload,tiny,now)));
 const success=outcomes.filter(r=>r.status==='fulfilled');assert.equal(success.length,1);
 assert(db.values.get('aiComparisonBudgets/day-2026-11-18').reserved_microusd<=80000);
 const calls=[],r=await cmp.compare({fixtureId:'career',db:dbMock(),env,now,fetchImpl:fakeFetch(calls,{timeout:true})});
 assert(r.calls.every(c=>c.status==='timeout'&&c.reserved_usd>0));assert(!JSON.stringify(r).includes('secret'));
});
test('expired approval, absent budget, oversized input and failed database all prevent API calls',async()=>{
 for(const settings of [{...env,AI_COMPARE_APPROVED_UNTIL:'2026-11-17T00:00:00Z'},{...env,AI_COMPARE_TOTAL_USD:''}])await assert.rejects(budget.reserve(dbMock(),{},settings,now));
 assert.throws(()=>budget.reserveAmount({input:'x'.repeat(60001)}),{code:'COMPARISON_INPUT_TOO_LARGE'});
 const calls=[],r=await cmp.compare({fixtureId:'career',db:{collection(){throw new Error('db unavailable');}},env,now,fetchImpl:fakeFetch(calls)});assert.equal(calls.length,0);assert(r.calls.length===0);
});
test('calendar rollover does not reset total approved experiment allowance',async()=>{
 const db=dbMock(),settings={...env,AI_COMPARE_TOTAL_USD:'.08',AI_COMPARE_APPROVED_UNTIL:'2027-01-01T00:00:00Z'};
 await budget.reserve(db,{},settings,now);await assert.rejects(budget.reserve(db,{},settings,new Date('2026-12-01T00:00:00Z')),{code:'COMPARISON_BUDGET_EXHAUSTED'});
});
test('handler rejects absent, ordinary and unverified tokens before comparison; member quota stays untouched',async()=>{
 const filename=path.resolve(__dirname,'../api/ai-chat.js'),realRequire=createRequire(filename);
 for(const actor of [null,{uid:'u',email:'member@example.com',email_verified:true},{uid:'u',email:'green092432@gmail.com',email_verified:false}]){
  let comparisonCalls=0;const firebase={apps:[{}],firestore:()=>({}),auth:()=>({verifyIdToken:async()=>actor})};
  const sandbox={module:{exports:{}},require(name){if(name==='firebase-admin')return firebase;if(name==='../lib/openai-comparison')return {compare:async()=>comparisonCalls++};return realRequire(name);},process:{env:{}},console:{error(){},warn(){}},setTimeout,clearTimeout,URL,Buffer,fetch:async()=>{throw Error('unexpected API');}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),sandbox,{filename});
  const res={setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
  await sandbox.module.exports({method:'POST',headers:{authorization:'Bearer fixture'},body:{action:'compare-providers',fixtureId:'career'}},res);
  assert.equal(res.code,actor?403:401);assert.equal(comparisonCalls,0);
 }
});
