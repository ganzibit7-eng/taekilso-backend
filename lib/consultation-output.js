'use strict';
const {spokenProse,needsLanguageRepair}=require('./consultation-personas');
// Positions alone overlap ordinary Korean (연간 정산) and capability notices
// (시주 판정 제외). Only concrete calendar values belong to the server.
const calendarNarrative=/(?<![가-힣])(?:비견|겁재|식신|편재|정재|편관|정관|편인|정인)(?=[은는이가을를의에(·\s]|$)|(?<![가-힣])상관(?!\s*(?:없|있|없이))(?=[은는이가을를의에(·\s]|$)|[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/;
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
  if(bundle.server_written_sources&&calendarNarrative.test(b.title+' '+b.text))fail('CALENDAR_FACT_SERVER_ONLY');
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
   const mentioned=new RegExp('(?<![가-힣])'+ko+'(?=[은는이가을를의·\\s(]|$)').test(b.title+' '+b.text);
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
 if(bundle.server_written_sources&&calendarNarrative.test(withoutEvidence))fail('CALENDAR_FACT_SERVER_ONLY');
 const narrative=JSON.stringify(out);
 if(/(?:급여|연봉|직급|고용 안정성)[^.!?\n]{0,45}(?:유지됩니다|보장됩니다|유지돼요|보장돼요)/.test(narrative))fail('UNVERIFIED_EMPLOYMENT_GUARANTEE');
 if(/\d+일\s*\([월화수목금토일]\)|[월화수목금토일]요일/.test(narrative))fail('UNVERIFIED_WEEKDAY');
 if(/개월\s*수\s*[÷/]\s*목표|기간\s*[÷/]\s*저축액/.test(narrative))fail('REVERSED_SAVINGS_FORMULA');
 const list=value=>Array.isArray(value)?value:[];
 const customerProse=[out.headline,out.follow_up_question,...list(out.actions),...list(out.data_limitations),
  ...out.blocks.filter(block=>block&&block.kind!=='user_context').flatMap(block=>[block.title,block.text]),
  ...list(out.options).filter(Boolean).flatMap(option=>[option.label,option.suitable_when,option.tradeoff,option.next_action])];
 if(customerProse.some(value=>typeof value==='string'&&needsLanguageRepair(value)))fail('STANDARD_KOREAN_VOICE');
 return [...new Set(errors)];
}
function personPrefix(bundle, personId) {
 return bundle.charts.length>1 && personId ? '상담 대상 '+personId.split('-').at(-1)+' · ' : '';
}

function render(out,bundle,greeting='',consultantId) {
 const polish=spokenProse(consultantId);
 const headline=polish(out.headline);
 const parts=[greeting?greeting+' '+headline:headline];
 const topicAssessments=bundle.topic_assessments||[];
 const used=new Set(out.blocks.filter(b=>b.kind==='traditional_interpretation').flatMap(b=>b.assessment_ids));
 const coveredPeople=new Set(topicAssessments.filter(a=>used.has(a.id)).map(a=>a.person_id));
 for(const assessment of topicAssessments){
  if(coveredPeople.has(assessment.person_id))continue;
  coveredPeople.add(assessment.person_id);
  parts.push('**'+personPrefix(bundle,assessment.person_id)+'사주로 보면**\n'+polish(require('./consultation-interpretation').paragraph(assessment)));
 }
 if(bundle.date_candidates.length){
  const rows=bundle.date_candidates.map(({value})=>`${value.date} · ${value.score}점`);
  parts.push('**후보 날짜 비교**\n'+rows.join('\n')+'\n'+polish('점수는 후보를 비교할 때 참고하는 값이에요. 실제 결과를 예측하는 숫자는 아니에요.'));
 }
 const hasPersonalReading=bundle.readingOnly && out.status==='answer' && out.blocks.some(b=>b.kind==='traditional_interpretation' && b.assessment_ids.some(id=>topicAssessments.some(a=>a.id===id)));
 const hasAnswerBlock=out.blocks.some(block=>block.kind!=='user_context');
 for(const block of out.blocks){
  if(hasAnswerBlock && block.kind==='user_context')continue;
  if(hasPersonalReading && block.kind==='practical_suggestion')continue;
  const grounded=block.kind==='traditional_interpretation'||block.kind==='chart_fact';
  const title=(grounded?personPrefix(bundle,block.person_id):'')+block.title;
  const text=block.kind==='user_context'?block.text:polish(block.text);
  parts.push((title?'**'+title+'**\n':'')+text);
 }
 for(const option of (bundle.readingOnly?[]:out.options)){
  parts.push('**'+polish(option.label)+'**\n'+polish(option.suitable_when)+'\n고려할 점: '+polish(option.tradeoff)+'\n다음 행동: '+polish(option.next_action));
 }
 if(!bundle.readingOnly && out.actions.length)parts.push('**지금 해볼 일**\n'+out.actions.map(action=>'- '+polish(action)).join('\n'));
 if(out.data_limitations.length)parts.push(out.data_limitations.map(polish).join('\n'));
 if(out.status==='needs_clarification' && out.follow_up_question)parts.push(polish(out.follow_up_question));
 return parts.join('\n\n');
}

function reasons(out,bundle){
 const facts=bundle.charts.flatMap(chart=>chart.facts).concat(bundle.periods);
 const seen=new Set(), result=[];
 const dateRows=bundle.date_candidates.map(({value})=>({
  label:value.date+' · '+value.event,
  value:[value.ganZhi,value.score+'점',...value.reasons].join(' · '),
  scope:'후보 날짜의 비교 점수를 계산한 내역이에요.'
 }));

 const used=new Set(out.blocks.filter(b=>b.kind==='traditional_interpretation').flatMap(b=>b.assessment_ids));
 const topicAssessments=bundle.topic_assessments||[];
 const shown=bundle.charts.flatMap(c=>c.interpretation_assessments).filter(a=>used.has(a.id));
 for(const assessment of topicAssessments){
  if(!shown.some(a=>a.person_id===assessment.person_id && a.method_version))shown.push(assessment);
 }
 for(const assessment of shown){
  const r=assessment.result;
  const label=r.ten_god?r.location+' · '+r.ten_god:'기본 리포트 참고 키워드';
  result.push({
   label:personPrefix(bundle,assessment.person_id)+label,
   value:r.ten_god?r.meaning:r.strength+' · '+r.watch,
   scope:'전통 명리에서 이 계산값을 해석할 때 참고하는 의미예요.'
  });
 }

 for(const block of out.blocks)for(const entry of block.evidence){
  const fact=facts.find(f=>f.id===entry.id), tag=entry.id+'/'+entry.path;
  if(!fact||seen.has(tag))continue;
  seen.add(tag);
  const v=fact.value;
  const value=entry.path?entry.value:v.ganZhi||(
   v.day&&v.strength?v.day+' · '+v.element+' · 참고 키워드 '+v.strength:
   v.annual?'2027년 '+v.annual.ganZhi+' 세운과 절기 기준 월운':'현재 선택한 사주로 계산한 자료'
  );
  result.push({
   label:personPrefix(bundle,fact.person_id)+(fact.label||(v.annual?'신년운세 기간 계산':'사주 계산 자료')),
   value,
   scope:bundle.charts.find(c=>c.person_id===fact.person_id)?.candidates.length>1
    ?'출생 시각에 따라 해석에 쓰는 값이 달라져 공통으로 확인된 부분만 살펴봤어요.'
    :'선택한 출생정보의 계산값'
  });
 }
 return dateRows.concat(result.slice(0,6));
}
function opensWithDisclaimer(headline){
 const opening=headline.trim().split(/[.!?。\n]/,1)[0];
 const disownsOutlook=/(?:합격|성사|재회|매매|승진)(?:\s*(?:여부|자체|결과))?(?:를|는|까지)?\s*(?:가를|판정할|예측할)\s*근거(?:는|가)?\s*없|(?:합격|성사|재회|매매|승진)\s*여부를\s*가리키는\s*풀이(?:는|가)?\s*아니/.test(headline);
 return disownsOutlook || /(?:알|단정할|확정할|예측할|판단할|장담할|보장할|확답할)\s*수(?:는|가|도)?\s*없|(?:단정|확답|예측|판단|보장)하기(?:는|가)?\s*어려/.test(opening);
}
module.exports={read,strValue,validate,render,reasons,opensWithDisclaimer};
