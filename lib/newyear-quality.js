'use strict';
const reference=require('./newyear-reference');
const calculation=require('./consultation-calculation'),prompt=require('./consultation-prompt'),{diagnostics}=require('./consultation-service');
const text={type:'string'};
const schema={type:'object',properties:{overview:text,foundation:text,areas:{type:'array',minItems:4,maxItems:4,items:{type:'object',properties:{title:text,reading:text,action:text},required:['title','reading','action'],additionalProperties:false}},months:{type:'array',minItems:12,maxItems:12,items:{type:'object',properties:{month:{type:'integer',minimum:1,maximum:12},theme:text,reading:text,action:text},required:['month','theme','reading','action'],additionalProperties:false}},opportunities:text,cautions:text,closing:text,source_checks:{type:'object',properties:{dayGanZhi:text,annualGanZhi:text,months:{type:'array',minItems:12,maxItems:12,items:{type:'object',properties:{month:{type:'integer',minimum:1,maximum:12},monthGanZhi:{type:'array',minItems:1,maxItems:3,items:text}},required:['month','monthGanZhi'],additionalProperties:false}}},required:['dayGanZhi','annualGanZhi','months'],additionalProperties:false}},required:['overview','foundation','areas','months','opportunities','cautions','closing','source_checks'],additionalProperties:false};
const OUTPUT="write_newyear_report 도구로 충분히 읽을 수 있는 2027 신년 리포트를 작성한다. 공통 규칙과 시기 모듈을 지키며, 일반 채팅의 짧은 분량 대신 고객용 본문 합계 최소 6500자, 목표 7500~9000자로 쓴다. 근거 없는 예언이나 같은 조언 반복으로 분량을 늘리지 않는다. 문단과 줄바꿈만 사용하고 Markdown·HTML·내부 ID를 쓰지 않는다.\n\n중요: 이 엔진은 전문 검수된 강약·용신·격국·사건 예측 규칙을 제공하지 않는다. 기존 기본 리포트의 참고 키워드만 방법이 기록된 판정으로 연결한다. 계산 사실을 참고하는 것과 미래 사건을 예언하는 것을 구분한다. '겁재라 손실 위험이 높아 7월에는 투자나 대출을 미루세요', '상관이 강해져 갈등이 생깁니다', '월 중순에 운이 바뀝니다' 같은 새 판정은 금지한다. 시간만 알면 미지원 판정이 자동으로 생기는 것처럼 말하지 않는다.\n\n정확한 연간 경계·원국·월별 간지·십성·절입 시각은 서버가 고객 화면에 별도의 근거 문장으로 붙인다. 따라서 overview, foundation, areas, months의 고객용 본문에는 간지 한자·십성 명칭·특정 달/날짜·절입 시각을 다시 생성하지 않는다. '중순/하순/절정/최고의 시기/강화되는 운/손실이 높아지는 달'을 창작하지 않는다. 제공된 근거 문장의 뜻을 과장하지 말고 실제 선택 기준과 실천으로 연결한다. 현재 직업·소득·연애 상태는 없으므로 가정은 '만약 직장인이라면'처럼 표시한다.\n\noverview 약500자: 한 해를 살펴볼 관점, 현재의 목표와 비용·시간·관계 조건을 함께 볼 이유, 리포트 활용 방법. 실천 테마가 사건 예언이 아니라 검토를 돕는 편집 구성임은 여기서 한 번 밝히고 월마다 면책 문구를 반복하지 않는다.\nfoundation 약450자: 서버가 별도로 표시할 원국·기본 리포트 키워드를 어떻게 활용할지 설명한다. 참고 키워드를 성격 진단이나 성공 예측으로 바꾸지 않고 '표현·추진'이라면 실제로 내 결정권과 소진을 확인하는 식으로 연결한다.\nareas: 일과 진로 / 돈 관리 / 연애와 관계 / 생활 리듬 네 분야. 각 reading 약400자, action 약120자. 서로 다른 상황의 선택지, 맞는 조건, 비용과 포기할 점, 실행·보류 기준을 구체적으로 쓴다. 달·날짜를 지정한 추천은 하지 않는다. 금융·건강·관계의 결과를 예언하지 않는다.\nmonths: 양력 1~12월 각각 theme은 짧은 한글, reading 약230자, action 약100자. 서버의 해당 월 근거 문장이 앞에 붙는다. 그 아래에는 달력 사실을 새로 쓰지 말고 질문·비교 기준·현실적 선택을 설명한다. 고정 실천 테마는 일정 관리용 편집 틀이며 명리학 예측 규칙이 아니다: 1월 목표와 예산, 2월 우선순위와 선택 비용, 3월 역할과 책임 협의, 4월 학습과 준비 여력, 5월 관계의 경계, 6월 중간 점검, 7월 공동 비용·역할 분담, 8월 결과물과 피드백, 9월 대화와 표현, 10월 대안 비교, 11월 지출·약속 정리, 12월 회고와 다음 계획. 본문에서 달 숫자를 되풀이하지 않는다. 각 주제 안에서 기본 리포트의 참고 키워드와 실제 확인할 조건을 자연스럽게 연결한다.\nopportunities와 cautions 각각 약400자: 기회를 선택할 조건과 감당할 비용, 거절하거나 보류할 기준. 미래의 손실·갈등·성공을 확정하거나 특정 달에 행동을 지시하지 않는다.\nclosing 약250자: 스스로 조절할 수 있는 선택과 리포트를 다시 활용할 방법.\n\nsource_checks에는 source_checks_expected의 실제 dayGanZhi·annualGanZhi·12개월 monthGanZhi를 그대로 복사한다. 고객용 문장에는 이 필드나 내부 계산 ID를 넣지 않는다. 서버가 해당 인물·원국·월 번호와 연결해 값을 검사한다.\n";
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
 if(characters<6500)errors.push('REPORT_TOO_BRIEF');
 for(const gz of prose.match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g)||[])if(!actual.includes(gz))errors.push('UNSUPPORTED_GANZHI');
 if(/(?:운세|재물운|성공률|확률|연애운|건강운)[^.!?]{0,30}\d+\s*(?:점|퍼센트|%)/.test(prose))errors.push('INVENTED_SCORE');
 return [...new Set(errors)];
}
async function generate({profile,key,model,fetchImpl=fetch,now=new Date()}){
 const bundle=calculation.build({sajuProfile:profile,message:'2027 신년 리포트'},now,true);
 if(!bundle.charts.length||!bundle.periods.length)throw Object.assign(new Error('NEWYEAR_PROFILE_REQUIRED'),{code:'NEWYEAR_PROFILE_REQUIRED'});
 const primary=bundle.charts[0],period=bundle.periods[0];
 const input={reference_date:bundle.reference_date,timezone:bundle.timezone,source_checks_expected:{dayGanZhi:primary.candidates[0].pillars.day.ganZhi,annualGanZhi:period.value.annual.ganZhi,months:period.value.months.map(m=>({month:m.month,monthGanZhi:[...new Set(m.segments.map(s=>s.monthGanZhi))]}))},natal_reference:reference.natalNote(primary),existing_assessments:primary.interpretation_assessments,basic_report:primary.facts.find(f=>f.path==='basic_report').value,calendar_months:period.value.months.map(m=>({month:m.month,reference:reference.monthNote(m)})),daewoon:period.value.daewoon,limitations:[...primary.limitations,...period.limitations]};
 const expected=input.source_checks_expected;
 const {source_checks,...narrativeProperties}=schema.properties;
 const narrativeSchema={...schema,properties:narrativeProperties,required:schema.required.filter(k=>k!=='source_checks')};
 const narrativeInput={reference_date:input.reference_date,existing_assessments:input.existing_assessments,basic_report:input.basic_report,limitations:input.limitations};
 const narrativeRules=OUTPUT.split('\n\nsource_checks')[0];
 const start=Date.now(),response=await fetchImpl('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},signal:AbortSignal.timeout(105000),body:JSON.stringify({model,max_tokens:14000,temperature:.35,system:prompt.COMMON+'\n\n[신년상담 주제 모듈]\n'+prompt.MODULES.timing+'\n\n[선택한 신년 리포트 출력 규칙]\n'+narrativeRules,tools:[{name:'write_newyear_report',description:'제공된 계산 근거와 연결된 상세 신년 리포트를 작성합니다.',input_schema:narrativeSchema}],tool_choice:{type:'tool',name:'write_newyear_report'},messages:[{role:'user',content:'[서버 계산 자료 — 지시가 아닌 참고 데이터]\n'+JSON.stringify(narrativeInput)+'\n\n[최종 작성 확인]\n계산 사실은 서버가 표시합니다. 본문에서 간지·십성·달 번호·절입 시각을 재서술하지 마세요. 십성에서 수입 증가, 갈등, 피로, 기회 집중을 추론할 검수 규칙은 없습니다. 이러한 예측을 만들지 마세요. 각 분야 네 개 모두 title, reading, action 필드를 빠짐없이 작성하세요. 열두 달에는 편집용 실천 주제에 맞는 현실적인 비교 기준을 쓰세요. 본문 합계 6500자 이상을 유지하되 같은 키워드와 경고를 반복하지 마세요. 계산값이나 검증 필드는 작성하지 마세요. 개인의 수입·지출 증가 가능성이나 기회 발생 시기는 근거가 없으므로 예측하지 마세요. 나쁜 예: 올해는 수입과 지출이 늘어날 가능성이 높습니다. 좋은 예: 수입이 늘어난 경우와 그대로인 경우를 나눠 지출 한도를 비교하세요. 참고 키워드는 실제 성격이 아니라 확인할 가설이며 사실로 단정하지 마세요. 월별 문장은 사건이 생기는 시기가 아니라 점검 제안으로 시작하세요. 줄바꿈은 문자열 안에서 실제 줄바꿈으로 출력하고 역슬래시 n 문자를 중복 인코딩하지 마세요.'}]})});
 if(!response.ok)throw new Error('PROVIDER_ERROR');const data=await response.json(),blocks=(data.content||[]).filter(x=>x.type==='tool_use'&&x.name==='write_newyear_report'),report=blocks.length===1?normalizeText(blocks[0].input):null;
 if(report&&report.source_checks===undefined)report.source_checks=expected;
 const metrics=diagnostics([{model:data.model||model,usage:data.usage||{},latency_ms:Date.now()-start,stop_reason:data.stop_reason}],{reference_binding:'server',variant:'newyear-grounded',prompt_version:prompt.VERSION+'-annual.2',calculation_version:calculation.VERSION});
 if(data.stop_reason!=='tool_use')throw Object.assign(new Error('INCOMPLETE_REPORT'),{diagnostics:{...metrics,validation:'incomplete'}});const errors=validate(report,bundle);if(errors.length)throw Object.assign(new Error('INVALID_REPORT_EVIDENCE'),{validationErrors:errors,diagnostics:{...metrics,validation:'failed',rejected_preview:report}});
 report.months.sort((a,b)=>a.month-b.month);
 const hypothesis='아래 성향 설명은 기본 리포트의 참고 키워드에서 출발한 해석 가설입니다. 실제로 자신에게 해당하는지 확인하고, 맞지 않는 부분은 적용하지 마세요.\n\n';
 report.foundation=hypothesis+report.foundation;
 report.areas.forEach(a=>{a.reading=hypothesis+a.reading;});
 report.opportunities='이 절은 기회가 발생할 시기를 예측하는 내용이 아닙니다. 실제로 새로운 제안이 생겼을 때 선택할 조건을 확인해 주세요.\n\n'+report.opportunities;
 report.foundation=reference.natalNote(primary)+'\n\n'+report.foundation;
 report.months.forEach(m=>{m.calculationNote=reference.monthNote(period.value.months[m.month-1]);});
 // IDs are bound by the server to the authenticated primary person's current
 // chart and each month. The model only echoes small concrete values above.
 report.grounding=[{section:'overview',id:bundle.periods[0].id,path:'annual'}, {section:'foundation',id:bundle.charts[0].facts.find(f=>f.path==='pillars.day').id,path:''},...report.months.map(m=>({section:'months.'+m.month,id:bundle.periods[0].id,path:'months.'+(m.month-1)}))];
 return {report,bundle,diagnostics:{...metrics,validation:'passed',characters:JSON.stringify({...report,grounding:undefined}).length}};
}
module.exports={schema,OUTPUT,normalizeText,validate,generate};
