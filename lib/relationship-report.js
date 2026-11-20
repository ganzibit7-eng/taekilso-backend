'use strict';
const accountReport = require('./account-report');
const {buildDepth} = require('./relationship-depth');
const PRODUCT = 'taekilso_relationship_report';
const PRICE = 5900;
const NAME = '두 사람 관계 리포트';
const COLLECTION = 'relationshipReports';
const STEMS = '갑을병정무기경신임계';
const BRANCHES = '자축인묘진사오미신유술해';
const STEM_HANJA = '甲乙丙丁戊己庚辛壬癸';
const BRANCH_HANJA = '子丑寅卯辰巳午未申酉戌亥';
const STEM_ELEMENTS = '목목화화토토금금수수';
const BRANCH_ELEMENTS = '수토목목토화화토금금토수';
const NEXT = {목:'화',화:'토',토:'금',금:'수',수:'목'};
const STYLE = {
  목: { asset:'새로운 가능성을 찾아 제안하는 힘', friction:'변화가 필요한지부터 이야기하고 싶을 수 있어요.', line:'새로운 방법을 한 번만 시험해 보고, 다음 주에 계속할지 같이 정해요.' },
  화: { asset:'관심이나 마음을 말로 먼저 표현하는 힘', friction:'이 문제가 서로에게 어떤 느낌인지 먼저 나누고 싶을 수 있어요.', line:'이 얘기가 내게 왜 중요했는지 먼저 2분만 들어줄래요? 그다음 방법을 같이 고르고 싶어요.' },
  토: { asset:'일상에서 서로 지킬 수 있는 약속을 만드는 힘', friction:'당장 할 수 있는 일과 언제 할지를 먼저 정하고 싶을 수 있어요.', line:'이번 주에 실제로 지킬 수 있는 약속 하나만 골라요. 어려운 점은 미리 말해 줘요.' },
  금: { asset:'여러 선택을 정리해 합의할 기준을 세우는 힘', friction:'조건을 명확히 나눠야 대화가 풀린다고 느낄 수 있어요.', line:'꼭 지켰으면 하는 기준 하나와 서로 양보할 수 있는 조건 하나씩만 말해 봐요.' },
  수: { asset:'상대의 사정을 듣고 계획을 유연하게 고치는 힘', friction:'결론을 내리기 전에 양쪽의 사정을 더 듣고 싶을 수 있어요.', line:'내가 놓친 사정이 있는지 듣고 싶어요. 오늘 저녁에는 둘이 고른 선택지를 하나로 좁혀 봐요.' }
};

function validate(input) {
  const { first, second } = input || {};
  if (![first,second].every(i=>Number.isInteger(i)&&i>=0&&i<60)) {
    throw accountReport.failure(400,'INVALID_RELATIONSHIP','두 분의 생년월일과 달력 기준을 다시 확인해 주세요.');
  }
  return { first,second };
}

function person(index) {
  const stem=index%10, branch=index%12;
  return {
    day:STEMS[stem]+BRANCHES[branch], hanja:STEM_HANJA[stem]+BRANCH_HANJA[branch],
    stem:STEM_ELEMENTS[stem], branch:BRANCH_ELEMENTS[branch]
  };
}

function relation(a,b) {
  if (a===b) return { kind:'same', label:'같은 오행', text:`두 분 모두 ${a} 기운을 공유해요.` };
  const toward = element => element + (['목','금'].includes(element) ? '으로' : '로');
  if (NEXT[a]===b) return { kind:'support', label:'상생', text:`본인의 ${a}에서 상대방의 ${toward(b)} 이어지는 조합이에요.` };
  if (NEXT[b]===a) return { kind:'support', label:'상생', text:`상대방의 ${b}에서 본인의 ${toward(a)} 이어지는 조합이에요.` };
  return { kind:'tension', label:'상이한 오행·상극', text:`본인의 ${a}와 상대방의 ${b}는 전통 오행에서 서로 조율이 필요한 조합으로 봐요.` };
}

function present(report) {
  if (report?.version !== 'relationship-day-pillar-1' || report.edition >= 3 || report.people?.length !== 2) return report;
  const [mine,partner] = report.people;
  if (![mine.stem,mine.branch,partner.stem,partner.branch].every(element=>Object.hasOwn(NEXT,element))) return report;
  const stem=relation(mine.stem,partner.stem), branch=relation(mine.branch,partner.branch);
  const comparisons=[stem,branch];
  return {...report,
    evidence:report.evidence.map((item,index)=>({...item,detail:comparisons[index]?.text || item.detail})),
    ...buildDepth(stem.kind,branch.kind)
  };
}

function calculate({first,second}) {
  const mine=person(first), partner=person(second);
  const stem=relation(mine.stem,partner.stem), branch=relation(mine.branch,partner.branch);
  const myStyle=STYLE[mine.stem], theirStyle=STYLE[partner.stem];
  const strengths={
    same:'비슷한 방식으로 마음을 주고받을 때 서로를 이해하기 쉬워요. 좋았던 대화에서 무엇이 편했는지 한 가지씩 말해두면 다음에도 그 방식을 쓸 수 있어요.',
    support:'한 사람이 꺼낸 이야기를 다른 사람이 이어 구체화할 때 강점이 살아나요. 한쪽이 늘 시작하거나 마무리하지 않도록 다음 약속에서는 역할을 바꿔 보세요.',
    tension:'같은 문제를 다른 각도에서 보며 놓친 조건을 챙길 수 있어요. 한 사람이 원하는 방향을 말하면, 다른 사람은 실행 전에 확인할 조건을 한 가지 보태 보세요.'
  };
  const rhythm={
    same:'쉬는 날에 비슷한 속도를 원할 수 있어요. 다만 둘 다 같은 마음일 거라 넘겨짚지 말고, 함께할 시간과 각자 쉴 시간을 따로 정해 보세요.',
    support:'한 사람의 제안을 다른 사람이 일정에 맞춰주는 장면을 떠올려 볼 수 있어요. 한 번은 먼저 제안한 사람이 시간까지 조정해 보세요.',
    tension:'즉흥 약속과 미리 정한 일정이 부딪힐 때를 먼저 살펴봐요. 일정이 바뀌면 언제까지 알릴지, 다음 대안을 누가 제안할지 정하는 편이 좋아요.'
  };
  return {
    version:'relationship-day-pillar-1',
    people:[mine,partner],
    evidence:[
      { title:'일간 오행 · 의견을 꺼내는 방식', relation:stem.label, detail:stem.text },
      { title:'일지 오행 · 일상에서 맞추는 속도', relation:branch.label, detail:branch.text }
    ],
    summary:stem.kind==='same'?'비슷한 방식으로 가까워지되, 서로의 바람을 말로 확인해요.'
      :stem.kind==='support'?'한 사람이 꺼낸 이야기를 다른 사람이 이어갈 때 잘 풀려요.'
      :'서로 다른 시선을 순서대로 꺼내면 두 사람의 선택이 더 구체적이 돼요.',
    strengths:[
      { title:'대화가 잘 풀릴 때', detail:strengths[stem.kind] },
      { title:'서로에게서 빌려 쓸 강점', detail:`본인은 ${myStyle.asset}, 상대방은 ${theirStyle.asset}을 살펴보면 좋아요. 이번에 함께 결정할 일에서 각자 더 편하게 맡을 수 있는 역할을 하나씩 골라 보세요.` }
    ],
    friction:[
      { title:'답장이나 약속이 달라졌을 때', detail:rhythm[branch.kind] },
      { title:'중요한 결정을 한자리에서 내려야 할 때', detail:`본인은 ${myStyle.friction} 상대방은 ${theirStyle.friction} 먼저 상대가 지금 원하는 게 공감, 기준, 일정 중 무엇인지 묻고 답을 들은 다음 내 의견을 꺼내 보세요.` }
    ],
    conversations:[
      { title:'답장이 늦어 마음이 쓰일 때', ...{
        same:{first:'바쁠 때 둘 다 조용해지는 편인지 궁금해요. 늦게 답해도 서로 불편하지 않은 시간대를 맞춰볼까요?',second:'평일 저녁까지는 답이 늦어도 괜찮아요. 그날 약속에 영향이 있으면 한 줄 먼저 남기기로 해요.'},
        support:{first:'다음 약속은 내가 먼저 제안할게요. 시간 정하기가 어려우면 언제 다시 얘기할지 알려줄래요?',second:'오늘 9시쯤 가능한 시간을 두 개 보낼게요. 다음번에는 내가 먼저 날짜를 제안해 볼게요.'},
        tension:{first:'오늘 답장이 없어서 일정이 바뀐 건지 궁금했어요. 바쁠 때는 늦게 답한다고 한 줄만 남길 수 있을까요?',second:'길게 답할 여유가 없을 때는 한 줄 남길게요. 오늘은 저녁 9시쯤 이야기할 수 있어요.'}
      }[branch.kind] },
      { title:'서로 다른 선택지를 밀고 있을 때', first:myStyle.line, second:mine.stem===partner.stem
        ?'좋아요. 나는 이 결정에서 한 가지 더 바라는 점이 있어요. 먼저 서로의 우선순위를 말하고 같이 정해요.'
        :theirStyle.line },
      { title:'말이 격해져 다시 이야기하고 싶을 때', first:'아까 내 말이 어떻게 들렸는지 먼저 듣고 싶어요. 지금 힘들면 20분 쉬고 8시에 다시 이야기할까요?', second:stem.kind==='same'
        ?'좋아요. 비슷하게 생각할 거라고 넘겨짚은 부분부터 서로 확인해요.'
        :stem.kind==='support'?'좋아요. 이번에는 내가 먼저 들을게요. 그다음 역할을 바꿔서 2분씩 말해봐요.'
        :'좋아요. 다시 이야기할 때는 누가 맞는지보다 다음번에 다르게 할 행동을 하나씩 말해요.' }
    ],
    nextStep:'이번 주에 실제로 반복된 상황을 하나만 골라요. 위 문장을 그대로 읽거나 두 사람의 말투로 바꾼 뒤, 서로 지킬 약속 한 줄을 남겨요. 일주일 후에 도움이 됐는지 10분만 확인해 보세요.',
    note:'두 사람이 태어난 날을 기준으로, 의견을 꺼내는 방식과 일상의 속도를 각각 비교했어요. 태어난 시간이나 관계의 미래까지 판단하는 풀이는 아니에요. 본문에서 떠올린 장면이 실제로 있었는지 확인하고, 둘에게 맞는 제안만 골라 써보세요.',
    ...buildDepth(stem.kind,branch.kind)
  };
}

const CONFIG = {product:PRODUCT,price:PRICE,name:NAME,collection:COLLECTION,orderKey:'relationshipReportId',validate,calculate,present,
  listSummary:report=>({days:report.people.map(person=>person.day)})};
const run = (...args) => accountReport.run(CONFIG, ...args);
module.exports = {CONFIG,validate,calculate,run,present};
