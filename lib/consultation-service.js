'use strict';
const calculation=require('./consultation-calculation'),prompt=require('./consultation-prompt'),output=require('./consultation-output');
const fail=(code,status=502)=>Object.assign(new Error(code),{code,status});
function usageTotal(calls){return calls.reduce((sum,c)=>{for(const key of ['input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens'])sum[key]=(sum[key]||0)+(Number(c.usage?.[key])||0);return sum;},{});}
function diagnostics(calls,extra={}){const usage=usageTotal(calls),models=[...new Set(calls.map(c=>c.model).filter(Boolean))];return {...extra,models,provider_calls:calls.length,latency_ms:calls.reduce((n,c)=>n+c.latency_ms,0),usage,estimated_usd:models.length===1&&models[0]==='claude-haiku-4-5-20251001'?(usage.input_tokens+usage.cache_creation_input_tokens*1.25+usage.cache_read_input_tokens*.1+usage.output_tokens*5)/1e6:null,cost_basis:'Anthropic published standard USD/MTok: Haiku 4.5 input 1, output 5, 5m cache write 1.25, read .10; estimate excludes tax, FX and nonstandard tiers.'};}
async function generate({body,messages,model,key,annualAllowed,annualContext,scope,fetchImpl=fetch,now=new Date()}){
 const bundle=calculation.build(body,now,annualAllowed),assembled=prompt.assemble(bundle,body.history,String(body.message||'').trim());
 const system=assembled.system+'\n\n[이용 범위]\n'+scope+(annualAllowed?'\n[이전 신년 리포트: AI 해석 가설, 계산 사실 아님]\n'+annualContext:'');
 const calls=[],validationFailures=[];let out;
 for(let attempt=0;attempt<2;attempt++){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000),start=Date.now();let response,data;
  try{response=await fetchImpl('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:2400,temperature:.45,system,messages:attempt?[...messages,{role:'assistant',content:'구조화 답변 검사를 통과하지 못했습니다.'},{role:'user',content:'내용을 늘리지 말고 실제 근거만 사용해 완결된 상담을 다시 제출하세요. 검사 항목: '+validationFailures.at(-1).join(', ')}]:messages,tools:[{name:'write_consultation',description:'사용자에게 보여줄 근거가 구분된 상담을 제출합니다. 실제 외부 작업을 실행하지 않습니다.',input_schema:prompt.schema}],tool_choice:{type:'tool',name:'write_consultation'}}),signal:controller.signal});if(!response.ok)throw fail('AI_UPSTREAM_ERROR');data=await response.json();}catch(e){if(e.name==='AbortError')throw fail('AI_TIMEOUT',504);throw e;}finally{clearTimeout(timeout);}
  calls.push({model:data.model||model,usage:data.usage||{},latency_ms:Date.now()-start,stop_reason:data.stop_reason});
  if(data.stop_reason==='max_tokens')throw fail('AI_INCOMPLETE_RESPONSE');
  if(data.stop_reason!=='tool_use')throw fail('AI_INCOMPLETE_RESPONSE');
  const blocks=(data.content||[]).filter(b=>b.type==='tool_use'&&b.name==='write_consultation');out=blocks.length===1?blocks[0].input:null;
  const errors=output.validate(out,bundle,assembled.memory);if(!errors.length)return {reply:output.render(out),stopReason:data.stop_reason,evidence:output.reasons(out,bundle),diagnostics:diagnostics(calls,{variant:'grounded',prompt_version:prompt.VERSION,calculation_version:calculation.VERSION,topic:assembled.topic,validation_retries:attempt,validation_failures:validationFailures,chart_count:bundle.charts.length,candidate_counts:bundle.charts.map(c=>c.candidates.length),structured:out})};
  validationFailures.push(errors);
 }
 throw fail('AI_EVIDENCE_VALIDATION_FAILED');
}
module.exports={generate,diagnostics};
