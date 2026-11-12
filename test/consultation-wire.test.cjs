const {test}=require('node:test'),assert=require('node:assert/strict');
const calc=require('../lib/consultation-calculation'),prompt=require('../lib/consultation-prompt'),wire=require('../lib/consultation-wire'),output=require('../lib/consultation-output'),service=require('../lib/consultation-service');
const profile={y:1990,m:1,d:1,hourValue:'unknown',gender:'unknown',calType:'solar'};
function prepare(){const b=calc.build({subjects:[{profile},{profile:{...profile,d:2}}],message:'두 사람의 관계'}),a=prompt.assemble(b,[],'두 사람의 관계');return {b,a};}
function answer(block){return {status:'answer',headline:'각자의 기준과 합의할 약속을 나누어 보세요.',blocks:[block],options:[],actions:[],follow_up_question:null,data_limitations:[]};}
test('strict provider schema removes identity duplication and unsupported grammar keywords',()=>{
 const s=wire.schema(prompt.schema);assert.equal(s.properties.blocks.items.additionalProperties,false);assert.deepEqual(s.properties.blocks.items.required,['kind','title','text','reference_id']);assert(!JSON.stringify(s).includes('maxItems'));assert(!JSON.stringify(s).includes('person_id'));
});
test('source IDs bind exact location and candidate without model-generated identities or values',()=>{
 const {b,a}=prepare(),source=b.topic_assessments.find(x=>x.result.ten_god==='정관'),raw=answer({kind:'traditional_interpretation',title:'관계의 기대',text:'서로 지킬 약속과 부담스러운 기대를 구분해 대화해 보세요.',reference_ids:[source.id]}),result=wire.materialize(raw,b);
 assert.deepEqual(output.validate(result,b,a.memory),[]);const text=output.render(result,b);assert.match(text,/월지의 지장간 癸에서 정관이 계산/);assert(!text.includes('월간에서 정관'));assert.equal(result.blocks[0].person_id,source.person_id);
});
test('invented sources, crossed people and non-common candidate sources are not repaired into truth',()=>{
 const {b,a}=prepare();for(const ids of [['invented'],[b.topic_assessments[0].id,b.topic_assessments.find(a=>a.person_id==='person-2').id]]){const r=wire.materialize(answer({kind:'traditional_interpretation',title:'기준',text:'현재 상황을 대조해 보세요.',reference_ids:ids}),b);assert(output.validate(r,b,a.memory).length);}
 const boundary=calc.build({sajuProfile:{...profile,y:2027,m:2,d:4},message:'직업'}),m=prompt.assemble(boundary,[],'직업');const fact=boundary.charts[0].facts.find(f=>f.path==='pillars.year');const r=wire.materialize(answer({kind:'chart_fact',title:'확인 범위',text:'자료를 확인합니다.',reference_ids:[fact.id]}),boundary);assert(output.validate(r,boundary,m.memory).includes('NONCOMMON_VALUE'));
});
test('observed wrong calendar location is rejected while ordinary time wording remains valid',()=>{
 const {b,a}=prepare(),raw=answer({kind:'traditional_interpretation',title:'기준',text:'월간에서 정관이 나타납니다.',reference_ids:[b.topic_assessments[1].id]});assert(output.validate(wire.materialize(raw,b),b,a.memory).includes('CALENDAR_FACT_SERVER_ONLY'));
 raw.blocks[0].text='대화할 시간을 서로 정해 보세요.';assert.deepEqual(output.validate(wire.materialize(raw,b),b,a.memory),[]);
});
test('production generation uses strict reference-only tool and returns source plus contextual reading',async()=>{
 const body={sajuProfile:profile,message:'돈이 새기 쉬운 부분은?'},b=calc.build(body);prompt.assemble(b,[],body.message);let called=0;
 const r=await service.generate({body,messages:[{role:'user',content:body.message}],model:'test',key:'test',fetchImpl:async(url,options)=>{called++;const request=JSON.parse(options.body);assert.equal(request.tools[0].strict,true);assert(request.tools[0].input_schema.properties.blocks.items.properties.reference_id);return {ok:true,json:async()=>({model:'test',stop_reason:'tool_use',content:[{type:'tool_use',name:'write_consultation',input:answer({kind:'traditional_interpretation',title:'돈의 경계',text:'부탁을 받고 지출하는 일이 있다면 호의와 합의한 부담을 나누어 보세요.',reference_ids:[b.topic_assessments[0].id]})}]})};}});
 assert.equal(called,1);assert.match(r.reply,/월간에서 비견이 계산/);assert.match(r.reply,/부탁을 받고/);assert.equal(r.diagnostics.validation_retries,0);
});

test('ordinary annual wording and missing birth-time notices do not reject grounded answers',()=>{
 const {b,a}=prepare();const raw=answer({kind:'traditional_interpretation',title:'연간 계획',text:'연간 정산 기준과 대화할 시간을 정해 보세요.',reference_id:b.topic_assessments[0].id});raw.data_limitations=['출생시간 미상으로 시주 판정이 제외되었습니다.'];assert.deepEqual(output.validate(wire.materialize(raw,b),b,a.memory),[]);
});
test('single source contract prevents combining people and quotes user facts without changing their meaning',()=>{
 const {b,a}=prepare();assert.deepEqual(wire.schema(prompt.schema).properties.blocks.items.properties.reference_id,{type:['string','null']});
 const r=wire.materialize(answer({kind:'user_context',title:'말씀하신 상황',text:'비상금 목표가 500만원입니다.',reference_id:'context-current'}),b,a.memory);assert.equal(r.blocks[0].text,'두 사람의 관계');
});

test('annual narrative rejects speculative opportunities but accepts conditional criteria',()=>{
 const q=require('../lib/newyear-quality');const r={overview:'새해 초반에 새로운 제안이 생길 가능성이 있습니다.',foundation:'확인',opportunities:'확인',cautions:'확인',closing:'확인',areas:[],months:[]};assert(q.repairTargets(r,{}).some(x=>x.errors.includes('UNSUPPORTED_EVENT_PREDICTION')));r.overview='실제로 새로운 제안이 있다면 비용과 권한을 확인하세요.';assert.equal(q.repairTargets(r,{}).length,0);
});

test('ordinary Korean suffixes do not count as ten-god names',()=>{const {b,a}=prepare();const raw=answer({kind:'traditional_interpretation',title:'기준',text:'결정인 만큼 예정인 비용을 확인해 보세요.',reference_id:b.topic_assessments[0].id});raw.follow_up_question='지출이 있을 예정인가요?';assert.deepEqual(output.validate(wire.materialize(raw,b),b,a.memory),[]);});
test('invented savings amounts are replaced with criteria while personal grounding is preserved',()=>{const bound=require('../lib/consultation-money-criteria').bound;const {b,a}=prepare();const r=wire.materialize(answer({kind:'traditional_interpretation',title:'돈의 경계',text:'부탁을 받았다면 합의한 몫을 확인해 보세요.',reference_id:b.topic_assessments[0].id}),b);r.options=[{label:'월 70만원 저축',suitable_when:'3개월 준비',tradeoff:'비상금 500만원으로 충분합니다.',next_action:'실행하세요.'}];const fixed=bound(r,{user_statements:[{quote:'현재 비상금 500만원'}]},'money');assert.equal(fixed.blocks[0],r.blocks[0]);assert(!JSON.stringify(fixed).includes('70만원'));assert.match(fixed.blocks.at(-1).text,/현재 보유한 비상금/);assert.equal(bound(r,a.memory,'relationship'),r);});

test('capability notices do not imply more birth data unlocks unsupported judgments',()=>{const {b}=prepare();const text=wire.limitations(b,'relationship').join(' ');assert.match(text,/출생시간 제공 여부와 관계없이/);assert.match(text,/출생정보를 알더라도 속마음이나 재회 여부/);});
