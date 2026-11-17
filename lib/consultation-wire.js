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
function limitations(bundle){
 const ambiguous=bundle.charts.some(c=>c.candidates.length>1);
 const missingTime=bundle.charts.some(c=>!c.facts.some(f=>f.path==='pillars.hour'));
 const scope=ambiguous?'태어난 시각에 따라 풀이가 달라지는 부분은 빼고, 공통으로 확인되는 내용만 살폈어요.':missingTime?'태어난 시간을 모르는 경우라, 생년월일로 확인할 수 있는 범위에서 풀이했어요.':'';
 return scope?[scope]:[];
}
module.exports={strictSchema,schema,materialize,limitations};
