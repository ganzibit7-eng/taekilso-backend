'use strict';
const reference=require('./newyear-reference');
const calculation=require('./consultation-calculation'),prompt=require('./consultation-prompt'),{diagnostics}=require('./consultation-service');
const text={type:'string'};
const schema={type:'object',properties:{overview:text,foundation:text,areas:{type:'array',minItems:4,maxItems:4,items:{type:'object',properties:{title:text,reading:text,action:text},required:['title','reading','action'],additionalProperties:false}},months:{type:'array',minItems:12,maxItems:12,items:{type:'object',properties:{month:{type:'integer',minimum:1,maximum:12},theme:text,reading:text,action:text},required:['month','theme','reading','action'],additionalProperties:false}},opportunities:text,cautions:text,closing:text,source_checks:{type:'object',properties:{dayGanZhi:text,annualGanZhi:text,months:{type:'array',minItems:12,maxItems:12,items:{type:'object',properties:{month:{type:'integer',minimum:1,maximum:12},monthGanZhi:{type:'array',minItems:1,maxItems:3,items:text}},required:['month','monthGanZhi'],additionalProperties:false}}},required:['dayGanZhi','annualGanZhi','months'],additionalProperties:false}},required:['overview','foundation','areas','months','opportunities','cautions','closing','source_checks'],additionalProperties:false};
const OUTPUT=`write_newyear_report 도구로 2027년의 사주 달력 비교와 조건별 선택을 설명한다. 고객용 본문 합계 최소 4800자, 목표 5500~7000자. 반복과 면책 문구로 분량을 채우지 않는다. 문단과 줄바꿈만 사용하고 Markdown·HTML·내부 ID는 쓰지 않는다.
실제 natal, annual, months, daewoon과 method를 읽고 그 사람에게 제공된 계산 범위만 사용한다. 십성은 일간과 다른 천간의 오행 관계·음양에 따른 분류이며 그 자체가 성격 진단이나 미래 사건의 증거가 아니다. reviewLens는 해당 분류를 현재 상황의 확인 질문으로 바꾸는 편집 방법이다. 검수된 길흉 규칙처럼 말하지 않는다.
원국·절입 날짜·간지·십성·대운 구간의 정확한 값은 서버가 각 절에 표시한다. 고객용 문장에서 그 숫자·간지·십성을 다시 적거나 비교 순위를 창작하지 않는다. 대신 각 절에 제공된 comparison.relation과 reviewLens를 실제 조건·선택지·확인 질문으로 연결한다. 데이터가 같은 구간은 큰 차이가 생겼다고 과장하지 않는다. 다른 구간은 달력 분류의 차이와 실용적인 점검 관점의 차이로만 설명한다.
원국 후보가 여럿이면 공통 사실만 설명한다. daewoon이 null이면 대운을 추정하지 않는다. daewoon이 있어도 사건·길흉을 판정하지 않는다. 현재 직업·소득·관계 상황을 모르므로 조건은 '만약'이라고 표시한다. 강약·용신·격국·합충·신살·월별 운의 강도·성공률·특정 사건의 발생 시기는 지원하지 않는다. 임의의 대기 기간이나 금액, 저축률을 정해 주지 말고 사용자가 비교할 조건과 산식을 쓴다.
overview 약400자: 그 사람의 annual.comparison과 실제 제공 범위를 쉽게 연결하고 리포트의 활용법을 설명한다. 달력 비교와 조건별 조언이라는 범위를 여기서 밝힌다.
foundation 약400자: 공통 원국과 annual.comparison, 존재하는 경우에만 daewoon의 계산 범위를 함께 설명한다. 단일 기본 키워드를 성격으로 단정하지 않는다. 구체 계산값은 서버가 표시하므로 재서술하지 않는다.
areas 네 개: 일과 진로 / 돈 관리 / 연애와 관계 / 생활 리듬. 각 reading 300~400자와 action 약100자. 실제 annual.comparison.reviewLens를 해당 분야의 서로 다른 상황에 적용하되 근거 없는 분야별 운세를 만들지 않는다. 선택·보류 조건과 비용을 구분한다.
months는 1~12월 각각 theme, reading 약200~260자, action 약80~100자. 반드시 해당 months 배열의 comparison과 reviewLens에 맞춰 작성한다. 모든 사람에게 같은 12개월 계획표를 쓰지 않는다. theme은 제공된 reviewLens를 이해하기 쉬운 한글로 표현하고, 해당 상황이 실제로 있는 경우에만 적용할 두 선택지·확인할 항목을 제안한다. 사건 예측이나 좋은 달/나쁜 달 추천은 하지 않는다.
opportunities/cautions 각300~400자: 실제 제안이나 부담이 생긴 경우의 선택/보류 기준을 구체화한다. 새로운 기회가 생길 것이라고 예측하지 않는다. closing 200자 안팎: 앞 절의 반복 대신 이후 상담에서 확인하면 도움이 될 현실 정보를 제시한다.
source_checks는 source_checks_expected의 dayGanZhi, annualGanZhi, 월 번호별 monthGanZhi를 정확히 복사한다. 이 값은 실제 계산 자료를 전달받았는지 확인하는 최소 검사이며 해석의 진실성 인증이 아니다. 고객용 본문에는 검증 필드를 넣지 않는다.`;
function normalizeText(value){
 if(typeof value==='string')return value.replace(/\\r\\n|\\n/g,'\n');
 if(Array.isArray(value))return value.map(normalizeText);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalizeText(v)]));
 return value;
}
function validate(r,bundle){
 const {validReport}=require('./newyear-report');if(!validReport(r)||!r.source_checks||!Array.isArray(r.source_checks.months)||r.source_checks.months.length!==12||!bundle.periods[0])return ['REPORT_SHAPE'];
 const errors=[],c=bundle.charts[0],period=bundle.periods[0],checks=r.source_checks;
 if(checks.dayGanZhi!==c.candidates[0].pillars.day.ganZhi||checks.annualGanZhi!==period.value.annual.ganZhi)errors.push('EVIDENCE_VALUE_MISMATCH');
 for(let month=1;month<=12;month++){
  const found=checks.months.filter(m=>m.month===month),expected=[...new Set(period.value.months[month-1].segments.map(s=>s.monthGanZhi))];
  if(found.length!==1||!Array.isArray(found[0].monthGanZhi)||JSON.stringify(found[0].monthGanZhi)!==JSON.stringify(expected))errors.push('WRONG_MONTH_EVIDENCE');
 }
 const prose=JSON.stringify({...r,grounding:undefined,source_checks:undefined}),actual=JSON.stringify(bundle);
 // Concrete calendar facts are rendered from the engine below. Reject a
 // second, model-invented timetable even when its separate value echo is valid.
 if(/절정|활성화|강화되는 운|최고의 시기|손실 위험이 높|(?:중순|하순|초순|상반기|하반기)[^.!?]{0,50}(?:운이|재운|기회가|손실|갈등이)/.test(prose))errors.push('UNSUPPORTED_TEMPORAL_NARRATIVE');
 if(/(?:올해|2027년|이번 달|이 시기)[^.!?]{0,110}(?:수입|지출|갈등|승진|이직|재회)[^.!?]{0,60}(?:가능성이 높|일어날 것|발생할 것|증가할 것)/.test(prose))errors.push('UNSUPPORTED_EVENT_PREDICTION');
 if(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]|(?:겁재|비견|식신|상관|편재|정재|편관|정관|편인|정인)(?=[은는이가을를와과의]|[\s()·,.]|$)/.test(prose))errors.push('REPEAT_CALENDAR_FACTS');
 const characters=[r.overview,r.foundation,...r.areas.flatMap(a=>[a.reading,a.action]),...r.months.flatMap(m=>[m.reading,m.action]),r.opportunities,r.cautions,r.closing].join('').length;
 if(characters<4800)errors.push('REPORT_TOO_BRIEF');
 for(const gz of prose.match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g)||[])if(!actual.includes(gz))errors.push('UNSUPPORTED_GANZHI');
 if(/(?:운세|재물운|성공률|확률|연애운|건강운)[^.!?]{0,30}\d+\s*(?:점|퍼센트|%)/.test(prose))errors.push('INVENTED_SCORE');
 if(/\d+\s*(?:점|퍼센트|%|만원|억원|원|일|시|분|개월|주일)|20\d{2}-\d{2}-\d{2}/.test(prose))errors.push('NUMERIC_FACT_SERVER_ONLY');
 if(/용신|격국|신강|신약|신살|합충/.test(prose))errors.push('UNSUPPORTED_ASSESSMENT');
 return [...new Set(errors)];
}
async function generate({profile,key,model,fetchImpl=fetch,now=new Date()}){
 const bundle=calculation.build({sajuProfile:profile,message:'2027 신년 리포트'},now,true);
 if(!bundle.charts.length||!bundle.periods.length)throw Object.assign(new Error('NEWYEAR_PROFILE_REQUIRED'),{code:'NEWYEAR_PROFILE_REQUIRED'});
 const primary=bundle.charts[0],period=bundle.periods[0];
 const context=require('./newyear-context').buildContext(bundle);
 const input={reference_date:bundle.reference_date,timezone:bundle.timezone,...context,source_checks_expected:{dayGanZhi:primary.candidates[0].pillars.day.ganZhi,annualGanZhi:period.value.annual.ganZhi,months:period.value.months.map(m=>({month:m.month,monthGanZhi:[...new Set(m.segments.map(s=>s.monthGanZhi))]}))},existing_assessments:primary.interpretation_assessments,basic_report:primary.facts.find(f=>f.path==='basic_report').value};
 const start=Date.now();let response,data;
 try{
  response=await fetchImpl('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},signal:AbortSignal.timeout(150000),body:JSON.stringify({model,max_tokens:12000,temperature:.3,system:prompt.COMMON+'\n\n[신년상담 주제 모듈]\n'+prompt.MODULES.timing+'\n\n[선택한 신년 리포트 출력 규칙]\n'+OUTPUT,tools:[{name:'write_newyear_report',description:'실제 계산 자료를 대조하고 조건별 선택 상담을 작성합니다.',input_schema:schema}],tool_choice:{type:'tool',name:'write_newyear_report'},messages:[{role:'user',content:JSON.stringify(input)}]})});
  if(!response.ok)throw Object.assign(new Error('PROVIDER_ERROR'),{providerStatus:response.status});
  data=await response.json();
 }catch(error){
  const code=['AbortError','TimeoutError'].includes(error.name)?'AI_TIMEOUT':'PROVIDER_ERROR';
  throw Object.assign(new Error(code),{diagnostics:{variant:'newyear-grounded',prompt_version:prompt.VERSION+'-annual.3',calculation_version:calculation.VERSION,latency_ms:Date.now()-start,provider_calls:1,estimated_usd:null,usage_known:false,provider_status:Number(error.providerStatus)||null,validation:'upstream_failed'}});
 }
 const blocks=(data.content||[]).filter(x=>x.type==='tool_use'&&x.name==='write_newyear_report'),report=blocks.length===1?normalizeText(blocks[0].input):null;
 const metrics=diagnostics([{model:data.model||model,usage:data.usage||{},latency_ms:Date.now()-start,stop_reason:data.stop_reason}],{reference_binding:'server',variant:'newyear-grounded',prompt_version:prompt.VERSION+'-annual.3',calculation_version:calculation.VERSION,interpretation_method:context.method.version,usage_known:!!data.usage});
 if(!data.usage)metrics.estimated_usd=null;
 if(data.stop_reason!=='tool_use')throw Object.assign(new Error('INCOMPLETE_REPORT'),{diagnostics:{...metrics,validation:'incomplete'}});
 const errors=validate(report,bundle);
 if(errors.length)throw Object.assign(new Error('INVALID_REPORT_EVIDENCE'),{validationErrors:errors,diagnostics:{...metrics,validation:'failed'}});
 report.months.sort((a,b)=>a.month-b.month);
 const hypothesis='아래 설명은 실제 사주 달력의 비교 분류와 기존 참고 키워드를 현재 선택의 확인 질문으로 연결한 상담입니다. 미래 사건이나 길흉을 판정하는 검수 규칙은 아닙니다. 본인에게 해당하는 조건만 참고해 주세요.\n\n';
 report.foundation=hypothesis+report.foundation;

 report.opportunities='이 절은 기회가 발생할 시기를 예측하는 내용이 아닙니다. 실제로 새로운 제안이 생겼을 때 선택할 조건을 확인해 주세요.\n\n'+report.opportunities;
 report.foundation=reference.natalNote(primary)+'\n\n'+require('./newyear-context').comparisonNote(context.annual.comparison)+'\n\n'+(context.daewoon?'계산된 대운: '+context.daewoon.direction+' · 시작 '+context.daewoon.start+' · '+context.daewoon.cycles.map(c=>c.startYear+'~'+c.endYear+' '+c.ganZhi).join(' / ')+'\n\n':'')+report.foundation;
 report.months.forEach(m=>{const month=context.months[m.month-1];m.theme=[...new Set(month.segments.map(s=>s.comparison.reviewLens.theme))].join(' / ');m.calculationNote=require('./newyear-context').monthNote(month);});
 report.method=context.method;
 // IDs are bound by the server to the authenticated primary person's current
 // chart and each month. The model only echoes small concrete values above.
 report.grounding=[{section:'overview',id:bundle.periods[0].id,path:'annual'}, {section:'foundation',id:bundle.charts[0].facts.find(f=>f.path==='pillars.day').id,path:''},...report.months.map(m=>({section:'months.'+m.month,id:bundle.periods[0].id,path:'months.'+(m.month-1)}))];
 return {report,bundle,diagnostics:{...metrics,validation:'passed',characters:JSON.stringify({...report,grounding:undefined}).length}};
}
module.exports={schema,OUTPUT,normalizeText,validate,generate};
