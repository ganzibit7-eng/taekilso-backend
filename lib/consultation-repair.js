'use strict';
// Return the rejected tool call to the model, not just an opaque error code.
// This conversation stays inside the existing request; never persist its text.
function repairMessages(messages, tool, errors) {
 const instructions = [
  '직전 답변은 검사를 통과하지 못해 사용자에게 표시되지 않았습니다. 검사 항목: '+errors.join(', '),
  '같은 질문에 완결된 답변을 다시 제출하세요. 기존 답변 중 잘못된 블록만 실제 계산 자료에 맞게 고치고 분량은 늘리지 마세요.',
  '계산 사실은 chart_fact와 실제 fact ID, 개인별 해석은 traditional_interpretation과 해당 assessment 및 supporting_fact_ids를 함께 사용하세요. 사람과 원국 후보를 섞지 마세요.',
  '제공되지 않은 근거 ID·간지·날짜·점수는 삭제하세요. 이전 AI 답변은 계산 근거가 아닙니다. 근거가 없는 지출 습관을 사주로 단정하지 마세요.',
  '현실적인 확인 항목과 조건부 제안은 practical_suggestion, person_id=null, evidence/assessment_ids/candidate_ids/context_ids=[]로 구분하세요. 사용자 진술은 실제 context_ids만 사용하세요.',
  '계산 자료와 관련 없는 질문에 근거를 억지로 붙이지 마세요. 택일 점수·순위·상생/상극은 재서술하지 마세요.'
 ].join('\n');
 if (!tool) return [...messages,{role:'assistant',content:'직전 구조화 답변을 완성하지 못했습니다.'},{role:'user',content:instructions}];
 const id=tool.id||'consultation_repair';
 return [...messages,{role:'assistant',content:[{type:'tool_use',id,name:'write_consultation',input:tool.input}]},{role:'user',content:[{type:'tool_result',tool_use_id:id,is_error:true,content:instructions}]}];
}
function publicFailure(code) {
 const messages={
  AI_TIMEOUT:'답변을 준비하는 데 시간이 오래 걸렸어요. 잠시 후 다시 시도해 주세요.',
  AI_UPSTREAM_ERROR:'상담 서비스에 일시적으로 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
  AI_INCOMPLETE_RESPONSE:'답변 작성을 끝마치지 못했어요. 잠시 후 다시 시도해 주세요.',
  AI_EVIDENCE_VALIDATION_FAILED:'답변과 계산 자료가 맞는지 확인하는 과정에서 재작성이 필요했어요. 잠시 후 다시 시도해 주세요.'
 };
 return (messages[code]||'상담 처리 중 일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.')+' 질문 횟수는 차감하지 않았습니다.';
}
function failureLog(error) {
 // Whitelist operational metadata; omit messages, birth data, IDs and tool text.
 return {code:error.code||'PROVIDER_ERROR',prompt_version:error.diagnostics?.prompt_version,
  stop_reason:error.diagnostics?.stop_reason,validation_failures:error.diagnostics?.validation_failures,
  provider_calls:error.diagnostics?.provider_calls};
}
module.exports={repairMessages,publicFailure,failureLog};
