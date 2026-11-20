'use strict';
const {Solar,LunarUtil}=require('lunar-javascript');
const {stemComparison}=require('./newyear-context');

const focusAreas=[
  {title:'연애·결혼',weights:{正官:3,正财:3,食神:2,正印:1},action:'만남이나 동거를 고민 중이라면, 반복해서 지킬 수 있는 생활 약속을 먼저 맞춰보세요.'},
  {title:'수입·자산',weights:{正财:3,偏财:3,食神:2,伤官:1},action:'받기로 한 수입에서 비용을 빼고, 돈이 들어오는 날까지 맞춰봐야 실제로 남는 몫이 보여요.'},
  {title:'부동산·이사',weights:{正财:3,正印:3,正官:2,偏印:1},action:'매수·매도·이사 중 진행 중인 일이 있다면 자금, 계약 조건, 일정이 함께 맞는지 확인해요.'},
  {title:'직업·사업',weights:{正官:3,七杀:3,食神:2,伤官:2,比肩:1},action:'제안이 있다면 직함보다 맡을 결과, 결정할 권한, 제공되는 자원을 비교해요.'},
  {title:'가족·건강관리',weights:{正印:3,偏印:2,劫财:2,比肩:1},action:'가족 일정과 비용은 먼저 누가 맡을지 정해요. 건강은 평소 생활과 검진 계획을 점검하는 범위로 봐요.'}
];
const time=value=>Date.parse(value.slice(0,19).replace(' ','T')+'+09:00');

function buildDecisionGuide(calculation){
  const {year,pillars,months}=calculation||{};
  if(!Number.isInteger(year)||!pillars?.day?.[0]||months?.length!==12||
     months.some(({segments})=>!segments?.length||segments.some(segment=>!LunarUtil.ZHI_HIDE_GAN[segment.monthGanZhi?.[1]])))return null;
  const stem=pillars.day[0];
  const periods=months.map(({month,segments})=>{
    const segment=segments.reduce((a,b)=>time(b.untilExclusive)-time(b.from)>time(a.untilExclusive)-time(a.from)?b:a);
    const mainStem=LunarUtil.ZHI_HIDE_GAN[segment.monthGanZhi[1]][0];
    return {month,comparison:stemComparison(stem,segment.monthGanZhi[0]),
      support:stemComparison(stem,mainStem),from:segment.from.slice(0,16),untilExclusive:segment.untilExclusive.slice(0,16)};
  });
  const annual=Array.from({length:10},(_,i)=>{
    const y=year+i;
    const ganZhi=Solar.fromYmd(y,7,1).getLunar().getYearInGanZhiExact();
    return {year:y,ganZhi,comparison:stemComparison(stem,ganZhi[0]),support:stemComparison(stem,LunarUtil.ZHI_HIDE_GAN[ganZhi[1]][0])};
  });
  function candidates(items,weights,key){
    return items.flatMap(item=>{
      const primary=weights[item.comparison.tenGod]||0,support=weights[item.support.tenGod]||0;
      const strength=primary*2+support;
      if(!strength)return [];
      const evidence=primary?item.comparison:item.support;
      return [{strength,[key]:item[key],...(item.from&&{from:item.from,untilExclusive:item.untilExclusive}),
        basis:evidence.tenGodKorean,theme:evidence.reviewLens.theme}];
    }).sort((a,b)=>b.strength-a.strength||a[key]-b[key]).slice(0,3)
      .map(({strength,...visible})=>visible);
  }
  const areas=focusAreas.map(({title,weights,action})=>({title,action,windows:candidates(periods,weights,'month'),yearWindows:candidates(annual,weights,'year')}));
  const years=annual.map(({year,ganZhi,comparison:{tenGodKorean,reviewLens}})=>{
    return {year,ganZhi,basis:tenGodKorean,theme:reviewLens.theme,action:reviewLens.question};
  });
  return {areas,years};
}

module.exports={buildDecisionGuide};
