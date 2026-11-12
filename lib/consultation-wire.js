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
 if(block.kind==='traditional_interpretation')return block.assessment_ids.map(id=>assessments.find(a=>a.id===id)).filter(Boolean).map(a=>a.result.ten_god?`${a.result.location}에서 ${a.result.ten_god}이 계산되어 있어요. 전통 명리에서는 ${a.result.meaning}을 살펴보는 상징입니다.`:`기존 기본 리포트의 참고 키워드는 '${a.result.strength}'이며, 주의할 점은 '${a.result.watch}'입니다. 단일 오행의 참고 표현입니다.`).join('\n');
 if(block.kind==='chart_fact')return block.evidence.map(e=>bundle.charts.flatMap(c=>c.facts).find(f=>f.id===e.id)).filter(Boolean).map(f=>f.value.ganZhi?`${f.label}: ${f.value.ganZhi}`:f.value.strength?`기본 리포트 참고 키워드: ${f.value.strength} · ${f.value.watch}`:'').filter(Boolean).join('\n');
 return '';
}
module.exports={strictSchema,schema,materialize,sourceText};
