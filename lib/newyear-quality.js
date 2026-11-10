'use strict';
const calculation=require('./consultation-calculation'),prompt=require('./consultation-prompt'),{diagnostics}=require('./consultation-service');
const text={type:'string'};
const schema={type:'object',properties:{overview:text,foundation:text,areas:{type:'array',minItems:4,maxItems:4,items:{type:'object',properties:{title:text,reading:text,action:text},required:['title','reading','action'],additionalProperties:false}},months:{type:'array',minItems:12,maxItems:12,items:{type:'object',properties:{month:{type:'integer',minimum:1,maximum:12},theme:text,reading:text,action:text},required:['month','theme','reading','action'],additionalProperties:false}},opportunities:text,cautions:text,closing:text,source_checks:{type:'object',properties:{dayGanZhi:text,annualGanZhi:text,months:{type:'array',minItems:12,maxItems:12,items:{type:'object',properties:{month:{type:'integer',minimum:1,maximum:12},monthGanZhi:{type:'array',minItems:1,maxItems:3,items:text}},required:['month','monthGanZhi'],additionalProperties:false}}},required:['dayGanZhi','annualGanZhi','months'],additionalProperties:false}},required:['overview','foundation','areas','months','opportunities','cautions','closing','source_checks'],additionalProperties:false};
const OUTPUT=`write_newyear_report 도구로 2027년 신년 리포트를 작성한다. 일반 채팅의 짧은 답변 규칙 대신 아래 리포트 형식과 분량을 사용한다. 고객이 오래 읽고 활용할 기록이므로 근거·해석의 한계·선택 조건·실행 방법을 구체적으로 풀어낸다. 같은 조언을 12번 반복하지 않는다. 고객용 본문 합계 최소 6,500자, 총 7,500~9,000자 안팎을 목표로 하되 근거 없는 예언으로 늘리지 않는다. 고객용 문장은 문단과 줄바꿈으로 구분하며 Markdown 기호·HTML·코드·내부 ID는 쓰지 않는다.
overview: 500자 안팎. 한 해를 읽는 관점과 연간 천간/십성의 실제 계산값, 입춘 전후 구분. 용어 하나를 사건으로 직결하지 않는다.
foundation: 450자 안팎. 확인된 원국과 기존 기본 리포트의 참고 키워드가 어떤 선택 기준을 살펴보는 데 쓰이는지, 알 수 없는 판단이 무엇인지 설명한다. 오행 '강하다'는 판정을 창작하지 않는다.
areas: 일과 진로 / 돈 관리 / 연애와 관계 / 생활 리듬 4개. 각 reading 400자 안팎, action 120자 안팎. 사용자 상황이 주어지지 않았으므로 직장/연애/소득을 가정하지 않는다. 서로 다른 선택지가 있을 때의 적용 조건과 현실에서 확인할 기준을 구체적으로 쓴다. 검수 규칙이 없는 전문 결론은 만들지 않는다.
months: 양력 1~12월. 각 theme은 평이한 한글, reading 230자 안팎, action 100자 안팎. 서버 months의 해당 월 절기 구간과 실제 월간/십성을 참고한다. 달 전체가 한 간지/십성인 것처럼 뭉뚱그리지 않는다. 전환일은 한국시간 그대로이며 특정 날의 행운·사건을 보장하지 않는다. 월별 실천 주제는 운세가 증명한 사건이 아니라 한 해를 정리하는 제안이라고 구분한다.
opportunities와 cautions: 각각 400자 안팎. 기회/위험을 확정 예언하지 말고 기회를 선택할 기준·비용·조건·보류할 기준을 설명한다. closing: 250자 안팎으로 스스로 조절할 수 있는 선택에 초점을 맞춘다.
신강·신약·격국·용신·합충·신살을 창작하지 않는다. 대운이 없다고 전체 리포트를 거절하지 말고 제공된 세운·월운으로 해석하며 한계를 밝힌다. 절기 경계 후보가 여러 개라면 한 후보를 확정하지 않는다. 1월 전체를 정미년으로 쓰지 않는다. 손실·이별·승진·질병·결혼·임신을 예언하거나 임의 점수/확률을 붙이지 않는다.
source_checks는 내부 값 대조 자료다. dayGanZhi에는 실제 일주, annualGanZhi에는 제공된 2027 세운 간지를 복사한다. months는 1~12월 각각 month 번호와 해당 월의 모든 절기 구간 monthGanZhi를 순서대로 담는다. 중복 간지는 한 번만 담는다. 달이나 간지를 직접 계산하거나 출생지·다른 인물 자료를 섞지 않는다. 내부 근거 ID는 서버가 인물·원국·월 번호에 맞춰 연결한다. 본문에는 source_checks나 내부 ID/버전을 넣지 않는다.`;
function validate(r,bundle){
 const {validReport}=require('./newyear-report');if(!validReport(r)||!r.source_checks||!Array.isArray(r.source_checks.months)||r.source_checks.months.length!==12||!bundle.periods[0])return ['REPORT_SHAPE'];
 const errors=[],c=bundle.charts[0],period=bundle.periods[0],checks=r.source_checks;
 if(checks.dayGanZhi!==c.candidates[0].pillars.day.ganZhi||checks.annualGanZhi!==period.value.annual.ganZhi)errors.push('EVIDENCE_VALUE_MISMATCH');
 for(let month=1;month<=12;month++){
  const found=checks.months.filter(m=>m.month===month),expected=[...new Set(period.value.months[month-1].segments.map(s=>s.monthGanZhi))];
  if(found.length!==1||!Array.isArray(found[0].monthGanZhi)||JSON.stringify(found[0].monthGanZhi)!==JSON.stringify(expected))errors.push('WRONG_MONTH_EVIDENCE');
 }
 const prose=JSON.stringify({...r,grounding:undefined,source_checks:undefined}),actual=JSON.stringify(bundle);
 const characters=[r.overview,r.foundation,...r.areas.flatMap(a=>[a.reading,a.action]),...r.months.flatMap(m=>[m.reading,m.action]),r.opportunities,r.cautions,r.closing].join('').length;
 if(characters<6500)errors.push('REPORT_TOO_BRIEF');
 for(const gz of prose.match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g)||[])if(!actual.includes(gz))errors.push('UNSUPPORTED_GANZHI');
 if(/\d+\s*(?:점|퍼센트|%)/.test(prose))errors.push('INVENTED_SCORE');
 return [...new Set(errors)];
}
async function generate({profile,key,model,fetchImpl=fetch,now=new Date()}){
 const bundle=calculation.build({sajuProfile:profile,message:'2027 신년 리포트'},now,true);
 if(!bundle.charts.length||!bundle.periods.length)throw Object.assign(new Error('NEWYEAR_PROFILE_REQUIRED'),{code:'NEWYEAR_PROFILE_REQUIRED'});
 const start=Date.now(),response=await fetchImpl('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},signal:AbortSignal.timeout(105000),body:JSON.stringify({model,max_tokens:14000,temperature:.35,system:prompt.COMMON+'\n\n[신년상담 주제 모듈]\n'+prompt.MODULES.timing+'\n\n[선택한 신년 리포트 출력 규칙]\n'+OUTPUT,tools:[{name:'write_newyear_report',description:'제공된 계산 근거와 연결된 상세 신년 리포트를 작성합니다.',input_schema:schema}],tool_choice:{type:'tool',name:'write_newyear_report'},messages:[{role:'user',content:'[서버 계산 자료]\n'+JSON.stringify(bundle)}]})});
 if(!response.ok)throw new Error('PROVIDER_ERROR');const data=await response.json(),blocks=(data.content||[]).filter(x=>x.type==='tool_use'&&x.name==='write_newyear_report'),report=blocks.length===1?blocks[0].input:null;
 const metrics=diagnostics([{model:data.model||model,usage:data.usage||{},latency_ms:Date.now()-start,stop_reason:data.stop_reason}],{variant:'newyear-grounded',prompt_version:prompt.VERSION+'-annual',calculation_version:calculation.VERSION});
 if(data.stop_reason!=='tool_use')throw Object.assign(new Error('INCOMPLETE_REPORT'),{diagnostics:{...metrics,validation:'incomplete'}});const errors=validate(report,bundle);if(errors.length)throw Object.assign(new Error('INVALID_REPORT_EVIDENCE'),{validationErrors:errors,diagnostics:{...metrics,validation:'failed'}});
 report.months.sort((a,b)=>a.month-b.month);
 // IDs are bound by the server to the authenticated primary person's current
 // chart and each month. The model only echoes small concrete values above.
 report.grounding=[{section:'overview',id:bundle.periods[0].id,path:'annual'}, {section:'foundation',id:bundle.charts[0].facts.find(f=>f.path==='pillars.day').id,path:''},...report.months.map(m=>({section:'months.'+m.month,id:bundle.periods[0].id,path:'months.'+(m.month-1)}))];
 return {report,bundle,diagnostics:{...metrics,validation:'passed',characters:JSON.stringify({...report,grounding:undefined}).length}};
}
module.exports={schema,OUTPUT,validate,generate};
