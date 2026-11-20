'use strict';
const calculation=require('./consultation-calculation'),prompt=require('./consultation-prompt'),output=require('./consultation-output');
const wire=require('./consultation-wire');
const personas=require('./consultation-personas');
const {repairMessages}=require('./consultation-repair');
const {providerQuestion}=require('./consultation-privacy');
const fail=(code,status=502)=>Object.assign(new Error(code),{code,status});
function capabilityNotice(message){
 const q=String(message||'');
 if(!/용신|강약|격국|신강|신약/.test(q)||/뜻|정의|무슨 말|무엇을 의미|개념/.test(q))return null;
 return '용신·강약·격국은 지금 택일소에서 판단할 수 없는 항목이에요. 태어난 시간을 알려주셔도 이 범위는 같아요.\n\n입력하신 생년월일로 확인할 수 있는 사주를 바탕으로, 지금 고민하는 선택을 함께 살펴볼 수 있어요. 지금 어떤 일이 가장 고민되세요?\n\n이 안내에는 질문 횟수를 사용하지 않았습니다.';
}
function usageTotal(calls){return calls.reduce((sum,c)=>{for(const key of ['input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens'])sum[key]=(sum[key]||0)+(Number(c.usage?.[key])||0);return sum;},{});}
function diagnostics(calls,extra={}){const usage=usageTotal(calls),models=[...new Set(calls.map(c=>c.model).filter(Boolean))],usageKnown=calls.length>0&&calls.every(c=>Number.isFinite(c.usage?.input_tokens)&&Number.isFinite(c.usage?.output_tokens));return {...extra,usage_known:usageKnown,models,provider_calls:calls.length,latency_ms:calls.reduce((n,c)=>n+c.latency_ms,0),usage,estimated_usd:usageKnown&&models.length===1&&models[0]==='claude-haiku-4-5-20251001'?(usage.input_tokens+usage.cache_creation_input_tokens*1.25+usage.cache_read_input_tokens*.1+usage.output_tokens*5)/1e6:null,cost_basis:'Anthropic published standard USD/MTok: Haiku 4.5 input 1, output 5, 5m cache write 1.25, read .10; estimate excludes tax, FX and nonstandard tiers.'};}
async function generate({body,model,key,consultantId,annualAllowed,scope,fetchImpl=fetch,now=new Date(),providerEnv=process.env}){
 const question=providerQuestion(body);
 const bundle=calculation.build(body,now,annualAllowed),assembled=prompt.assemble(bundle,body.history,question,consultantId);
 const outboundMessages=[{role:'user',content:question}];
 if(capabilityNotice(body.message)){
  const notice=capabilityNotice(body.message)+(bundle.charts.some(c=>c.candidates.length>1)?'\n\n입력하신 생일은 태어난 시각에 따라 풀이가 달라질 수 있어요. 공통으로 확인되는 부분을 중심으로 살펴볼게요.':'');
  const reply=personas.spokenProse(consultantId)(notice);
  return {reply,usageCharged:false,stopReason:'server_capability',evidence:[],diagnostics:{...diagnostics([],{variant:'grounded',prompt_version:prompt.VERSION,calculation_version:calculation.VERSION,response_source:'server_capability',validation:'passed'}),estimated_usd:0}};
 }
 const system=assembled.system+'\n\n[이용 범위]\n'+scope+'\n\n'+personas.voiceReminder(consultantId);
 const provider=require('./consultation-provider').create({env:providerEnv,fetchImpl});
 fetchImpl=provider.fetch;
 const calls=[],validationFailures=[];let out,retryMessages;
 for(let attempt=0;attempt<2;attempt++){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),provider.enabled?65000:45000),start=Date.now();let response,data;
  try{response=await fetchImpl('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:4800,temperature:.45,system,messages:attempt?retryMessages:outboundMessages,tools:[{name:'write_consultation',strict:true,description:'사용자에게 보여줄 근거가 구분된 상담을 제출합니다. 실제 외부 작업을 실행하지 않습니다.',input_schema:wire.schema(prompt.schema)}],tool_choice:{type:'tool',name:'write_consultation'}}),signal:controller.signal});if(!response.ok)throw fail('AI_UPSTREAM_ERROR');data=await response.json();}catch(e){const error=e.name==='AbortError'?fail('AI_TIMEOUT',504):e;error.diagnostics=provider.summarize(diagnostics(calls,{variant:'grounded',prompt_version:prompt.VERSION,validation:'upstream_failed'}));throw error;}finally{clearTimeout(timeout);}
  calls.push({model:data.model||model,usage:data.usage||{},latency_ms:Date.now()-start,stop_reason:data.stop_reason});
  if(data.stop_reason!=='tool_use')throw Object.assign(fail('AI_INCOMPLETE_RESPONSE'),{diagnostics:provider.summarize(diagnostics(calls,{variant:'grounded',prompt_version:prompt.VERSION,stop_reason:data.stop_reason,validation:'incomplete'}))});
  const blocks=(data.content||[]).filter(b=>b.type==='tool_use'&&b.name==='write_consultation');out=blocks.length===1?blocks[0].input:null;
  const rejectedTool=blocks.length===1?structuredClone(blocks[0]):null;
  out=wire.materialize(out,bundle,assembled.memory);
  out=require('./consultation-money-criteria').bound(out,assembled.memory,assembled.topic);
  if(out&&bundle.server_written_sources)out.data_limitations=wire.limitations(bundle);
  const errors=output.validate(out,bundle,assembled.memory);
  // Give a valid, grounded reading one chance to replace a disclaimer-led headline.
  // On a repeat, return a validated answer rather than losing the consultation.
  if (!errors.length && attempt===0 && bundle.outlookRequested && out.status==='answer' && output.opensWithDisclaimer(out.headline)) errors.push('OUTLOOK_FIRST');
  if(!errors.length){
   const followup = Array.isArray(body.history) && body.history.some(entry => entry?.role==='assistant');
   const greeting=out.status==='answer'&&!followup?personas.opening(consultantId):'';
   const reply=output.render(out,bundle,greeting,consultantId);
   return {reply,stopReason:data.stop_reason,evidence:output.reasons(out,bundle),diagnostics:provider.summarize(diagnostics(calls,{variant:'grounded',prompt_version:prompt.VERSION,calculation_version:calculation.VERSION,topic:assembled.topic,response_length:prompt.responseLength(body.message,body.history),reply_characters:reply.length,reference_binding:'server',validation_retries:attempt,validation_failures:validationFailures,chart_count:bundle.charts.length,candidate_counts:bundle.charts.map(c=>c.candidates.length),structured:out}))};
  }
  validationFailures.push(errors);
  retryMessages=repairMessages(outboundMessages,rejectedTool,errors);
 }
 throw Object.assign(fail('AI_EVIDENCE_VALIDATION_FAILED'),{diagnostics:provider.summarize(diagnostics(calls,{variant:'grounded',prompt_version:prompt.VERSION,validation:'failed',validation_failures:validationFailures,structured:out}))});
}
module.exports={generate,diagnostics,capabilityNotice};
