/* Seohwa's free chapter uses the same Korean civil-time pillar rules on both sides. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TaekilSeohwaReading=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='seohwa-relationship-v1';
  const clock=typeof module==='object'&&module.exports?require('./birth-time-range'):globalThis.TaekilBirthTime;
  const PRICE=5900;
  const NAME='서화 연애 리포트 + 상담 3회';
  const chapters=[
    '연락이 와도 서운함이 남는 이유',
    '좋아하는 사람 앞에서 편안해지는 조건',
    '내가 늘 먼저 챙기는 관계',
    '마음을 전하기 좋은 순간과 첫 문장',
    '돌아온 답을 듣고 다음을 판단하는 법'
  ];
  const guide=[
    '오늘 있었던 일과 오래 쌓인 마음을 가려내요.',
    '내가 기다리던 한마디와 안심할 수 있는 행동을 살펴봐요.',
    '관계에서 내가 먼저 하던 일 하나를 나눠요.',
    '지금 상황에 맞는 말과 그 말을 건넬 때를 살펴봐요.',
    '어떤 답이라면 이어가 볼지 기준을 정해요.'
  ];
  const stories=[
    {label:'연락을 기다릴 때',title:'기다리는 동안 내 마음이 먼저 찾는 것',highlight:'답장이 오면 무엇 때문에 마음이 놓이는지 봐요.',
      situation:'저녁에 보기로 했는데 오후에 보낸 메시지에 답이 없어요. 약속이 그대로인지 궁금하다가, 한참 기다리다 보면 내가 그만큼 중요하지 않은 건가 하는 생각으로 옮겨갈 수 있어요.',
      contrast:'늦어진다고 알려준 짧은 연락에 바로 마음이 놓인다면, 내 일정을 다시 정할 수 있도록 한 줄 미리 알려달라는 부탁부터 해봐요. 일정이 정리돼도 마음이 무겁다면 내가 늘 먼저 확인해야 한다고 느낀 순간이 있었는지 살펴볼 수 있어요.',
      line:'우리 오늘 저녁에 만나는 거 맞아요? 늦을 것 같으면 미리 알려줘요.'},
    {label:'다툰 뒤 먼저 말하기 어려울 때',title:'쉬자는 말 뒤에 언제 다시 만날지',highlight:'잠시 쉬기로 했다면 다시 이야기할 때도 정해요.',
      situation:'한 사람은 감정을 가라앉힌 뒤 더 잘 말할 생각으로 잠깐 쉬자고 해요. 듣는 사람에게는 이 이야기를 다시 꺼내면 사이가 나빠질 수 있다는 말처럼 들릴 수 있지요.',
      contrast:'정한 시간에 다시 돌아와 서로 이야기를 들을 수 있다면 쉬는 시간은 대화를 가다듬는 일이 돼요. 쉬자는 말 뒤 누가 먼저 돌아올지 계속 모호하다면 다음에 꺼낼 이야기 하나와 돌아올 때를 같이 정해봐요.',
      line:'잠깐 쉬어도 괜찮아요. 우리 언제 다시 얘기할까요? 아까 서운했던 얘기는 마저 하고 싶어요.'},
    {label:'서운함을 쌓아뒀다가 말할 때',title:'참아둔 마음이 뒤늦게 말을 얻을 때',highlight:'작게 마음에 걸렸을 때 한 장면만 먼저 꺼내요.',
      situation:'사소한 일이라 넘기려다가 비슷한 일이 생기는 날 그동안 삼킨 말까지 한꺼번에 나올 수 있어요. 상대는 오늘 일만 이야기하려다 갑자기 예전 일까지 나온 이유를 모를 수 있고, 나는 이제야 중요한 말을 꺼냈다고 느껴요.',
      contrast:'좋아하는 마음을 지키고 싶어 한 번 넘긴 일도 다음에 여전히 받아들일 수 있는 일인지 가만히 살펴봐요. 덜 서운할 때 작은 부분을 말해두면, 두 사람이 당시 그 장면을 어떻게 받아들였는지 들을 여지가 생겨요.',
      line:'지난번엔 그냥 넘겼는데, 비슷한 일이 또 생기니까 마음에 걸려요. 지금 있었던 일부터 같이 얘기해 볼래요?'}
  ];
  const symbols={
    '比肩':['비견','peer','스스로 납득하고 고른 방식에 마음을 붙이는 힘'],
    '劫财':['겁재','peer','가까운 사람과 내 몫의 경계에서 흔들리기도 하는 결'],
    '食神':['식신','expression','편안한 말과 작은 행동을 꾸준히 쌓는 힘'],
    '伤官':['상관','expression','마음을 날카롭게 포착하고 솔직히 말하는 힘'],
    '正财':['정재','practical','가까운 사람의 마음을 생활 속 행동에서 느끼는 결'],
    '偏财':['편재','practical','상황에 맞는 방식으로 손을 내밀고 돌보는 힘'],
    '正官':['정관','trust','지키기로 한 말이 실제 행동과 맞을 때 마음이 놓이는 결'],
    '七杀':['편관','trust','흔들릴 때 서둘러 답을 정하고 싶어지는 결'],
    '正印':['정인','support','마음을 받아주는 익숙한 토대에서 다시 힘을 얻는 결'],
    '偏印':['편인','support','남이 지나친 말의 뜻에 오래 귀를 기울이는 결']
  };
  const patterns={
    peer:'스스로 납득할 시간이 있을 때 한 사람에게 마음을 오래 내주는 편으로 읽혀요. 마음이 급한 날에는 상대에게도 빨리 대답을 바라다가, 막상 내가 답할 차례가 되면 잠깐 생각하고 싶어질 수 있어요. 먼저 말을 꺼내기 좋은 때와 둘이 같이 확인해야 할 일을 가려보세요.',
    expression:'마음을 숨기지 않고 말할 수 있을 때 정이 깊어지는 결이에요. 마음이 급해지면 서운했던 한 장면에서 관계 전체 이야기로 말이 넓어지기 쉬워요. 오래 남은 표정이나 말 한마디부터 꺼내면 상대가 그 순간을 어떻게 기억하는지도 들을 수 있어요.',
    practical:'작은 배려가 실제 행동으로 이어질 때 마음이 놓이는 결이에요. 내가 편하게 여기는 관계에서는 약속을 앞두고 한 사람만 시간을 비우거나, 먼저 챙기거나, 계속 방법을 바꿀 필요가 줄어들어요. 서로 마음을 알아볼 수 있는 행동 하나부터 함께 골라봐요.',
    trust:'서로 하겠다고 한 말이 일상에서 쌓일 때 마음이 붙는 결이에요. 약속이 달라지는 일도 일찍 들으면 가벼워질 수 있어요. 나중에야 사정을 알게 되는 일에 마음이 오래 걸린다면 두 사람 모두 지킬 수 있는 한 가지를 다음 약속에 먼저 넣어봐요.',
    support:'끝까지 들어주는 사람에게 마음을 내주기 쉬운 결이에요. 어느 정도 안전하다고 느껴야 마음속 이야기가 나와요. 해답을 나누기 전에 먼저 하고 싶었던 말을 들어보는 시간이 있으면 내게 필요한 답을 스스로 가려볼 수 있어요.'
  };
  const scenes=[
    ['한참 뒤에 “이제 봤어”라는 답이 와요.', '다음 약속도 내가 먼저 날짜를 꺼내요.'],
    ['다툰 다음 날 상대가 평소처럼 연락해요.', '다시 대화하자는 말을 꺼내는 쪽이 늘 나인 것처럼 느껴져요.'],
    ['참았던 이야기를 겨우 꺼냈는데 “그랬구나” 하고 대화가 끝나요.', '마음에 걸리는 일을 그냥 넘길지, 말하고 조율할지 또 혼자 고민해요.']
  ];
  const snippets={
    peer:['내가 납득할 만한 설명까지 듣고 나서야 마음이 따라오는 결로 읽혀요. 왜 그랬는지 이유를 듣고 싶은 건지, 앞으로 어떻게 할지 함께 정하고 싶은 건지 먼저 가려봐요.','내가 먼저 움직이는 편이 자연스럽더라도, 계속 내가 답을 정하는 순간부터는 둘이 고르는 즐거움이 줄 수 있어요. 한 번은 내가 기준을 말하고, 구체적인 제안은 상대가 해볼 수 있는지 살펴봐요.'],
    expression:['감정을 말로 나누며 풀리는 결이 보여요. 내가 서운했던 한 장면을 서로 다르게 이해하고 있다면, 대화가 이어져도 그 장면만 계속 마음에 남을 수 있어요.','마음을 알아차리는 순간 말이 먼저 나오는 결로 읽혀요. 말을 꺼낸 뒤 곧바로 해결책까지 내가 정하고 있다면, 다음에는 상대가 생각해 볼 질문 하나를 남겨봐요.'],
    practical:['말보다 그다음 작은 행동을 보고 마음을 놓는 결이에요. 반가운 답을 받았을 때도 내 일정이나 기다린 시간에 달라지는 게 없다면, 서운함이 남는 이유가 거기 있을 수 있어요.','가까운 사람을 위해 작은 일을 챙기는 데 손이 빠른 결로 읽혀요. 정성을 덜 쏟으려고 하기보다, 내가 먼저 챙기지 않아도 상대가 맡을 수 있는 일을 골라봐요.'],
    trust:['한 번 안심시키는 말보다 비슷한 상황에서 다시 지켜지는 약속이 크게 다가오는 결이에요. 서운함이 남는다면 오늘 답 하나와 지금까지 함께 지켜온 말을 구분해 봐요.','같이 정한 말을 실제로 지키는지에 마음이 가는 결이에요. “앞으로 잘하자”는 넓은 약속보다, 다음에 누가 언제 먼저 확인할지 하나만 맞춰 봐요.'],
    support:['같은 답이라도 내 마음을 들어준 뒤에 건넨 말인지에 따라 다르게 들리는 결로 읽혀요. 설명은 이미 충분한데도 편해지지 않는다면, 내가 무슨 말을 먼저 듣고 싶었는지 돌아봐요.','상대가 어려워하는 이야기를 눈치채고 기다려주는 게 편한 결이에요. 다만 내 마음도 먼저 살펴봐 주길 바란다면, 이번에는 어떤 질문을 듣고 싶었는지 한마디만 먼저 건네봐요.']
  };
  function excerpts(context,choice){
    const a=context.readings[0], b=context.readings[1]||a;
    return [
      {index:0,basisId:a.id,text:scenes[choice][0]+' '+snippets[a.family][0]},
      {index:2,basisId:b.id,text:scenes[choice][1]+' '+snippets[b.family][1]}
    ];
  }
  function timeSlots(birth,hour,Solar,LunarUtil){
    const [y,m,d]=birth.split('-').map(Number);
    const day=Solar.fromYmdHms(y,m,d,12,0,0).getLunar().getEightChar();
    day.setSect(2);
    const dayGan=day.getDayGan();
    const selected=clock.range(hour);
    const known=Boolean(selected)||/^(?:[01]?\d|2[0-3])$/.test(String(hour));
    const candidates=[];
    const samples=clock.samples(known?hour:'unknown');
    for(const [index,minute] of samples.entries()){
      const before=new Date(Date.UTC(y,m-1,d,0,minute-60,index%2===1?59:0));
      const local=Solar.fromYmdHms(y,m,d,selected?.pillarHour??Math.floor(minute/60),selected?0:minute%60,0).getLunar().getEightChar();
      local.setSect(2);
      const civil=Solar.fromYmdHms(before.getUTCFullYear(),before.getUTCMonth()+1,before.getUTCDate(),before.getUTCHours(),before.getUTCMinutes(),before.getUTCSeconds()).getLunar().getEightChar();
      civil.setSect(2);
      candidates.push([
        record(civil,'Month','월'),record(civil,'Year','연'),record(day,'Day','일'),
        known?record(local,'Time','시'):null
      ]);
    }
    function record(chart,slot,label){
      const ganZhi=chart['get'+slot]();
      const hidden=chart['get'+slot+'HideGan']();
      return {ganZhi,label,entries:[
        ...(slot==='Day'?[]:[[ganZhi[0],label+'간']]),
        ...hidden.map(s=>[s,label+'지 지장간 '+s])
      ].map(([stem,location])=>({location,god:LunarUtil.SHI_SHEN[dayGan+stem]}))};
    }
    const readings=[];
    for(const [i,slot]of candidates[0].entries()){
      if(!slot || !candidates.every(c=>JSON.stringify(c[i])===JSON.stringify(slot)))continue;
      for(const entry of slot.entries){
        const value=symbols[entry.god];
        if(!value || readings.some(r=>r.family===value[1]))continue;
        readings.push({id:'s'+(readings.length+1),location:entry.location,natal:slot.ganZhi,term:value[0],family:value[1],meaning:value[2]});
        if(readings.length===2)break;
      }
      if(readings.length===2)break;
    }
    return {day:day.getDay(),known,readings};
  }
  function first(context,choice){
    const story=stories[choice],a=context.readings[0];
    if(!story||!a)throw Error('공통으로 확인되는 사주가 부족해요. 출생 정보를 확인해 주세요.');
    return {title:story.title,highlight:story.highlight,sections:[
      {title:'사주에서 먼저 읽힌 점',text:patterns[a.family]},
      {title:story.label,text:story.situation+'\n'+story.contrast},
      {title:'먼저 건네볼 한마디',text:story.line,quote:true}
    ],basis:[a],question:story.line};
  }
  return {VERSION,PRICE,NAME,chapters,guide,stories,timeSlots,first,excerpts};
});
