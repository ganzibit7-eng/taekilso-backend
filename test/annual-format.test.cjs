const {test}=require('node:test');
const assert=require('node:assert/strict');
const quality=require('../lib/newyear-quality');
const profile={name:'가상 검사',y:1990,m:1,d:1,calType:'solar',hourValue:'unknown',gender:'unknown'};
const now=new Date('2026-11-10T12:00:00Z');
function narrative(){const long='현재 상황과 선택 비용을 먼저 확인하고 충분한 검토 기간을 정해 보세요. '.repeat(18);return {overview:long,foundation:long,areas:Array.from({length:4},()=>({title:'분야',reading:long,action:'조건을 비교하세요.'})),months:Array.from({length:12},(_,i)=>({month:i+1,theme:'점검 주제',reading:long,action:'계획을 기록하세요.'})),opportunities:long+'첫 문단의 비교 기준을 보존합니다.\\n\\n다음 문단입니다.',cautions:long,closing:long};}
const fetchReport=r=>async()=>({ok:true,json:async()=>({stop_reason:'tool_use',usage:{input_tokens:100,output_tokens:200},content:[{type:'tool_use',name:'write_newyear_report',input:r}]})});
test('annual formatting restores double-escaped line breaks and preserves first opportunity paragraph',async()=>{const r=await quality.generate({profile,now,key:'test',model:'test',fetchImpl:fetchReport(narrative())});assert(r.report.opportunities.includes('첫 문단의 비교 기준을 보존합니다.\n\n다음 문단입니다.'));assert(!r.report.opportunities.includes('\\n'));assert.equal(r.report.months.length,12);assert(r.report.months.every(m=>m.calculationNote));});
test('annual report rejects observed unsupported income prediction',async()=>{const r=narrative();r.areas[1].reading+='올해는 수입 증가와 지출 증가가 동시에 일어날 가능성이 높습니다.';await assert.rejects(quality.generate({profile,now,key:'test',model:'test',fetchImpl:fetchReport(r)}),e=>e.validationErrors.includes('UNSUPPORTED_EVENT_PREDICTION'));});
