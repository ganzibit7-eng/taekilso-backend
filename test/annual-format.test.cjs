const {test}=require('node:test');
const assert=require('node:assert/strict');
const quality=require('../lib/newyear-quality');
const profile={name:'가상 검사',y:1990,m:1,d:1,calType:'solar',hourValue:'unknown',gender:'unknown'};
const now=new Date('2026-11-10T12:00:00Z');
function narrative(){const long='현재 상황과 선택 비용을 먼저 확인하고 충분한 검토 기간을 정해 보세요. '.repeat(18);return {overview:long,foundation:long,areas:Array.from({length:4},()=>({title:'분야',reading:long,action:'조건을 비교하세요.'})),months:Array.from({length:12},(_,i)=>({month:i+1,theme:'점검 주제',reading:long,action:'계획을 기록하세요.'})),opportunities:long+'첫 문단의 비교 기준을 보존합니다.\\n\\n다음 문단입니다.',cautions:long,closing:long};}
const fetchReport=r=>async(url,options)=>{const supplied=JSON.parse(JSON.parse(options.body).messages[0].content);return {ok:true,json:async()=>({stop_reason:'tool_use',usage:{input_tokens:100,output_tokens:200},content:[{type:'tool_use',name:'write_newyear_report',input:{...r,source_checks:structuredClone(supplied.source_checks_expected)}}]})};};
test('annual requests constrain object structure and locally reject array counts unsupported by the provider grammar',async()=>{
 let request;const r=narrative();r.months.pop();
 await assert.rejects(quality.generate({profile,now,key:'test',model:'test',fetchImpl:async(url,options)=>{request=JSON.parse(options.body);return fetchReport(r)(url,options);}}),e=>e.validationErrors.includes('REPORT_SHAPE:months:11'));
 const tool=request.tools[0];assert.equal(tool.strict,true);assert.equal(tool.input_schema.properties.months.type,'array');assert.equal(tool.input_schema.properties.months.items.type,'object');assert.equal(tool.input_schema.additionalProperties,false);
 assert.equal(tool.input_schema.properties.months.maxItems,undefined);assert.equal(tool.input_schema.properties.months.minItems,1);assert.equal(tool.input_schema.properties.months.items.properties.month.minimum,undefined);
 assert.equal(quality.schema.properties.months.minItems,12);assert.equal(quality.schema.properties.months.maxItems,12);
});
test('annual formatting restores double-escaped line breaks and preserves first opportunity paragraph',async()=>{const r=await quality.generate({profile,now,key:'test',model:'test',fetchImpl:fetchReport(narrative())});assert(r.report.opportunities.includes('첫 문단의 비교 기준을 보존합니다.\n\n다음 문단입니다.'));assert(!r.report.opportunities.includes('\\n'));assert.equal(r.report.months.length,12);assert(r.report.months.every(m=>m.calculationNote));});
test('calendar quarter labels are not mistaken for invented minute values',async()=>{
 const r=narrative();r.closing+=' 1분기의 실제 지출 기록과 계획을 비교하세요.';
 const result=await quality.generate({profile,now,key:'test',model:'test',fetchImpl:fetchReport(r)});assert.equal(result.diagnostics.provider_calls,1);assert(result.report.closing.includes('1분기'));
 r.closing+=' 10분 후에 결정하세요.';await assert.rejects(quality.generate({profile,now,key:'test',model:'test',fetchImpl:fetchReport(r)}),e=>e.validationErrors.includes('NUMERIC_FACT_SERVER_ONLY'));
});
test('annual report rejects observed unsupported income prediction',async()=>{const r=narrative();r.areas[1].reading+='올해는 수입 증가와 지출 증가가 동시에 일어날 가능성이 높습니다.';await assert.rejects(quality.generate({profile,now,key:'test',model:'test',fetchImpl:fetchReport(r)}),e=>e.validationErrors.includes('UNSUPPORTED_EVENT_PREDICTION'));});

test('annual provider receives actual calendar context and returns its own source check echo',async()=>{
 let supplied;const result=await quality.generate({profile,now,key:'test',model:'claude-haiku-4-5-20251001',fetchImpl:async(url,options)=>{supplied=JSON.parse(JSON.parse(options.body).messages[0].content);return fetchReport(narrative())(url,options);}});
 assert.equal(supplied.source_checks_expected.dayGanZhi,'丙寅');assert.equal(supplied.source_checks_expected.annualGanZhi,'丁未');assert(supplied.natal.availablePillars.includes('day'));assert(!supplied.natal.availablePillars.includes('hour'));assert.equal(supplied.daewoon,null);assert.equal(supplied.months.length,12);
 assert(supplied.months.every(m=>m.segments.every(s=>s.comparison.relation&&s.comparison.reviewLens.question)));
 const {source_checks_expected,...writingContext}=supplied;
 assert(!/2027-\d{2}-\d{2}|丙寅|丁未|겁재/.test(JSON.stringify(writingContext)));
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

test('annual shape diagnostics identify the field without returning private generated text',async()=>{
 const r=narrative();r.months[3].action='';
 await assert.rejects(quality.generate({profile,now,key:'test',model:'test',fetchImpl:fetchReport(r)}),e=>e.validationErrors.includes('REPORT_SHAPE:months.3.action:0')&&!JSON.stringify(e.validationErrors).includes(r.overview));
});

test('one scoped prose repair preserves source checks and all other sections and counts both calls',async()=>{
 let calls=0;const bad=narrative();bad.foundation+='용신은 화입니다.';
 const result=await quality.generate({profile,now,key:'test',model:'claude-haiku-4-5-20251001',fetchImpl:async(url,options)=>{
  calls++;if(calls===1)return fetchReport(bad)(url,options);
  const request=JSON.parse(options.body),input=JSON.parse(request.messages[0].content);assert.equal(request.tool_choice.name,'repair_newyear_sections');assert.deepEqual(input.sections.map(p=>p.fieldPath),['foundation']);assert(input.sections[0].text.length<50);
  return {ok:true,json:async()=>({model:'claude-haiku-4-5-20251001',stop_reason:'tool_use',usage:{input_tokens:50,output_tokens:100},content:[{type:'tool_use',name:'repair_newyear_sections',input:{changes:[{path:input.sections[0].path,text:' 실제 상황을 확인하세요.'}]}}]})};
 }});
 assert.equal(calls,2);assert.equal(result.diagnostics.validation_retries,1);assert.equal(result.diagnostics.usage.input_tokens,150);assert.equal(result.diagnostics.usage.output_tokens,300);assert.equal(result.report.months[0].reading,bad.months[0].reading);assert.equal(result.report.source_checks.dayGanZhi,'丙寅');
});
test('repair cannot modify source evidence or another section and cannot silently omit a target',()=>{
 const targets=[{path:'foundation'}],r=narrative();
 for(const changes of [[],[{path:'source_checks.dayGanZhi',text:'甲子'}],[{path:'overview',text:'변경'}],[{path:'foundation',text:''}]])assert.throws(()=>quality.applyRepairs(r,changes,targets),/INVALID_REPORT_REPAIR/);
});
test('sentence repair preserves original spacing even if the provider trims its replacement',()=>{
 const r=narrative();r.foundation='첫 문장입니다. 50만원을 쓰세요.\n다음 문장입니다.';
 const targets=quality.repairTargets(r,{});assert.equal(targets.length,1);
 const repaired=quality.applyRepairs(r,[{path:targets[0].path,text:'필요한 비용을 확인하세요.'}],targets);
 assert.equal(repaired.foundation,'첫 문장입니다. 필요한 비용을 확인하세요.\n다음 문장입니다.');
});
test('failed repair keeps cost unknown and never runs a third provider call',async()=>{
 let count=0;const r=narrative();r.foundation+='50만원을 쓰세요.';
 await assert.rejects(quality.generate({profile,now,key:'test',model:'claude-haiku-4-5-20251001',fetchImpl:async(url,options)=>{count++;if(count===1)return fetchReport(r)(url,options);throw Object.assign(new Error('timeout'),{name:'TimeoutError'});}}),e=>e.diagnostics.provider_calls===2&&e.diagnostics.estimated_usd===null&&e.validationErrors.includes('REPAIR_FAILED'));assert.equal(count,2);
});

test('a residual date after repair is omitted without discarding verified prose, but a missing section still fails',async()=>{
 for(const empty of [false,true]){
  const original=narrative();const valid=empty?'':original.months[0].reading.trim();
  original.months[0].reading='1일에 새 일을 시작하세요. '+valid;
  let calls=0;
  const run=quality.generate({profile,now,key:'test',model:'test',fetchImpl:async(url,options)=>{
   if(++calls===1)return fetchReport(original)(url,options);
   const sections=JSON.parse(JSON.parse(options.body).messages[0].content).sections;
   return {ok:true,json:async()=>({stop_reason:'tool_use',usage:{input_tokens:50,output_tokens:50},content:[{type:'tool_use',name:'repair_newyear_sections',input:{changes:[{path:sections[0].path,text:'4일에 선택하세요.'}]}}]})};
  }});
  if(empty)await assert.rejects(run,e=>e.validationErrors.includes('NUMERIC_FACT_SERVER_ONLY'));
  else {const result=await run;assert.equal(result.report.months[0].reading,valid);assert.equal(result.report.overview,original.overview);assert.equal(result.report.source_checks.dayGanZhi,'丙寅');assert.deepEqual(result.diagnostics.omitted_invalid_sentences,['months.0.reading@0']);}
  assert.equal(calls,2);
 }
});

test('more than twelve affected fields are repaired as short sentences while valid prose stays byte-identical',async()=>{
 let count=0;const r=narrative();r.foundation+='용신은 화입니다.';for(const month of r.months)month.reading+=' 50만원을 쓰세요.\n 정상 문장은 그대로입니다.';
 const result=await quality.generate({profile,now,key:'test',model:'test',fetchImpl:async(url,options)=>{count++;if(count===1)return fetchReport(r)(url,options);const sections=JSON.parse(JSON.parse(options.body).messages[0].content).sections;assert.equal(sections.length,13);assert(sections.every(s=>s.text.length<50));return {ok:true,json:async()=>({stop_reason:'tool_use',usage:{input_tokens:100,output_tokens:100},content:[{type:'tool_use',name:'repair_newyear_sections',input:{changes:sections.map(s=>({path:s.path,text:' 필요한 조건을 확인하세요.'}))}}]})};}});
 assert.equal(count,2);assert.equal(result.report.overview,r.overview);assert(result.report.months.every(m=>m.reading.includes('정상 문장은 그대로입니다.')));assert.equal(result.diagnostics.validation_retries,1);
});
