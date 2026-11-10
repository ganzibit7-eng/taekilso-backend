const {test}=require('node:test');
const assert=require('node:assert/strict');
const quality=require('../lib/newyear-quality');
const profile={name:'가상 검사',y:1990,m:1,d:1,calType:'solar',hourValue:'unknown',gender:'unknown'};
const now=new Date('2026-11-10T12:00:00Z');
function narrative(){const long='현재 상황과 선택 비용을 먼저 확인하고 충분한 검토 기간을 정해 보세요. '.repeat(18);return {overview:long,foundation:long,areas:Array.from({length:4},()=>({title:'분야',reading:long,action:'조건을 비교하세요.'})),months:Array.from({length:12},(_,i)=>({month:i+1,theme:'점검 주제',reading:long,action:'계획을 기록하세요.'})),opportunities:long+'첫 문단의 비교 기준을 보존합니다.\\n\\n다음 문단입니다.',cautions:long,closing:long};}
const fetchReport=r=>async(url,options)=>{const supplied=JSON.parse(JSON.parse(options.body).messages[0].content);return {ok:true,json:async()=>({stop_reason:'tool_use',usage:{input_tokens:100,output_tokens:200},content:[{type:'tool_use',name:'write_newyear_report',input:{...r,source_checks:structuredClone(supplied.source_checks_expected)}}]})};};
test('annual formatting restores double-escaped line breaks and preserves first opportunity paragraph',async()=>{const r=await quality.generate({profile,now,key:'test',model:'test',fetchImpl:fetchReport(narrative())});assert(r.report.opportunities.includes('첫 문단의 비교 기준을 보존합니다.\n\n다음 문단입니다.'));assert(!r.report.opportunities.includes('\\n'));assert.equal(r.report.months.length,12);assert(r.report.months.every(m=>m.calculationNote));});
test('annual report rejects observed unsupported income prediction',async()=>{const r=narrative();r.areas[1].reading+='올해는 수입 증가와 지출 증가가 동시에 일어날 가능성이 높습니다.';await assert.rejects(quality.generate({profile,now,key:'test',model:'test',fetchImpl:fetchReport(r)}),e=>e.validationErrors.includes('UNSUPPORTED_EVENT_PREDICTION'));});

test('annual provider receives actual calendar context and returns its own source check echo',async()=>{
 let supplied;const result=await quality.generate({profile,now,key:'test',model:'claude-haiku-4-5-20251001',fetchImpl:async(url,options)=>{supplied=JSON.parse(JSON.parse(options.body).messages[0].content);return fetchReport(narrative())(url,options);}});
 assert.equal(supplied.natal.commonPillars.day.ganZhi,'丙寅');assert.equal(supplied.annual.ganZhi,'丁未');assert.equal(supplied.annual.comparison.tenGodKorean,'겁재');assert.equal(supplied.daewoon,null);assert.equal(supplied.months.length,12);
 assert(supplied.months.every(m=>m.segments.every(s=>s.monthGanZhi&&s.comparison.reviewLens.question)));
 assert.equal(supplied.calculationVersion,result.bundle.version);assert(supplied.method.interpretation.includes('전문가가 검수한 길흉·사건 예측 규칙이 아니며'));
 assert(result.report.foundation.includes('丙寅'));assert(result.report.foundation.includes('겁재'));
 assert.equal(result.report.months[0].theme,[...new Set(supplied.months[0].segments.map(s=>s.comparison.reviewLens.theme))].join(' / '));
 assert.equal(result.diagnostics.estimated_usd,.0011);
});

test('annual context changes with actual day stem and excludes non-common boundary pillars or unknown cycles',()=>{
 const calc=require('../lib/consultation-calculation'),{buildContext}=require('../lib/newyear-context');
 const a=buildContext(calc.build({sajuProfile:profile,message:'2027'},now,true)),b=buildContext(calc.build({sajuProfile:{...profile,d:2},message:'2027'},now,true));
 assert.notEqual(a.annual.comparison.tenGod,b.annual.comparison.tenGod);assert.notEqual(a.months[0].segments[0].comparison.reviewLens.theme,b.months[0].segments[0].comparison.reviewLens.theme);
 const known=buildContext(calc.build({sajuProfile:{...profile,hourValue:'12',gender:'male'},message:'2027'},now,true));assert(known.daewoon.cycles.length);
 const ambiguous=buildContext(calc.build({sajuProfile:{...profile,y:2027,m:2,d:4},message:'2027'},now,true));assert(ambiguous.natal.ambiguous);assert(!ambiguous.natal.commonPillars.year);assert(!ambiguous.natal.commonPillars.month);assert.equal(ambiguous.daewoon,null);assert.equal(ambiguous.candidateIds.length,2);
});

test('missing or altered model source echoes are rejected instead of silently filled from the engine',async()=>{
 for(const mutate of [r=>delete r.source_checks,r=>r.source_checks.dayGanZhi='甲子',r=>r.source_checks.months[1].monthGanZhi=['甲子']]){
  await assert.rejects(quality.generate({profile,now,key:'test',model:'test',fetchImpl:async(url,options)=>{const response=await fetchReport(narrative())(url,options),data=await response.json();mutate(data.content[0].input);return {ok:true,json:async()=>data};}}),e=>e.message==='INVALID_REPORT_EVIDENCE'&&e.diagnostics.provider_calls===1);
 }
});

test('model prose cannot invent exact calendar dates, amounts or unsupported individual judgments',async()=>{
 for(const claim of ['10일 15시가 좋습니다.','50만원이 적절합니다.','용신은 화입니다.']){const r=narrative();r.foundation+=claim;await assert.rejects(quality.generate({profile,now,key:'test',model:'test',fetchImpl:fetchReport(r)}),e=>e.message==='INVALID_REPORT_EVIDENCE');}
});

test('upstream timeout preserves unknown cost rather than reporting a free generation',async()=>{
 await assert.rejects(quality.generate({profile,now,key:'test',model:'test',fetchImpl:async()=>{throw Object.assign(new Error('private provider response'),{name:'TimeoutError'});}}),e=>e.message==='AI_TIMEOUT'&&e.diagnostics.estimated_usd===null&&e.diagnostics.usage_known===false&&e.diagnostics.provider_calls===1&&!JSON.stringify(e.diagnostics).includes('private provider'));
});
