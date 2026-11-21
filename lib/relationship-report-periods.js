(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./wealth-interactions'));
  else root.TaekilRelationshipPeriods=factory(root.TaekilWealthInteractions);
})(globalThis,function(interactions){
  'use strict';
  const YEAR=2027;
  const terms=['小寒','立春','惊蛰','清明','立夏','芒种','小暑','立秋','白露','寒露','立冬','大雪'];
  const names={'正财':'정재','偏财':'편재','食神':'식신','伤官':'상관','比肩':'비견','劫财':'겁재','正官':'정관','七杀':'편관','正印':'정인','偏印':'편인'};
  const meanings={
    '正财':'마음을 꾸준한 행동으로 보여주는 흐름','偏财':'익숙한 관계 밖에도 눈을 돌리는 흐름',
    '食神':'편안한 대화에서 마음을 표현하는 흐름','伤官':'답답했던 관계의 규칙을 새롭게 보려는 흐름',
    '比肩':'서로 각자의 속도를 지키고 싶은 흐름','劫财':'주변의 의견과 내 마음을 가려보기 좋은 흐름',
    '正官':'관계의 약속과 방향을 분명히 하고 싶은 흐름','七杀':'관계의 속도와 기대가 빠르게 커지는 흐름',
    '正印':'이해받는 느낌과 안정감에 눈이 가는 흐름','偏印':'마음을 열기 전에 상대의 말을 곱씹어 보는 흐름'
  };
  const work={ '正财':'실제로 남는 결과와 대가를 맞추는 흐름','偏财':'기존 방식 밖에서 새 역할을 탐색하는 흐름','食神':'쌓은 숙련을 결과물로 꺼내는 흐름','伤官':'막힌 절차를 개선하고 의견을 제안하는 흐름','比肩':'일의 주도권과 순서를 스스로 정하는 흐름','劫财':'같은 일을 맡는 사람 사이에서 역할을 가려 보는 흐름','正官':'평가 기준이 선명해지고 책임을 맡는 흐름','七杀':'빠른 결정과 책임을 동시에 다루는 흐름','正印':'이미 가진 경험과 기록에서 기준을 얻는 흐름','偏印':'기존 지식을 다른 일에 응용하는 흐름' };
  const countPairs=links=>new Set(links.map(link=>link.match(/([甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥])·[^ ]+ ([甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥])/u)?.slice(1).sort().join('')||link)).size;
  const ms=stamp=>Date.parse(stamp.replace(' ','T')+'+08:00');
  const kst=t=>new Date(t+9*3600000).toISOString().slice(0,19).replace('T',' ')+' KST';
  const engine=(Solar,t)=>{
    const date=new Date(t+8*3600000).toISOString().slice(0,19);
    return Solar.fromYmdHms(...date.split(/[-T:]/).map(Number));
  };
  const asTime=(y,m)=>Date.UTC(y,m,1)-9*3600000;
  function calc(Solar,util,pillars,birth,profile,topic){
    if(!Solar||!util||!pillars?.day||!interactions)return null;
    const career=topic==='mujin';
    const stage=(pair,label)=>{
      const [stem,branch]=pair;
      const top=util.SHI_SHEN[pillars.day[0]+stem];
      const hidden=util.SHI_SHEN[pillars.day[0]+util.ZHI_HIDE_GAN[branch][0]];
      const links=interactions.toPeriod(pillars,label,pair);
      const groups=interactions.groups(pillars,[pair]);
      const supports=[top,hidden].filter(god=>['食神','伤官','正官','七杀','正印','偏印'].includes(god));
      const connection=countPairs(links.filter(link=>link.endsWith('합')))+groups.length;
      const adjustment=countPairs(links.filter(link=>/[충형파해]$/.test(link)));
      return {pair,top:names[top],hidden:names[hidden],reading:(career?work:meanings)[top],links,groups,
        affinity:career?connection+new Set(supports).size:connection,adjustment};
    };
    const getTerms=year=>Solar.fromYmd(year,6,1).getLunar().getJieQiTable();
    const table=getTerms(YEAR);
    const boundaries=terms.map(term=>ms(table[term].toYmdHms()));
    const fullBoundaries=[ms(getTerms(YEAR-1)['大雪'].toYmdHms()),...boundaries,ms(getTerms(YEAR+1)['小寒'].toYmdHms())];
    const calendar=Array.from({length:12},(_,i)=>{
      const from=asTime(YEAR,i),until=asTime(YEAR,i+1);
      const points=[from,...boundaries.filter(t=>t>from&&t<until),until];
      const spans=points.slice(0,-1).map((start,j)=>{
        const lunar=engine(Solar,start+1000).getLunar(),end=points[j+1];
        const boundary=fullBoundaries.findLastIndex(t=>t<=start);
        return {...stage(lunar.getMonthInGanZhiExact(),'월운'),start,end,from:kst(start),until:kst(end),
          solarFrom:kst(fullBoundaries[boundary]),solarUntil:kst(fullBoundaries[boundary+1]),
          annual:lunar.getYearInGanZhiExact()};
      });
      const main=spans.reduce((a,b)=>b.end-b.start>a.end-a.start?b:a);
      return {...main,month:i+1,spans};
    });
    const cycles=[];
    if(/^(?:[0-9]|1[0-9]|2[0-3])$/.test(profile?.hourValue)&&/^\d{4}-\d\d-\d\d$/.test(birth)&&
       ['male','female'].includes(profile.gender)&&pillars.year&&pillars.month){
      const solar=engine(Solar,Date.parse(birth+'T'+String(profile.hourValue).padStart(2,'0')+':00:00+09:00'));
      const eight=solar.getLunar().getEightChar();
      if(eight.getYear()===pillars.year&&eight.getMonth()===pillars.month){
        const yun=eight.getYun(profile.gender==='male'?1:0,2),first=yun.getStartSolar();
        for(const [i,cycle] of yun.getDaYun(16).slice(1).entries()){
          cycles.push({pair:cycle.getGanZhi(),from:ms(first.nextYear(i*10).toYmdHms()),until:ms(first.nextYear((i+1)*10).toYmdHms())});
        }
      }
    }
    const years=Array.from({length:10},(_,i)=>{
      const year=YEAR+i,start=ms(getTerms(year)['立春'].toYmdHms()),end=ms(getTerms(year+1)['立春'].toYmdHms());
      const pair=engine(Solar,start+1000).getLunar().getYearInGanZhiExact();
      return {...stage(pair,'세운'),year,cycles:cycles.filter(c=>c.from<end&&c.until>start).map(c=>({
        pair:c.pair,transition:c.from>=start?kst(c.from):null,links:interactions.between('대운',c.pair,'세운',pair)
      }))};
    });
    const top=key=>calendar.filter(row=>row[key]>0).sort((a,b)=>b[key]-a[key]||a.month-b.month).slice(0,3);
    const priorPair=engine(Solar,ms(getTerms(YEAR-1)['立春'].toYmdHms())+1000).getLunar().getYearInGanZhiExact();
    return {calendar,years,prior:stage(priorPair,'세운'),opportunity:top('affinity'),attention:top('adjustment')};
  }
  return {calc};
});
