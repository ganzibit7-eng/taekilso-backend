'use strict';
const {createHash}=require('node:crypto');
const service=require('./consultation-service');
const budget=require('./comparison-budget');
const MODEL='gpt-6.2-sol',CLAUDE='claude-haiku-4-5-20251001';
const fail=(code,status=503)=>Object.assign(new Error(code),{code,status});
const profile={y:1990,m:1,d:1,hourValue:'unknown',gender:'unknown',calType:'solar'};
const FIXTURES={
 career:{sajuProfile:profile,message:'이직을 고민해요. 야근이 많고 연봉은 유지하고 싶어요.'},
 money:{sajuProfile:profile,message:'야근 뒤 배달비가 늘었어요. 저축을 위해 어떤 기준을 세울까요?'},
 relationship:{sajuProfile:profile,message:'친구와 갈등이 생기면 말을 피하게 돼요. 관계를 어떻게 조율할까요?'},
 boundary:{sajuProfile:{...profile,y:2027,m:2,d:4},message:'태어난 시간을 몰라요. 사주에서 확인 가능한 범위와 제 일하는 방식을 설명해주세요.'},
 known_time:{sajuProfile:{...profile,hourValue:'10',gender:'female'},message:'제 사주에서 공부하는 환경을 어떻게 살펴볼 수 있나요?'}
};
function toInput(messages){return messages.map(m=>{if(typeof m.content!=='string')throw fail('COMPARISON_MESSAGE_FORMAT');return {role:m.role,content:m.content};});}
function openaiPayload(payload,previous){
 let input;
 if(previous){
  const result=payload.messages.at(-1)?.content?.find?.(b=>b.type==='tool_result');
  if(!result)throw fail('COMPARISON_REPAIR_FORMAT');
  input=[...previous.input,...previous.output,{type:'function_call_output',call_id:result.tool_use_id,output:result.content}];
 }else input=toInput(payload.messages);
 return {model:MODEL,instructions:payload.system,input,max_output_tokens:2400,reasoning:{effort:'low'},
  store:false,include:['reasoning.encrypted_content'],service_tier:'default',parallel_tool_calls:false,
  tools:payload.tools.map(t=>({type:'function',name:t.name,description:t.description,parameters:t.input_schema,strict:true})),
  tool_choice:{type:'function',name:'write_consultation'}};
}
function normalize(data){
 const tools=(data.output||[]).filter(b=>b.type==='function_call'&&b.name==='write_consultation');
 let content=[];
 if(data.status==='completed'&&tools.length===1){try{content=[{type:'tool_use',id:tools[0].call_id,name:'write_consultation',input:JSON.parse(tools[0].arguments)}];}catch(_){}}
 return {model:data.model,usage:data.usage,stop_reason:content.length?'tool_use':'incomplete',content};
}
function estimate(provider,usage){
 if(!Number.isSafeInteger(usage?.input_tokens)||usage.input_tokens<0||!Number.isSafeInteger(usage?.output_tokens)||usage.output_tokens<0)return null;
 // No cache discounts claimed; standard short-context rates, excludes tax/FX.
 return (usage.input_tokens*(provider==='openai'?2:1)+usage.output_tokens*(provider==='openai'?10:5))/1e6;
}
function transport({provider,key,db,env,fetchImpl,now,records,namespace='aiComparison'}){
 let previous,calls=0;
 return async (_url,options)=>{
  if(++calls>2)throw fail('COMPARISON_CALL_LIMIT');
  const payload=JSON.parse(options.body),semantic={system:payload.system,messages:payload.messages,tools:payload.tools};
  const hash=createHash('sha256').update(JSON.stringify(semantic)).digest('hex');
  const request=provider==='openai'?openaiPayload(payload,previous):{...payload,model:CLAUDE};
  const reservation=await budget.reserve(db,request,env,now,namespace);
  const start=Date.now(),record={provider,model:provider==='openai'?MODEL:CLAUDE,input_hash:hash,reserved_usd:reservation.amount/1e6};records.push(record);
  let data,response;
  try{
   response=await fetchImpl(provider==='openai'?'https://api.openai.com/v1/responses':'https://api.anthropic.com/v1/messages',{
    method:'POST',signal:options.signal,headers:provider==='openai'?{'Content-Type':'application/json',Authorization:'Bearer '+key}:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify(request)});
   if(!response.ok)throw fail(response.status===429?'COMPARISON_PROVIDER_LIMIT':'AI_UPSTREAM_ERROR',502);
   data=await response.json();record.usage=data.usage||null;record.estimated_usd=estimate(provider,data.usage);record.status='received';
  }catch(error){record.status=error.name==='AbortError'?'timeout':'failed';throw fail(record.status==='timeout'?'AI_TIMEOUT':error.code||'AI_UPSTREAM_ERROR',502);}
  finally{
   record.latency_ms=Date.now()-start;
   // The reservation remains charged even if logging fails. No keys or text.
   await reservation.event.set(record,{merge:true}).catch(()=>{});
  }
  if(provider==='openai'){
   previous={input:request.input,output:data.output||[]};
   return {ok:true,json:async()=>normalize(data)};
  }
  return {ok:true,json:async()=>data};
 };
}
async function compare({fixtureId,db,env=process.env,fetchImpl=fetch,now=new Date()}){
 if(env.AI_COMPARE_ENABLED!=='true')throw fail('COMPARISON_DISABLED');
 if(!env.OPENAI_API_KEY||!env.ANTHROPIC_API_KEY)throw fail('COMPARISON_KEYS_MISSING');
 if(env.OPENAI_COMPARE_MODEL!==MODEL)throw fail('COMPARISON_MODEL_NOT_ALLOWED');
 if(!Object.hasOwn(FIXTURES,fixtureId))throw fail('COMPARISON_FIXTURE_INVALID',400);
 // Only synthetic fixtures; the caller cannot supply customer data or unlock paid scope.
 const body=structuredClone(FIXTURES[fixtureId]),records=[],results={};
 for(const provider of ['anthropic','openai']){
  try{
   const result=await service.generate({body,messages:[{role:'user',content:body.message}],model:provider==='openai'?MODEL:CLAUDE,
    key:'server-transport',consultantId:'yeonwoo',annualAllowed:false,annualContext:'',scope:'일반 상담입니다. 제공된 계산 자료만 사용합니다.',now,
    fetchImpl:transport({provider,key:provider==='openai'?env.OPENAI_API_KEY:env.ANTHROPIC_API_KEY,db,env,fetchImpl,now,records})});
   results[provider]={status:'passed',reply:result.reply,evidence:result.evidence,validation_retries:result.diagnostics.validation_retries};
  }catch(error){results[provider]={status:'failed',code:error.code||'AI_UPSTREAM_ERROR'};}
 }
 const first=provider=>records.find(r=>r.provider===provider)?.input_hash;
 return {fixture_id:fixtureId,synthetic:true,reference_time:now.toISOString(),prompt_version:require('./consultation-prompt').VERSION,
  calculation_version:require('./consultation-calculation').VERSION,initial_input_identical:!!first('openai')&&first('openai')===first('anthropic'),
  results,calls:records,cost_note:'USD estimates at standard published rates; reservations are conservative and retained on failure. Credits and invoices are separate. No automatic quality winner.'};
}
module.exports={compare,FIXTURES,MODEL,CLAUDE,openaiPayload,normalize,transport,estimate};
