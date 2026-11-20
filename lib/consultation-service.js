'use strict';
const calculation=require('./consultation-calculation'),prompt=require('./consultation-prompt'),output=require('./consultation-output');
const wire=require('./consultation-wire');
const personas=require('./consultation-personas');
const {repairMessages}=require('./consultation-repair');
const {providerQuestion}=require('./consultation-privacy');
const moving=require('./moving-month');
const movingReading=require('./consultation-moving-reading');
const outlook=require('./consultation-outlook');
const fail=(code,status=502)=>Object.assign(new Error(code),{code,status});
function capabilityNotice(message){
 const q=String(message||'');
 if(!/용신|강약|격국|신강|신약/.test(q)||/뜻|정의|무슨 말|무엇을 의미|개념/.test(q))return null;
 return '용신·강약·격국은 지금 택일소에서 판단할 수 없는 항목이에요. 태어난 시간을 알려주셔도 이 범위는 같아요.\n\n입력하신 생년월일로 확인할 수 있는 사주를 바탕으로, 지금 고민하는 선택을 함께 살펴볼 수 있어요. 지금 어떤 일이 가장 고민되세요?\n\n이 안내에는 질문 횟수를 사용하지 않았습니다.';
}
function usageTotal(calls){return calls.reduce((sum,c)=>{for(const key of ['input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens'])sum[key]=(sum[key]||0)+(Number(c.usage?.[key])||0);return sum;},{});}
function diagnostics(calls,extra={}){const usage=usageTotal(calls),models=[...new Set(calls.map(c=>c.model).filter(Boolean))],usageKnown=calls.length>0&&calls.every(c=>Number.isFinite(c.usage?.input_tokens)&&Number.isFinite(c.usage?.output_tokens));return {...extra,usage_known:usageKnown,models,provider_calls:calls.length,latency_ms:calls.reduce((n,c)=>n+c.latency_ms,0),usage,estimated_usd:usageKnown&&models.length===1&&models[0]==='claude-haiku-4-5-20251001'?(usage.input_tokens+usage.cache_creation_input_tokens*1.25+usage.cache_read_input_tokens*.1+usage.output_tokens*5)/1e6:null,cost_basis:'Anthropic published standard USD/MTok: Haiku 4.5 input 1, output 5, 5m cache write 1.25, read .10; estimate excludes tax, FX and nonstandard tiers.'};}
function timingEvidence(rec){
 return {label:rec.sale?'기존 집 매매 시기 · 월운과 십성':'이사 월 추천 · 일지와 절기 월지',
  value:rec.natal+' · '+rec.monthPillar+' · '+rec.from+' ~ '+rec.to+(rec.sale?' · '+moving.saleBasis(rec.sale):''),
  scope:rec.sale?'한국시간 절입 기준 · 받을 대가와 약속, 지지 관계를 함께 본 택일소의 명리 풀이':'한국시간 절입 기준 · 삼명통회 지지 관계를 택일소가 이사에 적용한 참고 풀이'};
}
async function generate({body,model,key,consultantId,annualAllowed,scope,fetchImpl=fetch,now=new Date(),providerEnv=process.env}){
 const question=providerQuestion(body);
 const bundle=calculation.build(body,now,annualAllowed),assembled=prompt.assemble(bundle,body.history,question,consultantId);
 const outboundMessages=[{role:'user',content:question}];
 if(capabilityNotice(body.message)){
  const notice=capabilityNotice(body.message)+(bundle.charts.some(c=>c.candidates.length>1)?'\n\n입력하신 생일은 태어난 시각에 따라 풀이가 달라질 수 있어요. 공통으로 확인되는 부분을 중심으로 살펴볼게요.':'');
  const reply=personas.spokenProse(consultantId)(notice);
  return {reply,usageCharged:false,stopReason:'server_capability',evidence:[],diagnostics:{...diagnostics([],{variant:'grounded',prompt_version:prompt.VERSION,calculation_version:calculation.VERSION,response_source:'server_capability',validation:'passed'}),estimated_usd:0}};
 }
 const timing=bundle.movingWindow;
 const movingInstructions=timing?'\n\n'+(timing.sale?moving.saleGuidance:moving.guidance)+'\nmoving_window='+JSON.stringify({
  relation:timing.relation,...(timing.sale&&{basis:moving.saleBasis(timing.sale)})
 }):'';
 const system=assembled.system+'\n\n[이용 범위]\n'+scope+'\n\n'+personas.voiceReminder(consultantId)+movingInstructions;
 const provider=require('./consultation-provider').create({env:providerEnv,fetchImpl});
 fetchImpl=provider.fetch;
 const saleNarrative=timing?.sale && !outlook.wantsAdvice(question)
  ? wire.materialize({status:'answer',headline:'',blocks:outlook.saleBlocks(bundle.topic_assessments),options:[],actions:[],follow_up_question:null,data_limitations:wire.limitations(bundle)},bundle,assembled.memory)
  : null;
 if(saleNarrative&&!output.validate(saleNarrative,bundle,assembled.memory).length){
  const movingPrefix=personas.spokenProse(consultantId)(moving.describeSale(timing));
  const narrative=output.render(saleNarrative,bundle,'',consultantId).trim();
  return {reply:movingPrefix+'\n\n'+narrative,movingPrefix,stopReason:'server_home_sale_month',
   evidence:[timingEvidence(timing),...output.reasons(saleNarrative,bundle)],
   diagnostics:{...diagnostics([],{variant:'grounded',prompt_version:prompt.VERSION,calculation_version:calculation.VERSION,
    topic:assembled.topic,response_source:'server_home_sale_month',reference_binding:'server',validation:'passed'}),estimated_usd:0}};
 }
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
  if(!errors.length && attempt===0 && !bundle.personalMove && bundle.readingOnly && out.status==='answer'){
   const relevant=new Set(bundle.topic_assessments.map(a=>a.id));
   const readings=out.blocks.filter(b=>b.kind==='traditional_interpretation' && b.assessment_ids.some(id=>relevant.has(id)));
   if(!readings.length || out.blocks.filter(b=>b.kind==='practical_suggestion').length>=readings.length ||
      out.options.length || out.actions.length) errors.push('PERSONAL_READING_FIRST');
  }
  if(!errors.length && bundle.personalMove && out.status==='answer'){
   out=movingReading.selectBlocks(out,bundle,assembled.memory);
   errors.push(...output.validate(out,bundle,assembled.memory));
  }
  if(!errors.length){
   const followup = Array.isArray(body.history) && body.history.some(entry => entry?.role==='assistant');
   const greeting=out.status==='answer'&&!followup?personas.opening(consultantId):'';
   let reply=output.render(out,bundle,greeting,consultantId).trim();
   let movingPrefix='';
   let evidence=output.reasons(out,bundle);
   if(bundle.movingWindow){
    const rec=bundle.movingWindow,polish=personas.spokenProse(consultantId);
    movingPrefix=(greeting?greeting+' ':'')+polish(rec.sale?moving.describeSale(rec):moving.describe(rec))+'\n\n';
    // Only the computed introduction may name the calendar interval. If the model
    // guesses another time or declines, the rule still provides a complete answer.
    const narrative=output.render(out,bundle,'',consultantId).trim();
    const usable=out.status==='answer' && !moving.conflicts(narrative);
    reply=movingPrefix+(usable?narrative:rec.sale?'':polish('이 구간은 정착과 조율이라는 한 가지 관점에서 골랐어요. 실제 이삿날은 이 기간 안에서 따로 비교할 수 있어요.'));
    if(!usable)evidence=[];
    evidence.unshift(timingEvidence(rec));
   }
   return {reply,movingPrefix,stopReason:data.stop_reason,evidence,diagnostics:provider.summarize(diagnostics(calls,{variant:'grounded',prompt_version:prompt.VERSION,calculation_version:calculation.VERSION,topic:assembled.topic,response_length:prompt.responseLength(body.message,body.history),reply_characters:reply.length,reference_binding:'server',validation_retries:attempt,validation_failures:validationFailures,chart_count:bundle.charts.length,candidate_counts:bundle.charts.map(c=>c.candidates.length),structured:out}))};
  }
  validationFailures.push(errors);
  retryMessages=repairMessages(outboundMessages,rejectedTool,errors);
 }
 if(timing?.sale){
  const movingPrefix=personas.spokenProse(consultantId)(moving.describeSale(timing));
  return {reply:movingPrefix,movingPrefix,stopReason:'server_home_sale_month',evidence:[timingEvidence(timing)],
   diagnostics:provider.summarize(diagnostics(calls,{variant:'grounded',prompt_version:prompt.VERSION,calculation_version:calculation.VERSION,
    topic:assembled.topic,reference_binding:'server',response_source:'server_home_sale_month',validation:'passed',validation_failures:validationFailures}))};
 }
 throw Object.assign(fail('AI_EVIDENCE_VALIDATION_FAILED'),{diagnostics:provider.summarize(diagnostics(calls,{variant:'grounded',prompt_version:prompt.VERSION,validation:'failed',validation_failures:validationFailures,structured:out}))});
}
module.exports={generate,diagnostics,capabilityNotice};
