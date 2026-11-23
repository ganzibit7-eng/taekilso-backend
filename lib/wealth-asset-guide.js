'use strict';

const readings={
  steady:{
    priority:'부동산의 장기 보유 조건을 먼저 살펴봐요',
    stocks:'급한 시세보다 기업의 실적이 꾸준히 이어지는지 차분하게 비교할 때 판단이 선명해져요.',
    property:'정재의 꾸준함이 잘 드러나는 쪽이에요. 긴 기간에 걸쳐 유지할 수 있는 자산인지, 보유 부담을 감당할 수 있는지가 핵심이에요.',
    crypto:'규칙이 자주 바뀌고 변동 폭이 큰 환경에서는 내 장점인 꾸준한 기준을 지키기 어려워요. 급한 추격과 빚을 더하는 거래를 특히 경계해요.'
  },
  flexible:{
    priority:'주식은 살펴볼 여지가 있고, 빠른 추격을 특히 조심해요',
    stocks:'편재는 평소 보지 않던 기회를 알아보는 감각으로 읽어요. 여러 기업을 비교하고 처음 보였던 장점이 지금도 남아 있는지 살펴보는 방식이 어울려요.',
    property:'새 매물이 눈에 잘 들어와도, 나중에 조건을 바꾸기 어려운 자산이에요. 처음 눈길을 끈 장점이 오래 보유할 이유인지 따로 살펴봐요.',
    crypto:'새 기회를 알아보는 감각이 가격 변화에 빠르게 반응하는 습관으로도 이어질 수 있어요. 급등을 뒤쫓거나 한곳에 몰아넣는 선택을 특히 조심해요.'
  },
  craft:{
    priority:'스스로 이해하고 설명할 수 있는 분야부터 살펴봐요',
    stocks:'식상은 익힌 것을 결과로 바꾸는 기운으로 읽어요. 평소 알아온 업종에서 돈이 생기는 구조를 설명할 수 있을 때 판단이 또렷해져요.',
    property:'직접 살펴보고 고칠 부분을 알아볼 수 있는 환경에서 장점이 살아나요. 막연히 오를 것이라는 기대만 있는 매물에는 같은 장점이 작동하기 어려워요.',
    crypto:'새 기술을 알아보는 재미와 그 자산의 가치를 판단할 근거를 구분해요. 설명이 어려운 구조나 과장된 수익 약속은 특히 피하는 쪽으로 읽어요.'
  },
  basis:{
    priority:'세 자산 중 하나를 앞세우기보다 돈을 오래 묶는 선택부터 살펴봐요',
    stocks:'확인된 원국만으로 우선할 자산을 가르기 어려워요. 직접 이해하는 범위와 언제 돈을 써야 하는지를 기준으로 두면 판단이 쉬워요.',
    property:'한 번에 큰돈이 오래 묶일 때 선택의 폭이 좁아져요. 계약을 되돌리기 어렵다는 점을 먼저 살펴요.',
    crypto:'판단을 급하게 바꾸게 만드는 큰 변동과 빚을 더한 거래는 특히 주의할 쪽이에요.'
  }
};

function wealthAssetGuide(calendar) {
  const route=calendar?.judgment?.route;
  const reading=readings[route?.key];
  if(!reading||!route.basis)return null;
  const risk=calendar.judgment.timing?.find(item=>item.kind==='risk');
  const peer=calendar.natal?.find(pillar=>pillar.visible==='겁재'||pillar.hidden?.[0]==='겁재');
  let peerNote='';
  if(peer){
    const where=peer.visible==='겁재'?'의 겉 글자':' 지지의 주된 기운';
    peerNote=' '+peer.position+where+'에서 겁재가 보여, 가까운 사람과 돈을 섞거나 권유를 따라가는 상황도 따로 주의해요.';
  }
  return {
    priority:reading.priority,basis:route.basis,
    assets:[
      {label:'주식',reading:reading.stocks},
      {label:'부동산',reading:reading.property},
      {label:'가상자산',reading:reading.crypto+peerNote}
    ],
    ...(risk&&{risk:{title:risk.title,basis:risk.basis,reading:'급한 소식이나 제안에 평소 정해 둔 기준이 흔들리기 쉬운 때로 읽어요.'}})
  };
}

module.exports=wealthAssetGuide;
