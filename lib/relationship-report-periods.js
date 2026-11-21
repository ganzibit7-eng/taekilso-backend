(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./wealth-interactions'));
  else root.TaekilRelationshipPeriods=factory(root.TaekilWealthInteractions);
})(globalThis,function(interactions){
  'use strict';
  const YEAR=2027;
  const terms=['小寒','立春','惊蛰','清明','立夏','芒种','小暑','立秋','白露','寒露','立冬','大雪'];
  const names={'正财':'정재','偏财':'편재','食神':'식신','伤官':'상관','比肩':'비견','劫财':'겁재','正官':'정관','七杀':'편관','正印':'정인','偏印':'편인'};
  const meanings={
    '正财':'마음을 꾸준한 행동으로 보여주는 흐름','偏财':'말보다는 오가는 호의와 반응에 신경이 쓰이는 흐름',
    '食神':'편안한 대화에서 마음을 표현하는 흐름','伤官':'답답했던 관계의 규칙을 새롭게 보려는 흐름',
    '比肩':'서로 각자의 속도를 지키고 싶은 흐름','劫财':'주변의 의견과 내 마음을 가려보기 좋은 흐름',
    '正官':'관계의 약속과 방향을 분명히 하고 싶은 흐름','七杀':'관계의 속도와 기대가 빠르게 커지는 흐름',
    '正印':'이해받는 느낌과 안정감에 눈이 가는 흐름','偏印':'마음을 열기 전에 상대의 말을 곱씹어 보는 흐름'
  };
  const reunion={
    '正财':'다시 지킬 수 있는 약속인지 따져 보는 흐름','偏财':'그 시절의 익숙함과 지금 오가는 호의를 구별하는 흐름',
    '食神':'지난 인연에서도 편하게 나눌 수 있었던 이야기가 떠오르는 흐름','伤官':'그때 꺼내지 못한 말이 지금도 중요한지 돌아보는 흐름',
    '比肩':'상대와의 관계보다 내 마음의 속도부터 되찾는 흐름','劫财':'주변의 평가와 내 경험을 나눠서 보는 흐름',
    '正官':'다시 가까워지더라도 지키고 싶은 선이 또렷해지는 흐름','七杀':'마음이 급해질 때 그만큼 생각할 여지가 줄어드는 흐름',
    '正印':'지난 관계에서 편안하고 이해받았던 지점에 마음이 가는 흐름','偏印':'지나간 대화를 여러 번 되짚으며 빠뜨린 맥락을 찾는 흐름'
  };
  const work={ '正财':'실제로 남는 결과와 대가를 맞추는 흐름','偏财':'기존 방식 밖에서 새 역할을 탐색하는 흐름','食神':'쌓은 숙련을 결과물로 꺼내는 흐름','伤官':'막힌 절차를 개선하고 의견을 제안하는 흐름','比肩':'일의 주도권과 순서를 스스로 정하는 흐름','劫财':'같은 일을 맡는 사람 사이에서 역할을 가려 보는 흐름','正官':'평가 기준이 선명해지고 책임을 맡는 흐름','七杀':'빠른 결정과 책임을 동시에 다루는 흐름','正印':'이미 가진 경험과 기록에서 기준을 얻는 흐름','偏印':'기존 지식을 다른 일에 응용하는 흐름' };
  const summaries={
    seohwa:{
      open:'가까워지는 계기',turn:'서로의 거리와 속도 조정',mixed:'가까워지면서도 속도가 엇갈리는 구간',
      opportunity:'새 인연에서는 대화가 편해지는 상대가, 기존 관계에서는 함께 정할 일이 늘어나는 때가 눈에 들어와요.',
      change:'새 인연에서는 첫 호감의 속도, 기존 관계에서는 반복되던 약속이나 거리감이 달라지는 쪽으로 읽어요.',
      quiet:'새 인연과 기존 관계 모두 평소의 마음 여는 방식이 이어지기 쉬운 구간이에요.'
    },
    ijun:{
      open:'지난 관계에서 남은 접점',turn:'익숙한 관계를 다시 보는 계기',mixed:'남은 친밀감과 달라진 기준의 공존',
      opportunity:'지난 인연에서 무엇이 여전히 편안하게 느껴지는지 돌아보는 흐름이에요. 새 인연에서는 그 편안함을 다른 사람에게서도 느끼는지가 관건이에요.',
      change:'그리움과 다시 반복하고 싶지 않은 일의 차이가 뚜렷해지는 구간이에요. 다음 인연에 기대하는 기준도 여기서 갈릴 수 있어요.',
      quiet:'지난 인연에 대한 해석은 원국의 관계 성향을 중심으로 이어져요. 새 관계로 마음이 움직이는지는 아래 십성의 성격에서 따로 읽어요.'
    },
    mujin:{
      open:'지금의 강점을 다른 자리에서도 쓸 계기',turn:'소속이나 역할의 조정',mixed:'성장 기회와 역할 조정의 공존',
      opportunity:'취업·이직에서는 지금까지 쌓은 능력이 새 자리와 맞는지, 승진에서는 맡던 일이 새 책임으로 이어질 수 있는지가 관건이에요.',
      change:'취업·이직에서는 일하는 환경, 승진에서는 책임의 경계가 달라지는 쪽에 무게를 둬요.',
      quiet:'가시적인 이동보다 평소 일하는 방식과 익숙한 역할을 바탕으로 변화를 읽는 구간이에요.'
    }
  };
  const changeMeanings={충:'서로 다른 방향이 부딪히는',형:'익숙한 방식에 마찰이 생기는',파:'맞아 오던 리듬이 느슨해지는',해:'표면보다 안쪽의 어긋남이 드러나는'};
  const relationNames={육합:'육합',천간합:'천간합',충:'충(沖)',형:'형(刑)',파:'파(破)',해:'해(害)'};
  const slotNames={일지:'내 사주의 일지',월지:'내 사주의 월지',연지:'내 사주의 연지',시지:'내 사주의 시지',일간:'내 사주의 일간',월간:'내 사주의 월간',연간:'내 사주의 연간',시간:'내 사주의 시간'};
  const axes=(links,career)=>links.filter(link=>link.startsWith(career?'월지 ': '일지 ')||career&&link.startsWith('월간 '));
  const priority=(row,key,career)=>axes(row.links,career).some(link=>key==='affinity'?link.endsWith('합'):/[충형파해]$/.test(link))?1:0;
  function describe(row,topic){
    const career=topic==='mujin',theme=summaries[topic];
    const main=axes(row.links,career);
    const source=main.length?main:row.links;
    const connection=source.find(link=>link.endsWith('합'))||row.links.find(link=>link.endsWith('합'));
    const change=source.find(link=>/[충형파해]$/.test(link))||row.links.find(link=>/[충형파해]$/.test(link));
    const describeLink=link=>{
      const [,slot,glyph,period,visitor,kind]=link.match(/^(\S+) (\S+)·(\S+) (\S+) (\S+)$/u);
      const label=period.slice(0,-1)+(period.endsWith('지')?' 지지':' 천간');
      const place=slotNames[slot]+'('+glyph+')'+(slot.endsWith('지')?'와 ':'과 ')+label+'('+visitor+')';
      return place+' 사이의 '+relationNames[kind]+' 관계';
    };
    const anchor=main.includes(connection)?connection:main.includes(change)?change:connection||change;
    const nearby=row.affinity>0;
    const changing=row.adjustment>0;
    const signal=nearby&&changing?theme.mixed:nearby?theme.open:changing?theme.turn:row.reading;
    const basis=anchor?describeLink(anchor)+'부터 살펴봐요.' : row.groups.length?row.groups.join(' · ')+'으로 세 글자가 모이는 흐름을 살펴봐요.':row.pair+'에서 천간의 '+row.top+', 지지의 '+row.hidden+'을 중심으로 읽어요.';
    const direction=main.includes(anchor)?(career?'일하는 환경을 읽는 월주에서 직접 잡히는 단서예요.':'가까운 관계의 방식을 읽는 일지에서 직접 잡히는 단서예요.'):(career?'일터의 변화는 이 자리의 맥락을 거쳐 읽어요.':'가까운 관계에 미치는 영향은 이 자리의 맥락을 거쳐 읽어요.');
    const changeDetail=change?describeLink(change)+'에서는 '+changeMeanings[change.at(-1)]+' 흐름을 읽어요.':'확인된 자리에서 뚜렷한 충돌 단서는 약해요.';
    return {
      signal,basis:anchor?basis+' '+direction:basis,
      opportunity:(nearby?theme.opportunity:changing?theme.change:theme.quiet)+' '+row.top+'은 '+row.reading+'으로 읽어요.',
      caution:changeDetail+(changing&&nearby?' '+theme.change:''),
    };
  }
  const countPairs=links=>new Set(links.map(link=>link.match(/([甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥])·[^ ]+ ([甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥])/u)?.slice(1).sort().join('')||link)).size;
  const ms=stamp=>Date.parse(stamp.replace(' ','T')+'+08:00');
  const kst=t=>new Date(t+9*3600000).toISOString().slice(0,19).replace('T',' ')+' KST';
  const engine=(Solar,t)=>{
    const date=new Date(t+8*3600000).toISOString().slice(0,19);
    return Solar.fromYmdHms(...date.split(/[-T:]/).map(Number));
  };
  const asTime=(y,m)=>Date.UTC(y,m,1)-9*3600000;
  // Editorial relevance to a question, not a probability. Competing signals
  // keep their own directions. Multiple names for one pair never add points.
  const questions={
    seohwa:{open:'인연과 관계 발전',change:'관계의 전환'},
    ijun:{open:'지난 인연 재검토',fresh:'새 인연의 접점',change:'관계의 전환'},
    mujin:{open:'직업 기회와 성장',change:'이직·역할 변화',pressure:'책임과 부담'}
  };
  function assess(row,topic){
    const career=topic==='mujin';
    const position=career?
      {월지:9,월간:8,일지:5,일간:5,대운지:6,대운간:4,세운지:4,세운간:3,연지:3,연간:3,시지:2,시간:2}:
      {일지:10,일간:7,월지:6,월간:4,대운지:4,대운간:3,세운지:3,세운간:2,연지:3,연간:2,시지:2,시간:2};
    const all=[...row.links,...row.annualLinks,...row.cycles.flatMap(c=>c.links)];
    const buckets=new Map();
    for(const fact of new Set(all)){
      const key=fact.slice(0,fact.lastIndexOf(' '));
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(fact);
    }
    const powers={육합:4,천간합:3,충:4,형:2,파:1,해:1};
    const signals=[];
    for(const [pair,facts] of buckets){
      const slot=pair.split(' ')[0],glyph=pair.split(' ')[1][0];
      const pairWeight=position[slot]||0;
      const layer=slot.startsWith('대운')?'cycle':slot.startsWith('세운')?'annual':'natal';
      for(const fact of facts){
        const kind=fact.slice(pair.length+1);
        const bond=kind.endsWith('합');
        const echo=all.some(other=>other!==fact&&other.endsWith(' '+kind)&&other.includes(' '+glyph+'·')&&
          (layer==='natal'?/^(대운|세운)/u.test(other):row.links.includes(other)));
        const cycle=row.cycles.find(c=>c.links.includes(fact));
        const partial=cycle&&row.cycles.length>1;
        const rooted=cycle?.natalLinks?.some(link=>link.startsWith(career?'월지 ':'일지 '))||false;
        const annualTie=cycle?.annualLinks?.some(link=>link.endsWith(' 충')||link.endsWith(' 육합'))||false;
        const weight=pairWeight+powers[kind]+Number(echo||rooted)+Number(rooted&&annualTie)-Number(Boolean(partial));
        signals.push({fact,pair,slot,kind,bond,weight,layer,trace:{position:pairWeight,relation:powers[kind],echo,rooted,annualTie,partial:Boolean(partial)}});
      }
    }
    for(const fact of row.groups)signals.push({fact,pair:fact,slot:'원국',kind:fact.slice(-2),bond:true,layer:'natal',weight:7,trace:{completeGroup:true}});
    const godFact=row.pair+' 월운의 '+row.top+'·'+row.hidden;
    const workStar=[row.top,row.hidden].some(g=>['정관','편관','식신','상관','정인','편인'].includes(g));
    signals.push({fact:godFact,pair:godFact,slot:'십성',kind:'십성',layer:'stars',weight:career&&workStar?6:3,trace:{top:row.top,hidden:row.hidden}});
    const sorted=signals.sort((a,b)=>b.weight-a.weight||Number(b.layer==='natal')-Number(a.layer==='natal')||a.fact.localeCompare(b.fact,'ko'));
    const axes={};
    for(const key of Object.keys(questions[topic])){
      const choices=[];
      for(const s of sorted){
        const personal=s.layer==='natal',star=s.layer==='stars';
        let bonus=0;
        if(key==='change'){
          if(star||s.bond)continue;
        }else if(key==='pressure'){
          const urgent=[row.top,row.hidden].includes('편관');
          const friction=s.slot==='월지'&&['형','해','파'].includes(s.kind);
          if(s.bond||!urgent&&!friction)continue;
          bonus=(row.top==='편관'?4:urgent?2:0)+Number(friction);
        }else if(key==='fresh'){
          if(!s.bond||!personal||!['연지','월지','일지','원국','연간','월간'].includes(s.slot))continue;
          bonus=['연지','월지','원국'].includes(s.slot)?5:0;
        }else if(topic==='ijun'){
          if(!personal||!['일지','일간','월지'].includes(s.slot))continue;
          bonus=s.slot==='일지'?3:0;
        }else if(!s.bond&&!(career&&star&&workStar))continue;
        choices.push({score:s.weight+bonus,fact:s.fact});
      }
      choices.sort((a,b)=>b.score-a.score);
      axes[key]=choices[0]||{score:0,fact:''};
    }
    const main=sorted[0],usedPairs=new Set([main.pair]),support=[];
    for(const s of sorted){
      if(usedPairs.has(s.pair)||s.weight<5)continue;
      usedPairs.add(s.pair);support.push(s.fact);
      if(support.length===2)break;
    }
    return {main,support,axes,candidates:sorted};
  }
  function calc(Solar,util,pillars,birth,profile,topic,{legacyRanking=false,rankVersion=8}={}){
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
      return {pair,top:names[top],hidden:names[hidden],reading:(career?work:topic==='ijun'?reunion:meanings)[top],links,groups,
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
    for(const row of calendar){
      row.insight=describe(row,topic);
      row.annualLinks=interactions.between('세운',row.annual,'월운',row.pair);
      row.cycles=cycles.filter(c=>c.from<row.end&&c.until>row.start).map(c=>({
        pair:c.pair,
        from:kst(Math.max(c.from,row.start)),until:kst(Math.min(c.until,row.end)),
        natalLinks:interactions.toPeriod(pillars,'대운',c.pair),annualLinks:interactions.between('대운',c.pair,'세운',row.annual),
        links:interactions.between('대운',c.pair,'월운',row.pair)
      }));
    }
    for(const row of calendar)row.assessment=assess(row,topic);
    for(const row of years)row.insight=describe(row,topic);
    const compare=key=>(a,b)=>priority(b,key,career)-priority(a,key,career)||b[key]-a[key];
    const ranked=(rows,key)=>{
      const sort=compare(key);
      const ordered=rows.filter(row=>row[key]>0).sort(sort);
      const cutoff=ordered[2];
      return cutoff?ordered.filter(row=>sort(row,cutoff)<=0):ordered;
    };
    const horizons=[3,5,10].map(length=>{
      const rows=years.slice(0,length);
      return {length,from:rows[0].year,through:rows.at(-1).year,
        opportunity:ranked(rows,'affinity').slice(0,2).map(row=>row.year),
        attention:ranked(rows,'adjustment').slice(0,2).map(row=>row.year),
        transitions:rows.filter(row=>row.cycles.some(c=>c.transition)).map(row=>row.year)};
    });
    const priorPair=engine(Solar,ms(getTerms(YEAR-1)['立春'].toYmdHms())+1000).getLunar().getYearInGanZhiExact();
    const monthly=key=>legacyRanking?calendar.filter(row=>row[key]>0).sort((a,b)=>b[key]-a[key]).slice(0,3):ranked(calendar,key);
    const highlights=Object.entries(questions[topic]).map(([key,label])=>({key,label,rows:calendar
      .filter(r=>r.assessment.axes[key].score>0)
      .sort((a,b)=>b.assessment.axes[key].score-a.assessment.axes[key].score||a.month-b.month).slice(0,3)}));
    const current=!legacyRanking&&rankVersion>=8;
    return {calendar,years,horizons,legacyRanking,currentRanking:current,highlights,prior:stage(priorPair,'세운'),
      opportunity:current?highlights.find(h=>h.key==='open').rows:monthly('affinity'),
      attention:current?highlights.find(h=>h.key==='change').rows:monthly('adjustment')};
  }
  return {calc};
});
