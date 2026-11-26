'use strict';
const retention = require('./report-retention');
const reportCoupon = require('./report-coupon-grant');
const {randomUUID} = require('node:crypto');
const {Solar,LunarUtil} = require('lunar-javascript');
const account = require('./account-report');
const {normalizeProfile} = require('./newyear-calculation');
const {isPaidOrder,isRefunded} = require('./payment-entitlements');
const consent = require('./ai-transfer-consent');
const provider = require('./consultation-provider');
const topicContent=require('./topic-report-content');
const reportPeriods=require('./relationship-report-periods');
const {buildCalendar,version:calendarVersion} = require('./wealth-report-calendar');
const wealthAssetGuide = require('./wealth-asset-guide');
const wealthRecovery = require('./wealth-chapter-recovery');
const {languageGuidance,spokenProse,needsLanguageRepair} = require('./consultation-personas');

const COUNT = 3;
const BUSY_MS = 165000;
const failure = account.failure;
const chapterPreferences={
  seohwa:{1:['support','practical'],3:['expression','trust'],4:['trust','peer']},
  dogyeom:{1:['practical','trust'],3:['trust','peer'],4:['support','practical']},
  ijun:{1:['trust','practical'],3:['expression','peer'],4:['support','trust']},
  mujin:{1:['support','expression'],3:['trust','peer'],4:['practical','peer']}
};
const pillarLabels={연:'태어난 해',월:'태어난 달',일:'태어난 날',시:'태어난 시간'};

function createReport(reading) {
  const legacy=reading.id==='seohwa';
  const wealth=reading.id==='dogyeom';
  const topic=topicContent.topics[reading.id];
  const prefix=legacy?'SEOHWA':'FEATURED_REPORT';
  const required=legacy?'SEOHWA_REPORT_REQUIRED':'FEATURED_REPORT_REQUIRED';
  function validate(input) {
    if (!Number.isInteger(input?.choice) || !reading.stories[input.choice]) {
      throw failure(400,'INVALID_'+prefix+'_PROFILE','리포트에서 살펴볼 고민을 다시 골라 주세요.');
    }
    let p;
    try { p=normalizeProfile(input.profile); }
    catch { throw failure(400,'INVALID_'+prefix+'_PROFILE','생년월일과 출생시간을 다시 확인해 주세요.'); }
    const today=new Date(Date.now()+9*3600000);
    const cutoff=new Date(Date.UTC(today.getUTCFullYear()-14,today.getUTCMonth(),today.getUTCDate()));
    if(p.date>cutoff.toISOString().slice(0,10)) throw failure(400,'INVALID_'+prefix+'_PROFILE','만 14세 미만의 출생 정보는 사용할 수 없어요.');
    const {y,m,d,calType,isLeap,hourValue,gender}=p;
    return {profile:{y,m,d,calType,isLeap,hourValue,gender},choice:input.choice};
  }

  function calculate({profile,choice}) {
    const context=reading.timeSlots(normalizeProfile(profile).date,profile.hourValue,Solar,LunarUtil);
    return {version:reading.VERSION,profile,choice,context,
      ...(topic&&{topicVersion:4}),first:topic?topicContent.first(reading,context,choice):reading.first(context,choice),
      excerpts:topic?[]:reading.excerpts(context,choice),
      ...(wealth&&{calendar:buildCalendar(profile,context.pillars)})};
  }

  function currentCalendar(seed) {
    if(!wealth)return null;
    const saved=seed.calendar;
    const usable=saved?.version===calendarVersion ||
      (seed.body && [3,4,5,6].includes(saved?.version) && saved.ranking && saved.outlook);
    const calendar=usable?saved:buildCalendar(seed.profile,seed.context.pillars||{day:seed.context.day});
    const assetGuide=wealthAssetGuide(calendar);
    return assetGuide?{...calendar,assetGuide}:calendar;
  }

  const CONFIG={
    product:'taekilso_'+reading.id+'_story_report',price:reading.PRICE,name:reading.NAME,
    acceptedPrices:wealth?[reading.PRICE,8900]:[reading.PRICE],
    requirePriceConfirmation:wealth,
    payAppNames:legacy?['서화 연애 리포트 상담 3회','서화 연애 리포트   상담 3회']:[],
    collection:reading.id+'Reports',orderKey:legacy?'seohwaReportId':'featuredReportId',validate,calculate,storyReport:true,
    present:()=>null
  };
  const left=data=>Math.max(0,COUNT-(Number(data.questionsUsed)||0));

  async function paidReport(db,uid,id,tx,adminAccess=false) {
    if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)) throw failure(400,'INVALID_REPORT','리포트를 다시 열어 주세요.');
    const get=ref=>tx?tx.get(ref):ref.get();
    const userRef=db.collection('users').doc(uid);
    const ref=userRef.collection(CONFIG.collection).doc(id);
    const data=(await get(ref)).data();
    const adminGrant=data?.adminGrant===true;
    if(!data?.ready||(adminGrant?adminAccess!==true:!data.paidOrderId&&!data.couponGrantId)) {
      throw failure(403,required,'이 계정에서 열린 리포트를 확인하지 못했어요.');
    }
    if(retention.expired(data)) throw failure(410,'REPORT_EXPIRED','리포트의 1년 보관 기간이 끝났어요.');
    if(adminGrant)return {ref,data};
    if(data.couponGrantId){
      if(!await reportCoupon.verifyUsed(userRef,data.couponGrantId,CONFIG.product,id,get,Date.now())){
        throw failure(403,required,'이 계정의 리포트 쿠폰 사용 내역을 확인하지 못했어요.');
      }
      return {ref,data};
    }
    const order=(await get(db.collection('paymentOrders').doc(data.paidOrderId))).data();
    if(!isPaidOrder(order,uid)||order.entitlementGranted!==true||order.product!==CONFIG.product||
       !CONFIG.acceptedPrices.includes(order.amount)||order[CONFIG.orderKey]!==id) {
      throw failure(403,required,'리포트 결제 상태를 확인하지 못했어요.');
    }
    return {ref,data};
  }

  function view(id,data,now=Date.now()) {
    const access={...(data.adminGrant===true&&{adminPreview:true}),...retention.display(data)};
    if(!data.report.body){
      if(data.attemptId&&now-data.attemptAtMs<BUSY_MS) return {id,state:'generating',startedAtMs:data.attemptAtMs,...access};
      return {id,state:'paid',...access};
    }
    const {first,body,choice,profile,context,topicVersion}=data.report;
    const line=reading.stories[choice].line;
    const updatedFirst={...first,question:line,sections:first.sections.map(section=>section.quote?{...section,text:line}:section)};
    const calendar=currentCalendar(data.report);
    return {id,state:'ready',report:{first:updatedFirst,body,choice,profile,day:context.day,known:context.known,pillars:context.pillars,
      ...(calendar&&{calendar}),...(topicVersion&&{topicVersion})},questionsLeft:left(data),...access};
  }

  const tool=legacy?'write_seohwa_report':'write_featured_report';
  const paragraph={type:'string'};
  const schema={type:'object',additionalProperties:false,required:['chapters'],properties:{
    chapters:{type:'array',items:{type:'object',additionalProperties:false,required:['highlight','paragraphs','basisId'],
      properties:{highlight:paragraph,paragraphs:{type:'array',items:paragraph},basisId:paragraph}}}
  }};
  const instructions=`택일소 ${reading.title}의 본편을 이어서 써요. ${reading.voice||'서화는 부드럽고 분명한 해요체로 말해요.'} 독자 호칭은 생략해요.
  제공된 목차 순서로 다섯 장을 써요. 각 장은 한 문장 핵심, 3~4개 문단, 실제 사주 근거 ID 하나를 제출해요.
  각 장의 새 본문은 한국어 공백 포함 850~970자를 목표로 쓰고, 다섯 장에 걸쳐 설명을 균등하게 펼쳐요. 길이는 같은 조언을 고쳐 쓰지 않고 상황과 판단의 차이를 자세히 보여 주며 채워요. 핵심과 본문은 일반 텍스트예요.
  첫 장의 핵심을 되풀이하지 않고 후속 장마다 다른 장면과 갈림길을 펼쳐요. 일부 장의 첫 문단은 이미 무료로 제공됐어요. 해당 장은 firstParagraph 뒤를 바로 이어 쓰고 firstParagraph를 반복하지 않아요. 각 장의 requiredBasis에 지정한 근거를 사용하고, 근거가 같은 장에서는 서로 다른 행동과 갈림길에 초점을 맞춰요.
  제공된 고민은 사용자가 선택한 관심사예요. 실제 일이나 성격으로 단정하지 말고 선택한 상황에서 계산 근거가 어떻게 다르게 나타나는지 조곤조곤 풀어요.
  사주 용어를 나열하지 말고 근거 의미가 바뀌지 않게 일상어로 옮겨요. 다른 십성, 시기, 숫자 점수, 상대 사주·속마음, 발생이 확정된 사건을 만들지 않아요.
  상담사가 독자에게 직접 말하듯 자연스럽게 써요. 장마다 다른 행동 기준을 줘요. 대화 장은 실제로 건넬 말과 상대 반응별 선택지를 더 자세히 다뤄요.
  각 장의 한 문장 핵심에는 그 장에서 이 명식을 보고 먼저 고른 방향을 적어요. “기준을 정해요”, “조건을 확인해요”처럼 누구에게나 적용되는 말에서 멈추지 말고, 무엇을 더 중요하게 보는지까지 써요.
  첫 문단에서는 지정된 근거에서 읽은 경향을 생활의 한 장면과 연결해요. 주어진 상황에서 그 경향이 장점이 되는 경우와 부담으로 바뀌는 경우를 이어서 대비해요. 예를 들어 내 기준을 직접 세워야 힘이 나는 결과, 상대가 주는 반응을 들으며 힘이 나는 결과라면 같은 고민에서도 권하는 행동이 달라져야 해요.
  장의 마지막에는 입 밖으로 내볼 한 문장, 상대나 조건을 보고 갈라지는 두 선택, 또는 최근 겪은 일과 직접 대조할 질문 중 해당 장에 가장 맞는 하나를 줘요. 예시를 실제 경험처럼 단정하지 않아요. 확인된 계산 정보만 사용하고, 오행 개수나 십성 하나로 강약 또는 길흉을 확정하지 않아요.
  ${wealth?`첫 장의 대표 문장을 다시 설명하지 마세요. 2장은 이 사람의 재성이 천간에 드러나는지 지지 안에 숨어 있는지, 지난 세운과 달라진 점을 첫머리에 짚어요. 3장은 계절을 따라 움직이고, 4장은 순위에 든 달마다 다른 길을, 5장은 원국의 어느 자리가 흔들리는지를 풀어요. 6장의 cycles는 입춘부터 다음 입춘 전까지 실제로 겹치는 대운이에요. 한 해에 두 개면 전환 전후를 구별하고 월일을 추정하지 마세요. 삼합·방합은 세 글자가 모인 것이며 합화를 뜻하지 않아요. 장부·정산·공동비용·보상 조건의 비유는 쓰지 마세요. 선택한 상황을 전 장의 소재로 삼지 마세요. 원국 내부와 운의 관계는 internal과 relations의 계산 목록만 써요. 육합은 연결, 충은 변화, 형·파·해는 서로 맞물릴 때의 긴장으로 읽되 합화나 손실로 단정하지 마세요. 2장은 입춘 전 병오와 입춘 후 정미를 구별하고, 정미와 일지의 육합이 있으면 그 의미를 꼭 짚어요. 6장은 제공된 대운 구간과 세운의 관계를 대비하고 대운 미확인 시 세운만 풀어요. 연주·월주는 두 글자이고 연간·월간은 한 글자예요. 세운에서 상관과 정재가 보여도 원국에 정관이 있으면 자유로운 개선과 안정된 기준 사이의 긴장도 살펴요. 제공된 natal은 확인된 기둥의 겉 십성과 지장간 십성(첫 항목이 주기운)이에요. 빠진 기둥과 빈 대운은 미확인으로 두세요. 일간을 출발점으로 서로 다른 원국 단서 두 개가 재물을 얻고 남기는 성향에 어떻게 함께 작용하는지 분석해요. 각 장은 확인된 단서, 전통적인 뜻, 이 사람에게 읽히는 차이, 연운이나 월운이 바꾸는 부분 순으로 써요. 실무 조언은 필요할 때 한 문장만 써요. 사례로 문단을 채우지 마세요. 숫자는 순위와 확인된 연월만 사용하세요. 같은 대표 연도가 여러 기간에 걸치면 새로 포함된 연도 중 왜 앞선 해를 넘지 못했는지 짚어요. 확인된 과거 사실이나 직업은 없어요. 도겸은 계산값에서 무엇이 달라지는지부터 말해요. 직업·소득원은 입력되지 않았어요. 선택한 고민은 관심사예요. 견적, 고객, 거래처, 납기, 외주, 급여 등 직업적 장면을 전제로 삼지 마세요. 대화 예시나 실천 조언으로 마무리하는 형식은 재물운에서 생략해요.
  2장 총평은 전년과 올해의 십성이 어떻게 달라지고 원국의 어떤 성향을 건드리는지 설명해요. 상하반기를 비교하되 개별 월의 요령은 생략해요.
  4장은 기회 1위부터 달마다 해당 월의 basis 단서와 원국에서 확인된 단서를 짝지어, 무엇이 돈으로 이어질 여지가 커지는지 쉬운 말로 풀어요. 같은 재물 기회라도 반복 보상·새 기회·재능에 대한 인정처럼 성격이 어떻게 다른지 설명해요.
  5장은 주의 1위부터 달마다 판단·관계·변동 중 실제 근거가 가리키는 이유를 구분해요. 충은 변화 가능성, 비견과 겁재는 자기 결정과 공동 몫 등 의미를 풀고, 일어난 사건처럼 쓰지 마세요. 주의 점수가 낮으면 상대적 순위임을 밝혀요.
  2·4·5장에 정산일, 입금 시점, 지급 기한, 선지출, 비용을 먼저 부담하는 조언을 넣지 마세요. 관심사가 정산이어도 기한을 정하는 실무로 답하지 마세요. 일상 예시는 직업 없이도 성립하는 짧은 가정으로 써요. 전문 용어는 뜻을 바로 풀어요. 다른 시주·합충·대운을 추측하지 않아요. 기회 장에는 opportunities에 든 달만, 주의 장에는 expenses에 든 달만 써요. 6장은 계산된 장기 흐름에 집중해요. 투자 수익이나 손실은 확정하지 않아요.`:''}`;

  function planChapters(seed,evidence,judgment,topicPlan){
    const excerpts=wealth?[]:seed.excerpts;
    const openings=new Map(excerpts.map(excerpt=>[excerpt.index,excerpt]));
    const used=new Set(excerpts.map(excerpt=>excerpt.basisId));
    return (topicPlan||reading).chapters.map((title,index)=>{
      const opening=openings.get(index);
      const fresh=evidence.filter(item=>!used.has(item.id));
      const pool=fresh.length?fresh:evidence;
      const preferences=chapterPreferences[reading.id][index]||[];
      const modern=topicPlan&&reading.id!=='mujin';
      const preferred=preferences.map(family=>pool.find(item=>item.family===family)).find(Boolean);
      const direct=modern&&[0,2].includes(index)&&pool.find(item=>item.location==='일지');
      const freshAnnual=topicPlan&&index===0&&pool.find(item=>!seed.context.readings.slice(0,2).some(free=>free.id===item.id)&&(!modern||item.family!=='practical'));
      const basis=index===0?(freshAnnual||direct||preferred||pool[0]):(direct||preferred||pool[0]);
      const requiredBasis=opening?.basisId??basis.id;
      used.add(requiredBasis);
      return {title,aim:(topicPlan||reading).guide[index],requiredBasis,
        ...(judgment&&{wealthFocus:['연간 비교','월별 대비','수입 기회','지출 위험','장기 흐름'][index]}),
        ...(opening&&{firstParagraph:opening.text})};
    });
  }

  function unsupportedClaim(text,index,calendar,periods) {
    let prose=text;
    if(periods){
      if(/(?:연간|월간|일간|시간|연지|월지|일지|시지)\s*[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/.test(text))return true;
      if(/\d{1,3}\s*%|\d{1,2}월\s*\d{1,2}일|(?:반드시|무조건)\s*(?:재회|결혼|이별|취업|승진|합격)/.test(text))return true;
      if(!periods.years.some(y=>y.cycles.length)&&/대운(?:이|은|의|에서)?\s*(?:[甲乙丙丁戊己庚辛壬癸]|전환|바뀌)/.test(text))return true;
      const years=[2026,...periods.years.map(y=>y.year),3,5,10];
      prose=prose.replace(/(\d+)\s*(월|년)/g,(literal,num,unit)=>(unit==='월'?+num>=1&&+num<=12:years.includes(+num))?'':literal);
    }
    if(wealth&&calendar){
      if(/(?:연간|월간|일간|시간|연지|월지|일지|시지)\s*[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/.test(text))return true;
      const checkedRelations=[...(calendar.internal||[]),...(calendar.prior.relations||[]),
        ...calendar.rows.flatMap(r=>r.relations||[]),...calendar.outlook.years.flatMap(y=>[...(y.relations||[]),...(y.cycles||[]).flatMap(c=>c.relations)]),
        ...(calendar.daewoon?.cycles||[]).flatMap(c=>c.relations||[])];
      for(const claim of text.matchAll(/([子丑寅卯辰巳午未申酉戌亥])\s*[·・]?\s*([子丑寅卯辰巳午未申酉戌亥])\s*(육합|합|충|형|파|해)/g)){
        const [,a,b,type]=claim;
        if(!checkedRelations.some(f=>f.includes(a)&&f.includes(b)&&f.endsWith(type==='합'?'육합':type)))return true;
      }
      if(/정산 기준|정산일|공동비용|장부에|장부에서/.test(text))return true;
      const transitions=calendar.daewoon?.cycles.map(c=>c.from.slice(0,10))||[];
      for(const m of text.matchAll(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/g)){
        if(index!==4||!transitions.some(t=>(!m[1]||t.startsWith(m[1]+'-'))&&t.endsWith('-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'))))return true;
      }
      const years=[calendar.prior.year,...calendar.outlook.years.map(row=>row.year),3,5,10];
      const months=index===2?calendar.ranking.opportunity:index===3?calendar.ranking.expense:calendar.rows.map(row=>row.month);
      prose=prose.replace(/(\d+)\s*(월|년)/g,(literal,num,unit)=>(unit==='월'?months:years).includes(Number(num))?'':literal);
    }
    return /\d{1,4}\s*(?:점|월|년)|신강|신약|용신|격국/.test(prose);
  }
  function checked(output,evidence,plan,calendar,periods) {
    if(!Array.isArray(output?.chapters)||output.chapters.length!==reading.chapters.length) throw new Error('SEOHWA_CHAPTER_COUNT');
    const paragraphsSeen=new Set(plan.flatMap(chapter=>chapter.firstParagraph?[chapter.firstParagraph]:[]));
    const highlightsSeen=new Set();
    const polish=spokenProse();
    let length=0;
    function checkChapter(chapter,index){
      const {highlight,paragraphs,basisId}=chapter||{};
      const basis=evidence.find(item=>item.id===basisId);
      const chapterPlan=plan[index];
      if(!basis||basis.id!==chapterPlan.requiredBasis||typeof highlight!=='string'||highlight.trim().length<10||highlight.length>95||
         !Array.isArray(paragraphs)||paragraphs.length<3||paragraphs.length>5) throw new Error('SEOHWA_CHAPTER_FORMAT');
      const cleaned=paragraphs.map(text=>{
        if(typeof text!=='string'||text.trim().length<(wealth||periods?40:90)||text.length>650||/[<>]/.test(text)||
           unsupportedClaim(text,index,calendar,periods)||needsLanguageRepair(text)) throw new Error('SEOHWA_PARAGRAPH_FORMAT');
        const clean=polish(text.trim());
        if(paragraphsSeen.has(clean)) throw new Error('SEOHWA_PARAGRAPH_FORMAT');
        paragraphsSeen.add(clean);
        return clean;
      });
      if(/[<>]/.test(highlight)||unsupportedClaim(highlight,index,calendar,periods)||needsLanguageRepair(highlight)) throw new Error('SEOHWA_HIGHLIGHT_FORMAT');
      const point=polish(highlight.trim());
      if(highlightsSeen.has(point))throw new Error('SEOHWA_HIGHLIGHT_FORMAT');
      highlightsSeen.add(point);
      if(periods&&!cleaned[0].includes(basis.term))throw new Error('TOPIC_REPORT_BASIS_MISSING');
      const size=cleaned.join('').length;
      if(size<(wealth||periods?300:670)||size>1140) throw new Error('SEOHWA_CHAPTER_SIZE');
      if(chapterPlan.firstParagraph)cleaned.unshift(chapterPlan.firstParagraph);
      length+=cleaned.join('').length+point.length;
      return {title:chapterPlan.title,highlight:periods&&point.startsWith(chapterPlan.title+' — ')?point.slice(chapterPlan.title.length+3):point,paragraphs:cleaned,basis};
    }
    const items=output.chapters.map((chapter,index)=>{
      try{return checkChapter(chapter,index);}
      catch(error){error.chapterIndex=index;throw error;}
    });
    if(length<(wealth||periods?1700:4000)||length>5850) throw new Error('SEOHWA_REPORT_SIZE');
    return items;
  }

  async function write(seed,fetchImpl,env) {
    const calendar=currentCalendar(seed);
    const judgment=calendar?.judgment;
    const rankedDetail=kind=>calendar.ranking[kind].map(month=>{
      const {basis,ganZhi,score,expenseScore}=calendar.rows[month-1];
      return {month,basis,ganZhi,index:kind==='opportunity'?score:expenseScore};
    });
    const evidence=[...seed.context.readings,...(seed.context.supportingReadings||[])];
    const topicPlan=seed.topicVersion>=2?topic:null;
    const periods=topicPlan&&reportPeriods.calc(Solar,LunarUtil,seed.context.pillars,normalizeProfile(seed.profile).date,seed.profile,reading.id,{legacyRanking:seed.topicVersion<3,rankVersion:seed.topicVersion>=4?8:7});
    const chapterPlan=planChapters(seed,evidence,judgment,topicPlan);
    const compact=period=>[period.pair,period.top,period.hidden,period.links,period.groups];
    const timing=periods&&{
      natal:topicContent.natal(seed.context.pillars,LunarUtil),prior:compact(periods.prior),current:compact(periods.years[0]),
      months:periods.calendar.map(row=>[row.month,...compact(row),row.annualLinks,row.cycles.map(c=>[c.pair,c.links])]),
      opportunity:periods.opportunity.map(row=>row.month),attention:periods.attention.map(row=>row.month),
      ...(seed.topicVersion>=4&&{focus:periods.highlights.map(({label,key,rows})=>[label,rows.map(r=>[r.month,r.assessment.axes[key].fact])])}),
      years:periods.years.map(row=>[row.year,...compact(row),row.cycles.map(c=>[c.pair,c.transition?.slice(0,7)||null,c.links])]),
      horizons:periods.horizons
    };
    const topicInstructions=topicPlan&&[`택일소 ${reading.title}의 본편을 전문 명리 풀이로 써요. 다섯 장과 각 장의 requiredBasis를 그대로 사용해요. ${topicPlan.focus}`,
      '약 70%는 검증된 원국과 운의 해석으로 쓰고, 상황형 참고 조언은 필요한 한두 문장으로 줄여요. 선택한 고민은 가상의 사례 또는 해석의 관심사예요. 실제 경험, 상대방 감정, 직장, 관계 상태로 바꾸지 마세요.',
      '한 장에 핵심 1문장과 해요체 본문 3~4문단, 450~630자를 쓰세요. 첫 문단에는 requiredBasis에 지정된 위치와 십성 이름(term)을 포함하되, 각 장의 결론을 먼저 쓰고 그 결론에 영향을 주는 근거로 연결하세요. 제목을 핵심 문장에 반복하지 마세요.',
      '유료 첫 장인 2장의 첫 문장부터 2027년 세운이 원국에 더하는 가장 중요한 변화를 해당 글자나 십성으로 짚어요. 첫 문단을 무료의 타고난 성격, 십성의 사전적 정의, 2026년 회고로 열지 마세요. 2026년 병오와 2027년 정미의 차이는 뒤에 연결하고 입춘 전은 병오년으로 읽어요. 3장은 대표 월운 중 대비가 분명한 달 두세 곳을 비교해요. 4장은 원국의 두 자리를 종합해 이 사람에게 어울리는 유형을 좁혀요. 5장은 opportunity와 attention에 든 시기를 근거와 함께 다뤄요. 같은 달에 합과 충이 공존하면 각각 무엇에 작용하는지 구분해요. 6장은 horizons의 실제 3·5·10년 범위와 대운을 연결해 서로 다른 전환점과 해석을 써요.',
      reading.id==='mujin'?'월주를 일하는 환경에 대한 우선 근거로, 관성은 책임과 평가, 식상은 역량을 드러내는 방식, 인성은 배움과 지원으로 구별해요. 취업·이직·승진은 각자 조건형으로 써요.':'일지와 그 자리에 직접 들어오는 작용을 관계 해석의 우선 근거로 삼아요. 전통 배우자성인 관성·재성과 현대적인 가까운 관계 해석을 구분하고, 성별이나 십성으로 지향·관계 형태를 추정하지 마세요. 편재 하나로 만남이 늘어난다고 풀이하지 말고, 일지 및 운과의 계산된 연결이 있을 때 보조 근거로만 써요. 확인되지 않은 도화나 신살은 쓰지 마세요.',
      'months는 [양력 월, 대표 절기 월운, 월간 십성, 지지 주기운 십성, 원국 관계, 세 글자 관계, 세운과 월운 관계, 대운 배열]이에요. years는 [연도, 세운, 천간 십성, 지지 주기운 십성, 원국 관계, 세 글자 관계, 대운 배열]이에요. 배열이 비면 확인된 운만 써요. 대운 전환은 입력 기준의 근사 연·월로 표현해요. 확인되지 않은 명리 관계·점수·월일, 합화, 미래 사건 단정은 금지예요.',
      '인사, 상담 대사, 사례를 길게 펼치지 말고 결론 뒤에 실제 원국 글자와 운을 바로 이어요. 전문 용어는 뜻을 문장 안에서 짧게 알려줘요. 같은 조언, 같은 질문, 문장 재서술을 반복하지 마세요.',
      ...(seed.topicVersion>=4?['시기를 다룰 때 focus에 있는 주제별 선정 순서와 근거를 사용해요. 대표 월운의 풀이를 양력 한 달 전체로 넓히지 마세요. 같은 달이 두 목록에 있으면 두 작용이 어떻게 다른지만 풀어요.']:[])
    ].join('\n');
    const routed=provider.create({env,fetchImpl,kind:'annual'});
    const assetInstructions=calendar?.assetGuide
      ? '\n재테크는 asset_focus에 있는 검토할 방식과 조심할 행동, 각각에 붙은 원국·월운 근거를 사용해요. 5장에서 이 사람이 의사결정을 할 때 어떤 강점을 쓰고 어떤 행동은 왜 조심할지 한두 문장으로 풀어요. 제공된 달은 검토하거나 판단 습관을 점검하기 좋은 기간으로만 설명해요. 이 사람이 이미 투자한다고 가정하거나 자산 가격, 수익률, 특정 종목, 매수·매도, 대출을 예측하거나 지시하지 마세요.'
      : '';
    const assetFocus=calendar?.assetGuide&&Object.fromEntries(['consider','avoid'].map(key=>[key,calendar.assetGuide[key].map(
      ({label,natalFact,natalMeaning,timing})=>({label,natalFact,natalMeaning,month:timing.month,monthFact:timing.fact})
    )]));
    const response=await routed.fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:{'Content-Type':'application/json','x-api-key':env.ANTHROPIC_API_KEY||'','anthropic-version':'2023-06-01'},
      signal:AbortSignal.timeout(145000),body:JSON.stringify({
        model:env.ANTHROPIC_MODEL||'claude-haiku-4-5-20251001',max_tokens:7900,temperature:.55,system:(topicInstructions||(wealth?instructions.replace('850~970자','460~640자'):instructions))+assetInstructions+'\n'+languageGuidance,
        messages:[{role:'user',content:JSON.stringify({topic:reading.stories[seed.choice].label,
          firstChapter:{title:seed.first.title,highlight:seed.first.highlight},
          ...(assetFocus&&{asset_focus:assetFocus}),
          evidence:evidence.map(({id,meaning,location,term})=>({id,pillar:pillarLabels[location?.[0]],...(wealth||topicPlan?{position:location,term}:{meaning})})),
          ...(judgment&&{wealth_judgment:{internal:calendar.internal,natal:calendar.natal,dayStem:calendar.pillars.day[0],route:{key:judgment.route.key,basis:judgment.route.basis},
            timing:judgment.timing.map(({kind,ganZhi,basis})=>({kind,ganZhi,basis})),
            annual:[calendar.prior,calendar.outlook.years[0]].map(({year,ganZhi,basis,score,expenseScore,relations})=>({year,ganZhi,basis,score,expenseScore,relations})),months:calendar.rows.map(({month,ganZhi,score,expenseScore,basis,relations,segments})=>{
              const primary=segments.find(s=>s.monthGanZhi===ganZhi);
              return {month,ganZhi,score,expenseScore,basis,relations,annual:primary.yearGanZhi,groups:primary.groups,cycles:primary.cycles};
            }),
            outlook:{horizons:calendar.outlook.horizons,years:calendar.outlook.years.map(({year,ganZhi,basis,cycles})=>({year,ganZhi,basis,cycles:cycles?.map(c=>({ganZhi:c.ganZhi,from:c.from.slice(0,10),until:c.until.slice(0,10),relations:c.relations,groups:c.groups}))}))},daewoon:calendar.daewoon?.cycles?.map(({startYear,endYear,ganZhi,basis,relations})=>({basis,relations,from:Math.max(calendar.year,startYear),through:Math.min(calendar.year+9,endYear),ganZhi})).filter(cycle=>cycle.from<=cycle.through)??[],opportunities:rankedDetail('opportunity'),expenses:rankedDetail('expense')}}),
          ...(timing&&{timing}),chapterPlan})}],
        tools:[{name:tool,description:reading.title+' 본편',input_schema:schema}],tool_choice:{type:'tool',name:tool}
      })
    });
    if(!response.ok) throw new Error('SEOHWA_UPSTREAM_ERROR');
    const output=await response.json();
    const calls=output.content?.filter(block=>block.type==='tool_use'&&block.name===tool);
    if(output.stop_reason!=='tool_use'||calls?.length!==1) throw new Error('SEOHWA_INCOMPLETE');
    const generation={promptVersion:wealth?'dogyeom-wealth-v11':topicPlan?reading.id+'-fortune-v3':reading.VERSION,model:output.model||null,...routed.summarize()};
    const validateBody=input=>checked(input,evidence,chapterPlan,calendar,periods);
    try {
      return {body:validateBody(calls[0].input),generation};
    } catch(error) {
      if(wealth&&calendar){
        const result=wealthRecovery.recover(calls[0].input,error,()=>wealthRecovery.recoveryChapters(calendar,chapterPlan,evidence),validateBody);
        console.info('[featured-report] recovered wealth chapters',result.recoveredChapters);
        return {body:result.body,generation:{...generation,recoveredChapters:result.recoveredChapters}};
      }
      console.warn('[featured-report] rejected output',JSON.stringify({model:generation.model,version:generation.promptVersion,
        usage:generation.usage,costUsd:generation.estimated_usd}));
      throw error;
    }
  }

  async function generate(db,uid,id,{now=Date.now,fetchImpl=fetch,env=process.env,adminAccess=false}={}) {
    const current=await paidReport(db,uid,id,null,adminAccess);
    if(current.data.report.body) return view(id,current.data,now());
    const revision=await consent.assertGranted(db,uid);
    const attemptId=randomUUID();
    const claim=await db.runTransaction(async tx=>{
      const {ref,data}=await paidReport(db,uid,id,tx,adminAccess);
      const t=now();
      if(data.report.body || (data.attemptId && t-data.attemptAtMs<BUSY_MS)) return {view:view(id,data,t)};
      const window=Math.floor(t/3600000),tries=data.attemptWindow===window?Number(data.attempts)||0:0;
      if(tries>=3) throw failure(429,'SEOHWA_RETRY_LATER','리포트를 여러 번 요청했어요. 잠시 뒤 내 기록에서 다시 시도해 주세요.');
      tx.update(ref,{attemptId,attemptAtMs:t,attemptWindow:window,attempts:tries+1});
      return {seed:data.report};
    });
    if(claim.view) return claim.view;
    try {
      const {body,generation}=await write(claim.seed,consent.guardProvider(db,uid,revision,fetchImpl),env);
      return await db.runTransaction(async tx=>{
        const {ref,data}=await paidReport(db,uid,id,tx,adminAccess);
        if(data.attemptId!==attemptId) return view(id,data,now());
        const calendar=currentCalendar(data.report);
        const report={...data.report,body,generation,...(calendar&&{calendar})};
        tx.update(ref,{report,attemptId:null});
        return view(id,{...data,report},now());
      });
    } catch(error) {
      await db.runTransaction(async tx=>{
        const data=(await tx.get(current.ref)).data();
        if(data?.attemptId===attemptId) tx.update(current.ref,{attemptId:null});
      }).catch(()=>{});
      if(error.status===403||error.status===410) throw error;
      console.warn('[seohwa-report] generation failed',error.code||error.message);
      throw failure(502,'SEOHWA_GENERATION_FAILED','본편을 완성하지 못했어요. 내 기록에서 다시 만들 수 있어요.');
    }
  }

  async function checkoutStatus(db,uid,orderId) {
    const notFound=()=>failure(404,'REPORT_ORDER_NOT_FOUND','이 계정에서 리포트 주문을 찾지 못했어요.');
    if(typeof orderId!=='string'||orderId.length>150||!/^TAK-[A-Z0-9]+-[A-Z0-9]+$/.test(orderId)) throw notFound();
    const order=(await db.collection('paymentOrders').doc(orderId).get()).data();
    const id=order?.[CONFIG.orderKey];
    if(order?.uid!==uid||order.product!==CONFIG.product||!CONFIG.acceptedPrices.includes(order.amount)||
       typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)) throw notFound();
    if(isRefunded(order)) return {state:['refunded','partially_refunded'].includes(order.status)?order.status:'cancelled'};
    if(order.status==='pending') return {state:'pending',waiting:Number(order.lastPayState)===10?'deposit':'provider'};
    if(!isPaidOrder(order,uid)||order.entitlementGranted!==true) {
      throw failure(409,'REPORT_PAYMENT_REVIEW','결제 후 리포트 열람 상태를 확인하지 못했어요. 1:1 문의에서 주문 확인을 요청해 주세요.');
    }
    if(order.reportExpiresAtMs>0&&order.reportExpiresAtMs<=Date.now()) {
      return {state:'expired',id,expiresAtMs:order.reportExpiresAtMs};
    }
    const {data}=await paidReport(db,uid,id);
    if(data.paidOrderId!==orderId) return {state:'superseded'};
    return view(id,data);
  }

  async function run(db,uid,payload,now=Date.now(),adminAccess=false) {
    if(payload.operation==='checkout-status') return checkoutStatus(db,uid,payload.orderId);
    if(payload.operation==='generate') return generate(db,uid,payload.id,{adminAccess});
    if(payload.operation==='list') {
      const snap=await db.collection('users').doc(uid).collection(CONFIG.collection)
        .where('readyAtMs','>',0).orderBy('readyAtMs','desc').select('createdAtMs','report.choice','adminGrant',retention.FIELD).limit(50).get();
      return {reports:snap.docs.filter(doc=>!retention.expired(doc.data(),now)&&
        (doc.data().adminGrant!==true||adminAccess===true)).map(doc=>({
        id:doc.id,createdAtMs:doc.data().createdAtMs,choice:doc.data().report.choice,
        ...(doc.data().adminGrant===true&&{adminPreview:true}),...retention.display(doc.data())
      }))};
    }
    if(payload.operation==='prepare'&&payload.checkout===true) await consent.assertGranted(db,uid);
    const result=await account.run(CONFIG,db,uid,payload,now,adminAccess);
    if(result.state!=='ready') return result;
    return view(result.id,(await paidReport(db,uid,result.id,null,adminAccess)).data);
  }

  async function reserve(db,tx,uid,id,chapter,userData,adminAccess=false) {
    const {ref,data}=await paidReport(db,uid,id,tx,adminAccess);
    if(!data.report.body) throw failure(409,required,'본편을 먼저 열어 주세요.');
    if(!left(data)) throw failure(403,prefix+'_QUESTIONS_USED','리포트에 포함된 상담 3회를 모두 사용했어요.');
    const part=Number.isInteger(chapter)&&chapter>=0?data.report.body[chapter]:null;
    const context=part?{title:part.title,point:part.highlight,basis:part.basis.meaning}:{title:data.report.first.title,point:data.report.first.highlight,basis:data.report.first.basis[0].meaning};
    if(wealth){
      const {judgment}=currentCalendar(data.report);
      context.calendar=judgment.timing.map(({kind,title,basis,talk})=>({kind,title,basis,talk}));
    }
    tx.update(ref,{questionsUsed:COUNT-left(data)+1});
    const access=data.adminGrant===true?{adminGrantAtMs:data.createdAtMs}:data.couponGrantId?{couponGrantId:data.couponGrantId}:{orderId:data.paidOrderId};
    return {kind:'featured-report',consultantId:reading.id,id,...access,profile:data.report.profile,context,reportQuestionsLeft:left(data)-1,
      ...(legacy&&{seohwaQuestionsLeft:left(data)-1}),
      freeUsed:Number(userData.aiFreeUsed)||0,questionCreditsLeft:Number(userData.aiQuestionCredits)||0};
  }

  function sameAccess(data,reservation) {
    if(data.couponGrantId)return data.couponGrantId===reservation.couponGrantId;
    return data.adminGrant===true
      ? data.createdAtMs===reservation.adminGrantAtMs
      : !!data.paidOrderId&&data.paidOrderId===reservation.orderId;
  }

  async function rollback(db,uid,reservation) {
    return db.runTransaction(async tx=>{
      const ref=db.collection('users').doc(uid).collection(CONFIG.collection).doc(reservation.id);
      const data=(await tx.get(ref)).data();
      if(data?.ready&&sameAccess(data,reservation)&&data.questionsUsed>0) tx.update(ref,{questionsUsed:data.questionsUsed-1});
    });
  }

  return {CONFIG,run,generate,reserve,rollback,paidReport,sameAccess,checked,validate,calculate};
}

module.exports={createReport};
