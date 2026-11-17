const assert = require('node:assert/strict');
const {test} = require('node:test');
const personas = require('../lib/consultation-personas');
const prompt = require('../lib/consultation-prompt');
const service = require('../lib/consultation-service');

const roles = [
  ['yeonwoo','연우','지금 풀 수 있는 매듭부터 하나씩 볼까요?'],
  ['seohwa','서화','먼저, 그 말이 마음에 걸렸던 순간부터 같이 봐요.'],
  ['dogyeom','도겸','일은 더 받았는데 손에 남는 돈은 늦게 들어오나요? 그 간격부터 봐요.'],
  ['mujin','무진','새 회사에서 일이 많아진다고 하셨죠. 그중 본인이 결정할 수 있는 일부터 확인하십시오.'],
  ['sodam','소담','식장 달력을 보기 전에 두 분에게 빠지면 아쉬운 사람이 누군지부터 적어볼까요?'],
  ['harin','하린','대화가 즐거웠다면, 말이 끊긴 순간에도 편했는지 한번 떠올려 봐요.'],
  ['ijun','이준','지금 답장이 와도 지난번과 다른 대화를 할 수 있을까요? 그게 연락 전에 볼 첫 번째예요.'],
  ['yeonseo','연서','둘 다 지친 저녁에 밥과 설거지는 어떻게 나누고 싶나요? 그 얘기부터 꺼내봐요.'],
  ['haeon','해온','이 공고대로라면 첫 주에 어떤 일을 혼자 맡게 되는지 물어봐요.'],
  ['taeyul','태율','가게 간판부터 달 필요는 없습니다. 무엇에 돈을 낼 사람인지 먼저 만나봅시다.'],
  ['daon','다온','야근 날 배달은 괜찮아요. 식사를 고른 뒤 이것저것 더 담는 순간에 선을 한 번 그어봐요.'],
  ['sihyeon','시현','성과는 제가 책임지겠습니다. 그 대신 일정과 우선순위는 어디까지 제가 정할 수 있습니까?']
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
  }
  assert.equal(prompt.topic('결혼 전에 어떤 이야기를 나누면 좋을까요?'),'relationship');
  assert.equal(prompt.topic('결혼 택일 기준이 궁금해요.'),'date_selection');
});
