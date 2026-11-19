'use strict';

function providerQuestion(body) {
  let question = String(body.message || '').trim();
  const people = [
    body.sajuProfile,
    ...(Array.isArray(body.subjects) ? body.subjects.slice(0, 3).flatMap(subject => [subject, subject?.profile]) : [])
  ];
  const names = new Set();
  const dates = new Set();
  for (const person of people) {
    if (typeof person?.name === 'string' && person.name.trim().length >= 2) names.add(person.name.trim());
    const year=Number(person?.y), month=Number(person?.m), day=Number(person?.d);
    if (Number.isInteger(year) && year>=1900 && year<=2100 && Number.isInteger(month) && month>=1 && month<=12 && Number.isInteger(day) && day>=1 && day<=31) {
      dates.add(new RegExp('(?<!\\d)'+year+'(?:[. /-]+|년\\s*|(?=\\d{4}(?!\\d)))0?'+month+'(?:[. /-]+|월\\s*|(?=\\d{2}(?!\\d)))0?'+day+'일?(?!\\d)','g'));
    }
  }
  for (const name of [...names].sort((a,b) => b.length - a.length)) {
    question = question.replaceAll(name, '상담 대상');
  }
  for (const date of dates) question = question.replace(date, '[생년월일 생략]');
  return question
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[이메일 생략]')
    .replace(/(?<!\d)(?:\+82[ -]?)?(?:0?1[016789]|0[2-6]\d?)[ .-]?\d{3,4}[ .-]?\d{4}(?!\d)/g, '[연락처 생략]')
    .replace(/(?:19|20)\d{2}[.\s-]*년?\s*\d{1,2}[.\s-]*월?\s*\d{1,2}\s*일?(?=\s*(?:태어|출생|생일|생년월일|생입니다))/g, '[생년월일 생략]')
    .replace(/(생년월일|출생일|생일)(?:은|이|는|\s*:)?\s*(?:19|20)\d{2}[.\s-]*년?\s*\d{1,2}[.\s-]*월?\s*\d{1,2}\s*일?/g, '$1 [생년월일 생략]');
}

function providerCalculation(bundle) {
  return {
    version:bundle.version,
    reference_date:bundle.reference_date,
    timezone:bundle.timezone,
    basic_report_link:bundle.basic_report_link,
    errors:bundle.errors,
    approved_rules:bundle.approved_rules,
    charts:bundle.charts.map(chart => ({
      person_id:chart.person_id,
      status:chart.status,
      calculation_policy:chart.calculation_policy,
      candidates:chart.candidates.map(({id}) => ({id})),
      facts:chart.facts
        .filter(fact => chart.candidates.length === 1 || fact.candidate_id === 'common')
        .map(({id,candidate_id,path,value,label}) => ({id,candidate_id,path,value,label})),
      interpretation_assessments:chart.interpretation_assessments.map(({chart_id,...assessment}) => assessment),
      limitations:chart.limitations
    })),
    date_candidates:bundle.date_candidates.map(({id,person_ids,value}) => ({id,person_ids,value:{date:value.date,event:value.event}})),
    periods:bundle.periods.map(({id,person_id,candidate_ids,value,limitations}) => ({
      id,person_id,candidate_ids,limitations,
      value:{annual:value.annual,months:value.months,daewoon:value.daewoon?.cycles || null}
    }))
  };
}

module.exports = {providerQuestion,providerCalculation};
