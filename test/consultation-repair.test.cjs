const {test}=require('node:test'),assert=require('node:assert/strict');
const service=require('../lib/consultation-service'),prompt=require('../lib/consultation-prompt');
const {publicFailure,failureLog}=require('../lib/consultation-repair');
const body={sajuProfile:{y:1990,m:1,d:1,hourValue:'unknown',gender:'male',calType:'solar'},message:'돈이 새기 쉬운 부분은?',history:[{role:'user',content:'2027년 운세가 궁금해요.'},{role:'assistant',content:'대운은 2019~2028년 正印 운이 진행 중입니다.'}]};
function answer(){return {status:'answer',headline:'실제 지출 내역에서 반복해서 나가는 비용부터 확인해 보세요.',blocks:[{kind:'practical_suggestion',title:'지출 점검',text:'사용하지 않는 정기 구독과 자동결제를 먼저 확인해 보세요. 충동구매가 있다면 구매 직전 상황을 기록해 반복되는 계기를 살펴보세요.',person_id:null,evidence:[],candidate_ids:[],assessment_ids:[],context_ids:[]}],options:[],actions:['최근 한 달 결제 내역을 정기비용과 일회성 지출로 나눠 보세요.'],data_limitations:['사주 계산만으로 실제 소비 습관이나 지출 원인을 확정할 수는 없어요.'],follow_up_question:null};}
test('money followup retries with the rejected tool and actionable feedback, then returns only verified answer',async()=>{
 let calls=0;const messages=[...body.history,{role:'user',content:body.message}],bad=answer();
 bad.blocks[0]={...bad.blocks[0],kind:'traditional_interpretation',person_id:'person-1',candidate_ids:['p1-c1'],evidence:[{id:'invented-money-leak'}]};
 const result=await service.generate({body,messages,key:'test',model:'test',annualAllowed:true,scope:'신년 이용 가능',fetchImpl:async(url,options)=>{
  const request=JSON.parse(options.body);calls++;
  if(calls===2){assert.deepEqual(request.messages.slice(0,messages.length),messages);const previous=request.messages.at(-2).content[0],feedback=request.messages.at(-1).content[0];assert.equal(previous.id,'tool-first');assert.deepEqual(previous.input,bad);assert.equal(feedback.tool_use_id,previous.id);assert.equal(feedback.is_error,true);assert.match(feedback.content,/VALUE_MISMATCH/);assert.match(feedback.content,/MISSING_METHOD/);assert.match(feedback.content,/practical_suggestion/);assert.equal(previous.input.blocks[0].evidence[0].value,undefined);}
  return {ok:true,json:async()=>({model:'test',stop_reason:'tool_use',usage:{input_tokens:100,output_tokens:100},content:[{type:'tool_use',id:'tool-first',name:'write_consultation',input:calls===1?structuredClone(bad):answer()}]})};
 }});
 assert.equal(calls,2);assert.match(result.reply,/정기 구독/);assert(!result.reply.includes('正印'));assert.equal(result.diagnostics.validation_retries,1);assert.equal(result.diagnostics.usage.output_tokens,200);
});
test('unrepaired hallucinated money evidence remains rejected after the single bounded retry',async()=>{
 let calls=0;await assert.rejects(service.generate({body,messages:[{role:'user',content:body.message}],key:'test',model:'test',scope:'일반',fetchImpl:async()=>{calls++;const bad=answer();bad.blocks[0].evidence=[{id:'invented'}];return {ok:true,json:async()=>({stop_reason:'tool_use',content:[{type:'tool_use',id:'bad',name:'write_consultation',input:bad}]})};}}),e=>e.code==='AI_EVIDENCE_VALIDATION_FAILED'&&e.diagnostics.validation_failures.every(x=>x.includes('VALUE_MISMATCH')));assert.equal(calls,2);
});
test('public failures distinguish timeout, unfinished answers and evidence; logs exclude personal content',()=>{
 const codes=['AI_TIMEOUT','AI_UPSTREAM_ERROR','AI_INCOMPLETE_RESPONSE','AI_EVIDENCE_VALIDATION_FAILED'];assert.equal(new Set(codes.map(publicFailure)).size,4);for(const c of codes)assert.match(publicFailure(c),/차감하지 않았습니다/);
 const log=failureLog({code:'AI_EVIDENCE_VALIDATION_FAILED',message:'private',diagnostics:{structured:{name:'private'},validation_failures:[['MISSING_METHOD']],prompt_version:'v',provider_calls:2}});assert(!JSON.stringify(log).includes('private'));assert.deepEqual(log.validation_failures,[['MISSING_METHOD']]);
 assert.equal(prompt.topic(body.message),'money');assert.match(prompt.OUTPUT,/구독\/고정비 목록만 나열하지 않는다/);
});
