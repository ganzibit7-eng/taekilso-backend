'use strict';
const calculation=require('./consultation-calculation'),prompt=require('./consultation-prompt'),{read,strValue}=require('./consultation-output'),{diagnostics}=require('./consultation-service');
const text={type:'string'};
const schema={type:'object',properties:{overview:text,foundation:text,areas:{type:'array',minItems:4,maxItems:4,items:{type:'object',properties:{title:text,reading:text,action:text},required:['title','reading','action'],additionalProperties:false}},months:{type:'array',minItems:12,maxItems:12,items:{type:'object',properties:{month:{type:'integer',minimum:1,maximum:12},theme:text,reading:text,action:text},required:['month','theme','reading','action'],additionalProperties:false}},opportunities:text,cautions:text,closing:text,grounding:{type:'array',minItems:18,maxItems:21,items:{type:'object',properties:{section:text,evidence:{type:'array',minItems:1,maxItems:2,items:{type:'object',properties:{id:text,path:text,value:text},required:['id','path','value'],additionalProperties:false}}},required:['section','evidence'],additionalProperties:false}}},required:['overview','foundation','areas','months','opportunities','cautions','closing','grounding'],additionalProperties:false};
const OUTPUT=`write_newyear_report 도구로 2027년 신년 리포트를 작성한다. 일반 채팅의 짧은 답변 규칙 대신 아래 리포트 형식과 분량을 사용한다. 고객이 오래 읽고 활용할 기록이므로 근거·해석의 한계·선택 조건·실행 방법을 구체적으로 풀어낸다. 같은 조언을 12번 반복하지 않는다. 총 6,000~8,000자 안팎을 목표로 하되 근거 없는 예언으로 늘리지 않는다. 고객용 문장은 문단과 줄바꿈으로 구분하며 Markdown 기호·HTML·코드·내부 ID는 쓰지 않는다.
overview: 400자 안팎. 한 해를 읽는 관점과 연간 천간/십성의 실제 계산값, 입춘 전후 구분. 용어 하나를 사건으로 직결하지 않는다.
foundation: 350자 안팎. 확인된 원국과 기존 기본 리포트의 참고 키워드가 어떤 선택 기준을 살펴보는 데 쓰이는지, 알 수 없는 판단이 무엇인지 설명한다. 오행 '강하다'는 판정을 창작하지 않는다.
areas: 일과 진로 / 돈 관리 / 연애와 관계 / 생활 리듬 4개. 각 reading 350자 안팎, action 100자 안팎. 사용자 상황이 주어지지 않았으므로 직장/연애/소득을 가정하지 않는다. 서로 다른 선택지가 있을 때의 적용 조건과 현실에서 확인할 기준을 구체적으로 쓴다. 검수 규칙이 없는 전문 결론은 만들지 않는다.
months: 양력 1~12월. 각 theme은 평이한 한글, reading 200자 안팎, action 80자 안팎. 서버 months의 해당 월 절기 구간과 실제 월간/십성을 참고한다. 달 전체가 한 간지/십성인 것처럼 뭉뚱그리지 않는다. 전환일은 한국시간 그대로이며 특정 날의 행운·사건을 보장하지 않는다. 월별 실천 주제는 운세가 증명한 사건이 아니라 한 해를 정리하는 제안이라고 구분한다.
opportunities와 cautions: 각각 350자 안팎. 기회/위험을 확정 예언하지 말고 기회를 선택할 기준·비용·조건·보류할 기준을 설명한다. closing: 200자 안팎으로 스스로 조절할 수 있는 선택에 초점을 맞춘다.
신강·신약·격국·용신·합충·신살을 창작하지 않는다. 대운이 없다고 전체 리포트를 거절하지 말고 제공된 세운·월운으로 해석하며 한계를 밝힌다. 절기 경계 후보가 여러 개라면 한 후보를 확정하지 않는다. 1월 전체를 정미년으로 쓰지 않는다. 손실·이별·승진·질병·결혼·임신을 예언하거나 임의 점수/확률을 붙이지 않는다.
grounding은 내부 검사 자료다. overview, foundation, areas.0~areas.3, months.1~months.12 총 18개 section에 실제 근거를 하나 이상 각각 연결한다. id는 제공된 facts 또는 periods의 id, path는 그 value 안의 경로이며 value는 실제 값을 문자열로 복사한다. 객체/배열은 JSON 문자열이다. 월별 근거는 해당 월 months 인덱스(0부터 시작)에 연결한다. 예: section=months.3 이면 path=months.2.segments.0.monthGanZhi 이다. 원국은 해당 사람·후보 사실만 사용한다. 본문에 내부 ID/버전/개발 설명은 넣지 않는다.`;
function validate(r,bundle){
 const {validReport}=require('./newyear-report');if(!validReport(r)||!Array.isArray(r.grounding))return ['REPORT_SHAPE'];
 const errors=[],required=['overview','foundation',...Array.from({length:4},(_,i)=>'areas.'+i),...Array.from({length:12},(_,i)=>'months.'+(i+1))],refs=new Map([...bundle.charts.flatMap(c=>c.facts),...bundle.periods].map(f=>[f.id,f]));
 for(const section of required){const gs=r.grounding.filter(g=>g.section===section);if(gs.length!==1||!Array.isArray(gs[0].evidence)||!gs[0].evidence.length){errors.push('MISSING_SECTION_EVIDENCE');continue;}for(const e of gs[0].evidence){const ref=refs.get(e.id),actual=ref&&read(ref.value,e.path);if(!ref||ref.person_id!=='person-1'||actual===undefined||e.value!==strValue(actual))errors.push('EVIDENCE_VALUE_MISMATCH');if(section.startsWith('months.')&&(!bundle.periods.some(p=>p.id===e.id)||!e.path.startsWith('months.'+(Number(section.split('.')[1])-1)+'.')))errors.push('WRONG_MONTH_EVIDENCE');}}
 const prose=JSON.stringify({...r,grounding:undefined}),actual=JSON.stringify(bundle);
 const characters=[r.overview,r.foundation,...r.areas.flatMap(a=>[a.reading,a.action]),...r.months.flatMap(m=>[m.reading,m.action]),r.opportunities,r.cautions,r.closing].join('').length;
 if(characters<5000)errors.push('REPORT_TOO_BRIEF');
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
 return {report,bundle,diagnostics:{...metrics,validation:'passed',characters:JSON.stringify({...report,grounding:undefined}).length}};
}
module.exports={schema,OUTPUT,validate,generate};
