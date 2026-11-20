'use strict';
// Return the rejected tool call to the model, not just an opaque error code.
// This conversation stays inside the existing request; never persist its text.
function repairMessages(messages, tool, errors) {
 const instructions = [
  ...(errors.includes('OUTLOOK_FIRST') ? ['headline 첫 문장을 면책 문구 없이 다시 써라. 물은 결과가 어떤 조건에서 열리거나 지체되는지 선택한 사주 근거로 바로 풀어라. 상대방의 결정이나 구체적인 사건을 꾸미지 말고 기존 근거와 상담사 말투는 유지한다.'] : []),
  '직전 답변은 검사를 통과하지 못해 사용자에게 표시되지 않았습니다. 검사 항목: '+errors.join(', '),
  '같은 질문에 완결된 답변을 다시 제출하세요. 기존 답변 중 잘못된 블록만 실제 계산 자료에 맞게 고치고 분량은 늘리지 마세요.',
  'reference_id만 제출합니다. chart_fact는 실제 fact ID, traditional_interpretation은 해당 assessment ID, user_context는 사용자 진술 ID, practical_suggestion은 null입니다. 사람을 섞지 마세요. person_id/evidence/candidate_ids 등은 작성하지 않습니다.',
  '제공되지 않은 근거 ID·간지·날짜·점수는 삭제하세요. 이전 AI 답변은 계산 근거가 아닙니다. 근거가 없는 지출 습관을 사주로 단정하지 마세요.',
  '현실적인 확인 항목은 practical_suggestion과 reference_id=null로 구분하세요. 정확한 계산 이름과 위치는 근거에서 확인할 수 있습니다. 본문에서는 그 의미를 일상어로 풀고 고민에 연결하세요. 점수 숫자·점수 높낮이·상생/상극은 모든 고객용 필드에서 빼세요.',
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
