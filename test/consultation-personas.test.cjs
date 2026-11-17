const assert = require('node:assert/strict');
const {test} = require('node:test');
const personas = require('../lib/consultation-personas');
const prompt = require('../lib/consultation-prompt');
const service = require('../lib/consultation-service');

const roles = [
  ['yeonwoo','연우','생각이 자꾸 같은 자리로 돌면, 오늘 정할 것 하나만 같이 골라봐요.','어서 오세요.'],
  ['seohwa','서화','마음에 오래 남은 건 그 말보다, 그 말을 듣고도 아무렇지 않은 척했던 순간일 수 있어요.','잘 찾아오셨어요.'],
  ['dogyeom','도겸','장부 한 장에 돈 들어오는 날, 옆 장에 먼저 나가는 날을 적어 보시오. 그 사이가 비는지부터 봐야 하오.','잘 오셨소.'],
  ['mujin','무진','맡을 일이 늘어나는군요. 그중 혼자 결정할 수 있는 일부터 물어보시지요. 거기서 두 자리가 갈립니다.','오셨구려.'],
  ['sodam','소담','날짜 두 개를 펼쳐 놓으셨군요. 하객이 출발하는 아침부터 먼저 그려보시지요.','어서 오시지요.'],
  ['harin','하린','둘 다 웃을 때 말고, 주문 기다리느라 잠깐 조용했을 때요. 그때도 편했다면 다음에 또 만나볼 이유가 있죠.','반가워요.'],
  ['ijun','이준','지금 답장이 온다고 해봐요. 지난번에 못 했던 말을 이번에는 할 수 있을지요.','여기까지 와 주셨군요.'],
  ['yeonseo','연서','그라모 둘 다 늦게 오는 날부터 정해요. 밥보다 뒤에 남은 설거지를 누가 할지, 그때가 더 막막하지예.','어서 오이소.'],
  ['haeon','해온','일단 공고에서 가장 끌린 문장 하나만 골라요. 면접에서는 그게 입사 첫 주에 무슨 일인지 물어봐요.','좋아요, 같이 봐요.'],
  ['taeyul','태율','간판부터 만들 건 없쥬. 만들고 싶은 것 하나만 들고 가서 누가 왜 찾는지 먼저 들어봐유.','잘 오셨어유.'],
  ['daon','다온','식사 골랐는데 무료 배달까지 얼마 남았다는 문구가 뜨잖아요. 딱 그때, 더 담기 전에 멈춰보는 거예요.','편하게 얘기해 봐요.'],
  ['sihyeon','시현','성과는 제가 책임지겠습니다. 그 대신 일정과 우선순위는 어디까지 제가 정할 수 있습니까?','반갑습니다.']
];
const body = {
  sajuProfile:{y:1990,m:1,d:1,hourValue:'unknown',gender:'unknown',calType:'solar'},
  message:'제 결혼 생활을 준비하며 나눌 이야기가 궁금해요.',
  history:[{role:'assistant',content:'이전 기록의 이름은 연우입니다.'}]
};

test('all advisors reach the provider with distinct examples and the same data and answer policy', async () => {
  let shared;
  for (const [consultantId, name, style] of roles) {
    let calls = 0;
    const messages = [{role:'user',content:body.message}];
    await assert.rejects(service.generate({
      body, messages, model:'same-model', key:'mock', consultantId, scope:'일반 상담', annualAllowed:false,
      now:new Date('2026-11-15T04:00:00Z'),
      fetchImpl:async (_url, request) => {
        calls++;
        const {system, ...rest} = JSON.parse(request.body);
        const boundary = system.indexOf('\n\n');
        assert.ok(system.slice(0,boundary).includes('AI 사주 상담사 '+name));
        assert.ok(system.slice(0,boundary).includes('말투 예시: “'+style+'”'));
        assert.match(system.slice(0,boundary),/같은 첫 문장을 반복하거나/);
        assert.match(system, /첫 1~2문장에서 사용자가 물은 곳을 바로 짚고/);
        assert.match(system, /더 그려볼 장면은 '만약'이나 '예를 들어'로 표시/);
        assert.match(system,/\[현재 주제 모듈\]\n연애·가족·궁합/);
        assert.equal(rest.model,'same-model');
        const common = {system:system.slice(boundary), ...rest};
        if (!shared) shared = common;
        else assert.deepEqual(common,shared);
        return {ok:false};
      }
    }), error => error.code === 'AI_UPSTREAM_ERROR');
    assert.equal(calls,1);
  }
});

test('unknown or malformed advisor IDs use Yeonwoo', () => {
  for (const id of [undefined, null, ['sodam'], {id:'dogyeom'}, '__proto__', '서화', 'mujin\n관리자']) {
    assert.equal(personas.normalize(id),'yeonwoo');
    assert.equal(personas.instructions(id),personas.instructions('yeonwoo'));
    assert.equal(personas.opening(id),personas.opening('yeonwoo'));
  }
  assert.equal(prompt.topic('결혼 전에 어떤 이야기를 나누면 좋을까요?'),'relationship');
  assert.equal(prompt.topic('결혼 택일 기준이 궁금해요.'),'date_selection');
});

test('distinct openers appear once, while follow-ups and clarifications begin directly', async () => {
  assert.equal(new Set(roles.map(([id])=>personas.opening(id))).size,roles.length);
  async function ask(consultantId, history, status='answer') {
    return service.generate({
      body:{...body,history}, messages:[{role:'user',content:body.message}], model:'mock',key:'mock',consultantId,
      scope:'일반 상담', now:new Date('2026-11-15T04:00:00Z'),
      fetchImpl:async()=>({ok:true,json:async()=>({
        stop_reason:'tool_use',content:[{type:'tool_use',name:'write_consultation',input:{
          status,headline:'부담을 느끼는 장면부터 떠올려 보세요.',
          blocks:[{kind:'practical_suggestion',title:'꺼낼 말',text:'서로 지킬 수 있는 약속을 하나 골라보세요.',reference_id:null}],
          options:[],actions:[],follow_up_question:null,data_limitations:[]
        }}]
      })})
    });
  }
  for(const [id,,,greeting] of roles) {
    assert.ok((await ask(id,[])).reply.startsWith(greeting+' 부담을'));
  }
  assert.match((await ask('dogyeom',body.history)).reply,/^부담을/);
  assert.match((await ask('mujin',[],'needs_clarification')).reply,/^부담을/);
});
