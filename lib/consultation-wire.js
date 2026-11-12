'use strict';
// The provider selects source IDs. Identity, candidate scope and actual values
// are bound here, never guessed by the provider. Unknown/mixed IDs still fail.
function strictSchema(value){
 if(Array.isArray(value))return value.map(strictSchema);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([k])=>!['maxItems','minimum','maximum'].includes(k)).map(([k,v])=>[k,k==='minItems'?Math.min(1,v):strictSchema(v)]));
}
function schema(original){const result=structuredClone(original);result.properties.blocks.items={type:'object',properties:{kind:original.properties.blocks.items.properties.kind,title:{type:'string'},text:{type:'string'},reference_id:{type:['string','null']}},required:['kind','title','text','reference_id'],additionalProperties:false};return strictSchema(result);}
function materialize(raw,bundle,memory){
 if(!raw||!Array.isArray(raw.blocks))return raw;
 const allAssessments=bundle.charts.flatMap(c=>c.interpretation_assessments),facts=bundle.charts.flatMap(c=>c.facts).concat(bundle.periods,bundle.date_candidates.map(d=>({...d,person_id:d.person_ids[0]})));
 return {...raw,blocks:raw.blocks.map(b=>{
  if(b&&Object.hasOwn(b,'reference_id'))b={...b,reference_ids:b.reference_id===null?[]:[b.reference_id]};
  if(!Array.isArray(b?.reference_ids))return b; // Internal fixtures/legacy shape.
  const ids=[...new Set(b.reference_ids)],aids=b.kind==='traditional_interpretation'?ids:[],selected=aids.map(id=>allAssessments.find(a=>a.id===id)).filter(Boolean);
  const evidenceIds=b.kind==='traditional_interpretation'?[...new Set(selected.flatMap(a=>a.supporting_fact_ids))]:b.kind==='user_context'?[]:ids;
  const refs=evidenceIds.map(id=>facts.find(f=>f.id===id)).filter(Boolean),people=[...new Set(refs.map(f=>f.person_id))],person=people.length===1?people[0]:people.length?'mixed-sources':null,chart=bundle.charts.find(c=>c.person_id===person);
  const quote=b.kind==='user_context'&&memory?.user_statements.find(s=>s.id===ids[0])?.quote;
  return {kind:b.kind,title:b.title,text:quote||b.text,person_id:person,candidate_ids:chart?chart.candidates.map(c=>c.id):[],assessment_ids:aids,context_ids:b.kind==='user_context'?ids:[],evidence:evidenceIds.map(id=>({id}))};
 })};
}
function sourceText(block,bundle){
 const assessments=bundle.charts.flatMap(c=>c.interpretation_assessments);
 if(block.kind==='traditional_interpretation')return block.assessment_ids.map(id=>assessments.find(a=>a.id===id)).filter(Boolean).map(a=>a.result.ten_god?`${a.result.location}에서 ${a.result.ten_god}이 계산되어 있어요. 전통 명리에서는 ‘${a.result.meaning}’이라는 관점을 살펴보는 상징입니다.`:`기존 기본 리포트의 참고 키워드는 '${a.result.strength}'이며, 주의할 점은 '${a.result.watch}'입니다. 단일 오행의 참고 표현입니다.`).join('\n');
 if(block.kind==='chart_fact')return block.evidence.map(e=>bundle.charts.flatMap(c=>c.facts).find(f=>f.id===e.id)).filter(Boolean).map(f=>f.value.ganZhi?`${f.label}: ${f.value.ganZhi}`:f.value.strength?`기본 리포트 참고 키워드: ${f.value.strength} · ${f.value.watch}`:'').filter(Boolean).join('\n');
 return '';
}
function limitations(bundle,topic){
 const ambiguous=bundle.charts.some(c=>c.candidates.length>1);
 const missingTime=bundle.charts.some(c=>!c.facts.some(f=>f.path==='pillars.hour'));
 const scope=ambiguous?'출생시각에 따라 원국 후보가 나뉘어 후보 사이에 공통으로 확인된 자료만 사용했습니다.':missingTime?'출생시간 미상으로 시주를 제외한 계산 자료를 사용했습니다.':'입력된 출생정보로 계산한 자료를 사용했습니다.';
 const subject=topic==='relationship'?'상대의 출생정보를 알더라도 속마음이나 재회 여부를 확정할 수는 없습니다.':topic==='career_business'?'급여·직급·업무 조건은 실제 제안서와 회사 규정으로 확인해야 합니다.':topic==='money'?'실제 지출 습관이나 자금의 충분 여부는 사주만으로 단정하지 않습니다.':'이 해석은 전통적 상징을 현재 고민에 적용한 관점이며 실제 사건을 확정하는 판단은 아닙니다.';
 return [scope,'강약·용신·격국은 출생시간 제공 여부와 관계없이 현재 엔진의 판정 범위에 포함되지 않습니다.',subject];
}
module.exports={strictSchema,schema,materialize,sourceText,limitations};
