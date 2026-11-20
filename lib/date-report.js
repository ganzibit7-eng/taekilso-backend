'use strict';
const { Solar } = require('lunar-javascript');
const accountReport = require('./account-report');
const { failure } = accountReport;

const PRODUCT = 'taekilso_date_report';
const PRICE = 3900;
const NAME = '정밀 택일 1건권';
const COLLECTION = 'dateReports';
const ALGORITHM = 'taekil-day-1';
const DAY = 86400000;
const BASE = Date.UTC(1984, 1, 2);
const STEMS = ['갑','을','병','정','무','기','경','신','임','계'];
const BRANCHES = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const STEM_HANJA = '甲乙丙丁戊己庚辛壬癸';
const BRANCH_HANJA = '子丑寅卯辰巳午未申酉戌亥';
const ELEMENTS = ['목','화','토','금','수'];
const EVENTS = {
  결혼식: { elements: ['화','목'], checklist: ['예식장 확정 가능 시간과 보증 인원을 확인해요.', '양가와 주요 하객의 이동 시간, 대관료 차이를 비교해요.'] },
  이사: { elements: ['토','금'], checklist: ['입주·퇴거와 잔금 일정이 맞는지 확인해요.', '이사업체 견적, 엘리베이터 예약, 주차 시간을 비교해요.'] },
  개업: { elements: ['화','목'], checklist: ['공사와 인허가가 마무리되는 시간을 확인해요.', '인력 배치와 초도 물량, 고객이 방문하기 편한 시간을 비교해요.'] },
  계약체결: { elements: ['금','토'], checklist: ['양측 서류 준비와 서명권자의 일정을 확인해요.', '확정된 조건과 납부 일정을 서명 전에 대조해요.'] }
};

function validate(input) {
  const { event, days, mine, partner } = input || {};
  if (typeof event !== 'string' || !Object.hasOwn(EVENTS,event) || !ELEMENTS.includes(mine) ||
      (partner != null && !ELEMENTS.includes(partner)) || !Array.isArray(days) ||
      days.length < 2 || days.length > 5 || new Set(days).size !== days.length) {
    throw failure(400,'INVALID_COMPARISON','서로 다른 후보일 2~5개와 사주 정보를 확인해 주세요.');
  }
  for (const day of days) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw failure(400,'INVALID_COMPARISON','후보일은 양력 날짜로 입력해 주세요.');
    }
    const utc = new Date(day + 'T00:00:00Z');
    if (!Number.isFinite(+utc) || utc.toISOString().slice(0,10) !== day ||
        utc.getUTCFullYear() < 1900 || utc.getUTCFullYear() > 2100) {
      throw failure(400,'INVALID_COMPARISON','1900년부터 2100년 사이의 유효한 날짜를 골라 주세요.');
    }
  }
  return { event, days: [...days].sort(), mine, partner: partner ?? null };
}

// Same day stem, event weights, folk calendar and display scale as the free tool.
function calculate({event,days,mine,partner}) {
  const {elements, checklist} = EVENTS[event];
  const candidates = days.map(day => {
    const date = new Date(day + 'T00:00:00Z');
    const index = ((+date - BASE) / DAY + 2 + 6000000) % 60;
    const element = ELEMENTS[Math.floor((index % 10) / 2)];
    const people = (partner ? [mine,partner] : [mine]).map((person,i) => {
      const distance = Math.abs(ELEMENTS.indexOf(person) - ELEMENTS.indexOf(element));
      const relation = distance === 0 ? '같은 기운' : distance === 1 || distance === 4 ? '상생' : '상극';
      const weight = relation === '같은 기운' ? 1 : relation === '상생' ? 2 : -2;
      return { label: i ? '상대방' : '본인', relation, weight };
    });
    const eventWeight = elements.includes(element) ? 1.5 : 0;
    const lunarDay = Solar.fromYmd(...day.split('-').map(Number)).getLunar().getDay();
    const folkWeight = lunarDay % 10 === 9 || lunarDay % 10 === 0 ? (event === '이사' ? 2 : 0.8) : 0;
    const adjustment = ((index * 7 + date.getUTCDay() * 3) % 11) / 11 * 0.3 - 0.15;
    const raw = people.reduce((sum,person)=>sum+person.weight,0)/people.length + eventWeight + folkWeight + adjustment;
    return {
      day, element, people, eventWeight, lunarDay, folkWeight,
      ganji: STEMS[index % 10] + BRANCHES[index % 12],
      hanja: STEM_HANJA[index % 10] + BRANCH_HANJA[index % 12],
      points: Math.round(Math.max(0,Math.min(1,(raw+2)/6.3))*100)
    };
  }).sort((a,b)=>b.points-a.points || a.day.localeCompare(b.day));
  const first = candidates[0];
  const tied = candidates.filter(candidate => candidate.points === first.points).length;
  return {
    version: ALGORITHM, event, withPartner: Boolean(partner), candidates, checklist,
    summary: tied > 1
      ? `상위 ${tied}개 후보의 표시 점수가 같아요. 현실 일정으로 우선순위를 정해 보세요.`
      : `${first.day.replaceAll('-', '.')} 후보가 이 비교에서 가장 높아요. 다음 후보와는 ${first.points-candidates[1].points}점 차이예요.`,
    note: '입력한 생년월일의 일간 오행과 후보일의 일진을 비교했어요. 손없는 날은 별도의 민속 기준으로 더했어요. 출생시간과 시간대별 길시는 계산하지 않으며 점수는 두 후보 이상을 비교하기 위한 참고값이에요.'
  };
}

const CONFIG = { product:PRODUCT, price:PRICE, name:NAME, collection:COLLECTION, orderKey:'dateReportId', validate, calculate, includePremium:true };
const run = (...args) => accountReport.run(CONFIG, ...args);

module.exports = { PRODUCT, PRICE, NAME, COLLECTION, CONFIG, validate, calculate, run };
