const {test}=require('node:test'),assert=require('node:assert/strict');
const provider=require('../lib/consultation-provider'),service=require('../lib/consultation-service');
const calc=require('../lib/consultation-calculation'),prompt=require('../lib/consultation-prompt');
const env={AI_PRIMARY_PROVIDER:'openai',OPENAI_MODEL:provider.MODEL,OPENAI_API_KEY:'synthetic-key'};
const payload={model:'claude-haiku-4-5-20251001',max_tokens:2400,system:'source-bound instructions',messages:[{role:'user',content:'질문'}],tools:[{name:'write_consultation',description:'test',input_schema:{type:'object',properties:{},required:[],additionalProperties:false}}],tool_choice:{type:'tool',name:'write_consultation'}};
const options=()=>({headers:{'x-api-key':'synthetic-fallback'},body:JSON.stringify(payload),signal:AbortSignal.timeout(1000)});
const raw=(input={},name='write_consultation')=>({status:'completed',model:provider.MODEL,usage:{input_tokens:100,output_tokens:200},output:[{type:'function_call',name,call_id:'call-1',arguments:JSON.stringify(input)}]});
const response=data=>({ok:true,status:200,json:async()=>data});
test('GPT primary uses forced strict tool, no provider storage, no browser-selected model, and never calls Claude on success',async()=>{
 let calls=0;const p=provider.create({env,fetchImpl:async(url,o)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const b=JSON.parse(o.body);assert.equal(b.model,provider.MODEL);assert.equal(b.store,false);assert.equal(b.max_output_tokens,2400);assert.equal(b.reasoning.effort,'low');assert.equal(b.tools[0].strict,true);assert.equal(o.headers['x-api-key'],undefined);return response(raw());}});
 assert.equal((await(await p.fetch('claude-url',options())).json()).stop_reason,'tool_use');assert.equal(calls,1);
 const d=p.summarize();assert.equal(d.selected_provider,'openai');assert.equal(d.fallback_used,false);assert.equal(d.estimated_usd,.0022);assert(!JSON.stringify(d).includes('synthetic-key'));
});
test('availability and network failures fall back once and retain the same schema and source prompt',async()=>{
 for(const reason of [401,403,408,429,503,'network','timeout']){
  const urls=[];const p=provider.create({env,fetchImpl:async(url,o)=>{urls.push(url);if(urls.length===1){if(reason==='network')throw Object.assign(new Error('connection'),{code:'ECONNRESET'});if(reason==='timeout')throw Object.assign(new Error('timeout'),{name:'TimeoutError'});return {ok:false,status:reason};}assert.deepEqual(JSON.parse(o.body),payload);return response({stop_reason:'tool_use',model:payload.model,usage:{input_tokens:1,output_tokens:1},content:[]});}});
  await p.fetch('claude-url',options());assert.deepEqual(urls,['https://api.openai.com/v1/responses','claude-url']);assert.equal(p.summarize().fallback_used,true);assert.equal(p.summarize().estimated_usd,null);
 }
});
test('schema errors, completed refusals and incomplete responses never bypass validation through Claude',async()=>{
 for(const data of [{status:'incomplete',output:[]},{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]},raw({},'unexpected_tool')]){
  let calls=0;const p=provider.create({env,fetchImpl:async()=>{calls++;return response(data);}});
  assert.equal((await(await p.fetch('claude-url',options())).json()).stop_reason,'incomplete');assert.equal(calls,1);
 }
 let calls=0;const p=provider.create({env,fetchImpl:async()=>{calls++;return {ok:false,status:400};}});await assert.rejects(p.fetch('claude-url',options()),{code:'AI_REQUEST_REJECTED'});assert.equal(calls,1);
});
test('both provider failures stop, parent cancellation prevents fallback, configuration is server controlled',async()=>{
 let calls=0;const p=provider.create({env,fetchImpl:async()=>{calls++;return {ok:false,status:503};}});await assert.rejects(p.fetch('claude-url',options()),{code:'AI_UPSTREAM_ERROR'});assert.equal(calls,2);
 const aborted=AbortSignal.abort();await assert.rejects(p.fetch('claude-url',{...options(),signal:aborted}),{code:'AI_TIMEOUT'});assert.equal(calls,2);
 assert.throws(()=>provider.create({env:{...env,OPENAI_MODEL:'client-model'}}),{code:'AI_MODEL_NOT_ALLOWED'});
 assert.throws(()=>provider.create({env:{...env,OPENAI_API_KEY:''}}),{code:'AI_PROVIDER_KEY_MISSING'});
});
test('repair resumes encrypted reasoning and the exact rejected tool call without storing a response',()=>{
 const first=provider.openaiPayload(payload),previous={input:first.input,output:[{type:'reasoning',encrypted_content:'synthetic-encrypted'},...raw().output]};
 const repair={...payload,messages:[...payload.messages,{role:'assistant',content:[{type:'tool_use',id:'call-1',name:'write_consultation',input:{}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'call-1',content:'fix invalid reference'}]}]};
 const result=provider.openaiPayload(repair,previous);assert.deepEqual(result.input[1],previous.output[0]);assert.equal(result.input.at(-1).call_id,'call-1');assert.equal(result.store,false);
});
test('annual report and independent section repair preserve their tools and full output allowance',()=>{
 for(const [name,max_tokens] of [['write_newyear_report',12000],['repair_newyear_sections',7000]]){
  const p=provider.openaiPayload({...payload,max_tokens,tool_choice:{name}});assert.equal(p.max_output_tokens,max_tokens);assert.equal(p.tool_choice.name,name);assert.equal(provider.normalize(raw({},name),name).stop_reason,'tool_use');
 }
});
test('rollback sends original Claude request unchanged',async()=>{
 const o=options();let seen;const p=provider.create({env:{},fetchImpl:async(u,v)=>{seen=[u,v];return response({});}});await p.fetch('original',o);assert.deepEqual(seen,['original',o]);assert.deepEqual(p.summarize({version:1}),{version:1});
});
test('GPT output uses actual source binding and the existing persona renderer; invalid invented IDs still fail',async()=>{
 const body={sajuProfile:{y:1990,m:1,d:1,hourValue:'unknown',gender:'unknown',calType:'solar'},message:'사업과 부업 중 어떤 방식을 먼저 시도할까요?'};
 const b=calc.build(body);prompt.assemble(b,[],body.message,'taeyul');let calls=0;
 const answer={status:'answer',headline:'먼저 작은 제안부터 시험해요.',blocks:[{kind:'traditional_interpretation',title:'내가 정할 범위',text:'주도할 수 있는 일이 있다면, 책임질 범위도 함께 정해 보세요.',reference_id:b.topic_assessments[0].id}],options:[],actions:[],follow_up_question:null,data_limitations:[]};
 const result=await service.generate({body,messages:[{role:'user',content:body.message}],key:'fallback',model:payload.model,consultantId:'taeyul',providerEnv:env,fetchImpl:async()=>{calls++;return response(raw(answer));}});
 assert.equal(calls,1);assert(result.evidence.length);assert.match(result.reply,/유|쥬/);assert.doesNotMatch(result.reply,/입니다|합니다/);assert.equal(result.diagnostics.selected_provider,'openai');
 answer.blocks[0].reference_id='invented-source';calls=0;await assert.rejects(service.generate({body,messages:[{role:'user',content:body.message}],key:'fallback',model:payload.model,providerEnv:env,fetchImpl:async()=>{calls++;return response(raw(answer));}}),{code:'AI_EVIDENCE_VALIDATION_FAILED'});assert.equal(calls,2);
});
test('annual GPT generation preserves twelve months, real calculation echoes and rejects a mismatched year source',async()=>{
 const quality=require('../lib/newyear-quality'),profile={y:1990,m:1,d:1,hourValue:'unknown',gender:'unknown',calType:'solar'};
 const prose='실제로 새 제안을 받았다면 맡을 일과 정할 수 있는 범위를 나란히 살펴보세요. 조건이 맞으면 진행하고 다르면 부담을 조정해 보세요. '.repeat(7);
 const report={overview:prose,foundation:prose,opportunities:prose,cautions:prose,closing:prose,
  areas:Array.from({length:4},()=>({title:'내가 정할 범위',reading:prose,action:'제안의 조건을 확인해 보세요.'})),
  months:Array.from({length:12},(_,i)=>({month:i+1,theme:'먼저 정할 기준',reading:prose,action:'실제 역할부터 확인해 보세요.'}))};
 let mismatch=false,calls=0;
 const fetchImpl=async(url,o)=>{calls++;const request=JSON.parse(o.body);assert.equal(request.max_output_tokens,12000);const input=JSON.parse(request.input[0].content);const source_checks=structuredClone(input.source_checks_expected);if(mismatch)source_checks.annualGanZhi='unverified';return response(raw({...report,source_checks},'write_newyear_report'));};
 const r=await quality.generate({profile,key:'fallback',model:payload.model,providerEnv:env,fetchImpl});assert.equal(r.report.months.length,12);assert.equal(r.diagnostics.selected_provider,'openai');assert.equal(calls,1);
 mismatch=true;await assert.rejects(quality.generate({profile,key:'fallback',model:payload.model,providerEnv:env,fetchImpl}),e=>e.message==='INVALID_REPORT_EVIDENCE');assert.equal(calls,2);
});
