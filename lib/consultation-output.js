'use strict';
const text=(x,max=6000)=>typeof x==='string'&&x.length<=max;
const strValue=x=>typeof x==='string'?x:JSON.stringify(x);
function read(value,path){if(typeof path!=='string')return undefined;if(!path)return value;for(const key of path.split('.')){if(!/^[\w]+$/.test(key)||['constructor','prototype','__proto__'].includes(key)||value==null||!Object.hasOwn(value,key))return undefined;value=value[key];}return value;}
function validate(out,bundle,memory){
 const errors=[];const fail=code=>errors.push(code);
 if(!out||!['answer','needs_clarification','insufficient_data'].includes(out.status)||!text(out.headline,500)||!Array.isArray(out.blocks)||out.blocks.length<1||out.blocks.length>5)return ['SHAPE'];
 const refs=new Map(),assessments=new Map(),contexts=new Set(memory.user_statements.map(x=>x.id));
 for(const c of bundle.charts){for(const f of c.facts)refs.set(f.id,f);for(const a of c.interpretation_assessments)assessments.set(a.id,a);}
 for(const d of bundle.date_candidates)refs.set(d.id,{...d,person_id:d.person_ids[0],candidate_id:'common'});
 for(const p of bundle.periods)refs.set(p.id,p);
 for(const b of out.blocks){
  if(!b||!['chart_fact','traditional_interpretation','user_context','practical_suggestion'].includes(b.kind)||!text(b.title,160)||!text(b.text)||!Array.isArray(b.evidence)||b.evidence.length>3||!Array.isArray(b.candidate_ids)||!Array.isArray(b.assessment_ids)||!Array.isArray(b.context_ids)){fail('BLOCK_SHAPE');continue;}
  const grounded=['chart_fact','traditional_interpretation'].includes(b.kind),chart=bundle.charts.find(c=>c.person_id===b.person_id),validRefs=[];
  if(grounded&&(!chart||!b.evidence.length))fail('MISSING_GROUND');
  for(const e of b.evidence){const ref=e&&refs.get(e.id);if(ref&&e.path===undefined&&e.value===undefined){e.path='';e.value=strValue(ref.value);}const actual=ref&&read(ref.value,e.path);if(!ref||typeof e.path!=='string'||actual===undefined||e.value!==strValue(actual)){fail('VALUE_MISMATCH');continue;}if(ref.person_id!==b.person_id)fail('FOREIGN_PERSON');validRefs.push(ref);if(ref.candidate_id!=='common'&&!b.candidate_ids.includes(ref.candidate_id))fail('CANDIDATE_SCOPE');}
  if(chart){const known=new Set(chart.candidates.map(c=>c.id));if(b.candidate_ids.some(id=>!known.has(id)))fail('FOREIGN_CANDIDATE');
   if(chart.candidates.length>1&&b.candidate_ids.length>1){
    if(b.candidate_ids.length!==known.size)fail('INCOMPLETE_COMMON_SCOPE');
    for(const e of b.evidence){const ref=refs.get(e.id);if(!ref||ref.candidate_id==='common')continue;for(const candidate of chart.candidates){const same=chart.facts.find(f=>f.candidate_id===candidate.id&&f.path===ref.path);if(!same||strValue(read(same.value,e.path))!==e.value)fail('NONCOMMON_VALUE');}}
   }
  }
  if(b.kind==='traditional_interpretation'&&!b.assessment_ids.length)fail('MISSING_METHOD');
  for(const id of b.assessment_ids){const a=assessments.get(id);if(!a||a.person_id!==b.person_id)fail('FOREIGN_ASSESSMENT');else if(!a.supporting_fact_ids.every(id=>b.evidence.some(e=>e.id===id)))fail('ASSESSMENT_WITHOUT_SUPPORT');}
  if(b.context_ids.some(id=>!contexts.has(id))||(b.kind==='user_context'&&!b.context_ids.length))fail('FOREIGN_CONTEXT');
  if(!grounded&&(b.evidence.length||b.assessment_ids.length||b.candidate_ids.length||(b.kind==='practical_suggestion'&&b.person_id!==null)||(b.kind==='user_context'&&b.person_id!==null&&b.person_id!==bundle.charts[0]?.person_id)))fail('UNSUPPORTED_REFERENCE');
  // Mechanical checks cover concrete repeated values, not the truth of prose.
  // A semantic review remains necessary for interpreting a valid citation.
  const allowed=validRefs.map(r=>JSON.stringify(r.value)).join(' ');
  const gods=require('./consultation-interpretation').GODS;
  for(const [han,[ko]] of Object.entries(gods)){
   const mentioned=new RegExp(ko+'(?=[은는이가을를의·\\s(]|$)').test(b.title+' '+b.text);
   if(mentioned&&!allowed.includes(han)&&grounded)fail('UNSUPPORTED_TEN_GOD');
  }
  // A date and its score must never be assembled by the model from a bag of
  // otherwise valid references. The server renders the exact paired rows below.
  if(bundle.date_candidates.length&&/(?:\d{1,3}\s*점|점수[^.!?]{0,25}(?:높|낮|우위|열위)|상생|상극)/.test(b.title+' '+b.text))fail('DATE_SCORE_SERVER_ONLY');
  for(const gz of b.text.match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g)||[])if(!allowed.includes(gz))fail('UNSUPPORTED_GANZHI');
  for(const m of b.text.matchAll(/(\d{1,3})\s*점/g))if(!validRefs.some(r=>r.value&&Number(r.value.score)===Number(m[1])))fail('UNSUPPORTED_SCORE');
  for(const date of b.text.match(/20\d{2}-\d{2}-\d{2}/g)||[])if(!allowed.includes(date))fail('UNSUPPORTED_DATE');
 }
 if(!Array.isArray(out.options)||out.options.length>3||out.options.some(o=>!o||!['label','suitable_when','tradeoff','next_action'].every(k=>text(o[k],1500))))fail('OPTION_SHAPE');
 if(!Array.isArray(out.actions)||out.actions.length>3||out.actions.some(x=>!text(x,1500))||!Array.isArray(out.data_limitations)||out.data_limitations.length>3||out.data_limitations.some(x=>!text(x,1500))||!(out.follow_up_question===null||text(out.follow_up_question,500)))fail('ENDING_SHAPE');
 const withoutEvidence=JSON.stringify({headline:out.headline,options:out.options,actions:out.actions,follow_up_question:out.follow_up_question,data_limitations:out.data_limitations});
 if(/(?:점수|택일 평가)[^.!?]{0,18}(?:높|낮|우위|열위)|\d{1,3}\s*점|상생|상극/.test(withoutEvidence))fail('UNGROUNDED_SCORE_COMPARISON');
 const narrative=JSON.stringify(out);
 if(/(?:급여|연봉|직급|고용 안정성)[^.!?\n]{0,45}(?:유지됩니다|보장됩니다|유지돼요|보장돼요)/.test(narrative))fail('UNVERIFIED_EMPLOYMENT_GUARANTEE');
 if(/\d+일\s*\([월화수목금토일]\)|[월화수목금토일]요일/.test(narrative))fail('UNVERIFIED_WEEKDAY');
 if(/개월\s*수\s*[÷/]\s*목표|기간\s*[÷/]\s*저축액/.test(narrative))fail('REVERSED_SAVINGS_FORMULA');
 return [...new Set(errors)];
}
function render(out,bundle){const parts=[out.headline];
 // Bind a real source if the provider omits the supplied interpretation.
 const anchoredPeople=new Set(out.blocks.filter(b=>b.kind==='traditional_interpretation').flatMap(b=>b.assessment_ids).filter(id=>bundle?.topic_assessments?.some(a=>a.id===id)).map(id=>bundle.topic_assessments.find(a=>a.id===id).person_id));
 for(const a of bundle?.topic_assessments||[]){if(anchoredPeople.has(a.person_id))continue;anchoredPeople.add(a.person_id);parts.push('**'+(bundle.charts.length>1?'상담 대상 '+a.person_id.split('-').at(-1)+' · ':'')+'사주에서 살펴볼 관점**\n'+require('./consultation-interpretation').paragraph(a)+'\n실제 습관을 단정하는 판단이 아니라, 현재 상황과 대조해 볼 해석입니다.');}
if(bundle?.date_candidates?.length)parts.push('**계산된 후보 날짜**\n'+bundle.date_candidates.map(d=>`${d.value.date} · ${d.value.ganZhi} · ${d.value.score}점\n${d.value.reasons.join(' · ')}`).join('\n\n')+'\n점수는 기존 택일소의 후보 비교 지표이며 성공 확률이나 사건 예측이 아닙니다.');for(const b of out.blocks)parts.push((b.title?'**'+b.title+'**\n':'')+b.text);for(const o of out.options)parts.push('**'+o.label+'**\n'+o.suitable_when+'\n고려할 점: '+o.tradeoff+'\n다음 행동: '+o.next_action);if(out.actions.length)parts.push('**지금 해볼 일**\n'+out.actions.map(x=>'- '+x).join('\n'));if(out.data_limitations.length)parts.push(out.data_limitations.join('\n'));if(out.follow_up_question)parts.push(out.follow_up_question);return parts.join('\n\n');}
function reasons(out,bundle){
 const all=bundle.charts.flatMap(c=>c.facts).concat(bundle.date_candidates.map(d=>({...d,label:'후보 날짜 비교'})),bundle.periods.map(p=>({...p,label:'신년상담 기간 계산'}))),seen=new Set(),result=[];
 function display(f,e){const v=f.value;if(e.path)return e.value;if(v.ganZhi)return v.ganZhi;if(v.day&&v.strength)return v.day+' · '+v.element+' · 참고 키워드 '+v.strength;if(v.date&&v.event)return v.date+' · '+v.event+' · '+v.score+'점';if(v.annual)return '2027년 '+v.annual.ganZhi+' 세운과 절기 기준 월운';return '현재 선택한 사주로 계산한 자료';}
 const used=new Set(out.blocks.filter(b=>b.kind==='traditional_interpretation').flatMap(b=>b.assessment_ids));
 const shown=(bundle.topic_assessments||[]).filter(a=>used.has(a.id)||(!bundle.topic_assessments.some(x=>x.person_id===a.person_id&&used.has(x.id))&&bundle.topic_assessments.find(x=>x.person_id===a.person_id)===a));
 for(const a of shown){const r=a.result;result.push({label:r.location+' · '+r.ten_god,value:r.meaning,scope:'실제 계산값에 연결한 전통적 상징과 조건부 상담 관점 · 강약·길흉 판정 아님'});}
 for(const b of out.blocks)for(const e of b.evidence){const f=all.find(f=>f.id===e.id);if(f&&!seen.has(e.id+'/'+e.path)){seen.add(e.id+'/'+e.path);result.push({label:f.label||'사주 계산 자료',value:display(f,e),scope:bundle.charts.find(c=>c.person_id===b.person_id)?.candidates.length>1?'출생 시각에 따라 원국 후보가 나뉘어 공통 자료만 살펴봤어요.':'선택한 출생정보의 계산값'});}}return result.slice(0,6);
}
module.exports={read,strValue,validate,render,reasons};
