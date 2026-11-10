'use strict';
const calculation=require('./consultation-calculation'),prompt=require('./consultation-prompt'),output=require('./consultation-output');
const fail=(code,status=502)=>Object.assign(new Error(code),{code,status});
function capabilityNotice(message){
 const q=String(message||'');
 if(!/용신|강약|격국|신강|신약/.test(q)||/뜻|정의|무슨 말|무엇을 의미|개념/.test(q))return null;
 return '현재 택일소 계산 엔진은 용신·강약·격국을 판정하는 검수 규칙을 지원하지 않아 확정해서 알려드릴 수 없어요. 출생시간을 추가해도 이 제한은 같습니다.\n\n대신 확인된 원국과 기존 기본 리포트의 참고 키워드를 지금 말씀해 주신 상황과 구분해서, 선택지와 확인할 조건을 함께 정리할 수 있어요. 지금 고민하는 일이나 선택지를 말씀해 주세요.\n\n이 안내에는 질문 횟수를 사용하지 않았습니다.';
}
function usageTotal(calls){return calls.reduce((sum,c)=>{for(const key of ['input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens'])sum[key]=(sum[key]||0)+(Number(c.usage?.[key])||0);return sum;},{});}
function diagnostics(calls,extra={}){const usage=usageTotal(calls),models=[...new Set(calls.map(c=>c.model).filter(Boolean))],usageKnown=calls.length>0&&calls.every(c=>Number.isFinite(c.usage?.input_tokens)&&Number.isFinite(c.usage?.output_tokens));return {...extra,usage_known:usageKnown,models,provider_calls:calls.length,latency_ms:calls.reduce((n,c)=>n+c.latency_ms,0),usage,estimated_usd:usageKnown&&models.length===1&&models[0]==='claude-haiku-4-5-20251001'?(usage.input_tokens+usage.cache_creation_input_tokens*1.25+usage.cache_read_input_tokens*.1+usage.output_tokens*5)/1e6:null,cost_basis:'Anthropic published standard USD/MTok: Haiku 4.5 input 1, output 5, 5m cache write 1.25, read .10; estimate excludes tax, FX and nonstandard tiers.'};}
async function generate({body,messages,model,key,annualAllowed,annualContext,scope,fetchImpl=fetch,now=new Date()}){
 const bundle=calculation.build(body,now,annualAllowed),assembled=prompt.assemble(bundle,body.history,String(body.message||'').trim());
 if(capabilityNotice(body.message)){
  const reply=capabilityNotice(body.message)+(bundle.charts.some(c=>c.candidates.length>1)?'\n\n입력한 날짜는 출생시각에 따라 원국 후보도 나뉩니다. 서로 다른 후보를 하나로 합쳐 성향을 단정하지 않겠습니다.':'');
  return {reply,usageCharged:false,stopReason:'server_capability',evidence:[],diagnostics:{...diagnostics([],{variant:'grounded',prompt_version:prompt.VERSION,calculation_version:calculation.VERSION,response_source:'server_capability',validation:'passed'}),estimated_usd:0}};
 }
 const system=assembled.system+'\n\n[이용 범위]\n'+scope+(annualAllowed?'\n[이전 신년 리포트: AI 해석 가설, 계산 사실 아님]\n'+annualContext:'');
 const calls=[],validationFailures=[];let out;
 for(let attempt=0;attempt<2;attempt++){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000),start=Date.now();let response,data;
  try{response=await fetchImpl('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:2400,temperature:.45,system,messages:attempt?[...messages,{role:'assistant',content:'구조화 답변 검사를 통과하지 못했습니다.'},{role:'user',content:'내용을 늘리지 말고 실제 근거만 사용해 완결된 상담을 다시 제출하세요. 검사 항목: '+validationFailures.at(-1).join(', ')+' 미지원 안내는 practical_suggestion, person_id=null, 근거 배열은 비워 주세요. 택일 점수·점수 순위·상생/상극은 서버가 표시하므로 어떤 본문에도 쓰지 말고 현실 조건만 설명하세요.'}]:messages,tools:[{name:'write_consultation',description:'사용자에게 보여줄 근거가 구분된 상담을 제출합니다. 실제 외부 작업을 실행하지 않습니다.',input_schema:prompt.schema}],tool_choice:{type:'tool',name:'write_consultation'}}),signal:controller.signal});if(!response.ok)throw fail('AI_UPSTREAM_ERROR');data=await response.json();}catch(e){if(e.name==='AbortError')throw fail('AI_TIMEOUT',504);throw e;}finally{clearTimeout(timeout);}
  calls.push({model:data.model||model,usage:data.usage||{},latency_ms:Date.now()-start,stop_reason:data.stop_reason});
  if(data.stop_reason!=='tool_use')throw Object.assign(fail('AI_INCOMPLETE_RESPONSE'),{diagnostics:diagnostics(calls,{variant:'grounded',prompt_version:prompt.VERSION,stop_reason:data.stop_reason,validation:'incomplete'})});
  const blocks=(data.content||[]).filter(b=>b.type==='tool_use'&&b.name==='write_consultation');out=blocks.length===1?blocks[0].input:null;
  const errors=output.validate(out,bundle,assembled.memory);if(!errors.length)return {reply:output.render(out,bundle),stopReason:data.stop_reason,evidence:output.reasons(out,bundle),diagnostics:diagnostics(calls,{variant:'grounded',prompt_version:prompt.VERSION,calculation_version:calculation.VERSION,topic:assembled.topic,reference_binding:'server',validation_retries:attempt,validation_failures:validationFailures,chart_count:bundle.charts.length,candidate_counts:bundle.charts.map(c=>c.candidates.length),structured:out})};
  validationFailures.push(errors);
 }
 throw Object.assign(fail('AI_EVIDENCE_VALIDATION_FAILED'),{diagnostics:diagnostics(calls,{variant:'grounded',prompt_version:prompt.VERSION,validation:'failed',validation_failures:validationFailures})});
}
module.exports={generate,diagnostics,capabilityNotice};
