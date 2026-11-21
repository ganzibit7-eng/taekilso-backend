'use strict';
const {randomUUID} = require('node:crypto');
const {Solar,LunarUtil} = require('lunar-javascript');
const account = require('./account-report');
const {normalizeProfile} = require('./newyear-calculation');
const {isPaidOrder,isRefunded} = require('./payment-entitlements');
const consent = require('./ai-transfer-consent');
const provider = require('./consultation-provider');
const {buildCalendar,version:calendarVersion} = require('./wealth-report-calendar');
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
    return {version:reading.VERSION,profile,choice,context,first:reading.first(context,choice),excerpts:reading.excerpts(context,choice),
      ...(wealth&&{calendar:buildCalendar(profile,context.pillars)})};
  }

  function currentCalendar(seed) {
    if(!wealth)return null;
    if(seed.calendar?.version===calendarVersion)return seed.calendar;
    return buildCalendar(seed.profile,seed.context.pillars||{day:seed.context.day});
  }

  const CONFIG={
    product:'taekilso_'+reading.id+'_story_report',price:reading.PRICE,name:reading.NAME,
    payAppNames:legacy?['서화 연애 리포트 상담 3회','서화 연애 리포트   상담 3회']:[],
    collection:reading.id+'Reports',orderKey:legacy?'seohwaReportId':'featuredReportId',validate,calculate,storyReport:true,
    present:()=>null
  };
  const left=data=>Math.max(0,COUNT-(Number(data.questionsUsed)||0));

  async function paidReport(db,uid,id,tx) {
    if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)) throw failure(400,'INVALID_REPORT','리포트를 다시 열어 주세요.');
    const get=ref=>tx?tx.get(ref):ref.get();
    const ref=db.collection('users').doc(uid).collection(CONFIG.collection).doc(id);
    const data=(await get(ref)).data();
    if(!data?.ready||!data.paidOrderId) throw failure(403,required,'이 계정에서 열린 리포트를 확인하지 못했어요.');
    const order=(await get(db.collection('paymentOrders').doc(data.paidOrderId))).data();
    if(!isPaidOrder(order,uid)||order.entitlementGranted!==true||order.product!==CONFIG.product||
       order.amount!==CONFIG.price||order[CONFIG.orderKey]!==id) {
      throw failure(403,required,'리포트 결제 상태를 확인하지 못했어요.');
    }
    return {ref,data};
  }

  function view(id,data,now=Date.now()) {
    if(!data.report.body){
      if(data.attemptId&&now-data.attemptAtMs<BUSY_MS) return {id,state:'generating',startedAtMs:data.attemptAtMs};
      return {id,state:'paid'};
    }
    const {first,body,choice,profile,context}=data.report;
    const line=reading.stories[choice].line;
    const updatedFirst={...first,question:line,sections:first.sections.map(section=>section.quote?{...section,text:line}:section)};
    const calendar=currentCalendar(data.report);
    return {id,state:'ready',report:{first:updatedFirst,body,choice,profile,day:context.day,known:context.known,
      ...(calendar&&{calendar})},questionsLeft:left(data)};
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
  ${wealth?`도겸의 독자는 언제 수입을 늘려 볼지, 언제 번 돈을 지킬지, 어디에서 내 몫이 줄기 쉬운지 우선 알고 싶어요. wealth_judgment의 route는 이 사람에게 먼저 볼 재물 통로이고, timing의 income(수입), margin(보유), risk(지출)는 원국과 월운을 대조해 서버가 고른 구간이에요.
  먼저 재물에 대한 해석자의 판단을 한 가지로 좁혀 답해요. 새 일을 넓히는 편, 반복해서 보상을 받는 편, 이미 쌓은 실력을 수입으로 연결하는 편 중 제공된 route에 맞춰 이야기해요. 해당 근거가 약하면 왜 한쪽으로 단정하기 어려운지 말해요. 다른 재물 통로와 비교할 때는 실제로 판단이 갈리는 장면을 보여줘요.
  본문 각 장은 chapterPlan의 wealthFocus에 맞춰 수입의 크기·보상의 지속성·실제로 남는 몫을 구분해요. 돈이 새는 곳은 자기 몫부터 대신 내주는지, 추가 책임에 값을 붙이지 못하는지, 급한 조건에서 먼저 비용이 드는지 중 근거에서 읽히는 장면을 골라요. 항목을 확인하라는 말만 반복하거나 독자의 소비 내역·직업을 지어내지 않아요.
  달력에 붙는 실제 절기 날짜는 서버가 표시해요. 본문에서는 선택된 구간에 왜 그 행동을 앞세우는지 묘사하고 월·날짜·순위를 새로 쓰지 않아요. 근거에 제공된 대비를 일상어로 풀고, 마무리에서 현실 판단에 필요한 조건을 짧게 분리해요. 수익·손실·부동산 거래가 이미 정해진 것처럼 말하거나 가격·투자 종목을 찍지 않아요.`:''}`;

  function planChapters(seed,evidence,judgment){
    const openings=new Map(seed.excerpts.map(excerpt=>[excerpt.index,excerpt]));
    const used=new Set(seed.excerpts.map(excerpt=>excerpt.basisId));
    return reading.chapters.map((title,index)=>{
      const opening=openings.get(index);
      const fresh=evidence.filter(item=>!used.has(item.id));
      const pool=fresh.length?fresh:evidence;
      const preferences=chapterPreferences[reading.id][index]||[];
      const basis=preferences.map(family=>pool.find(item=>item.family===family)).find(Boolean)||pool[0];
      const requiredBasis=opening?.basisId??basis.id;
      used.add(requiredBasis);
      return {title,aim:reading.guide[index],requiredBasis,
        ...(judgment&&{wealthFocus:['income','risk','income·margin','margin','risk·margin'][index]}),
        ...(opening&&{firstParagraph:opening.text})};
    });
  }

  function checked(output,evidence,plan) {
    if(!Array.isArray(output?.chapters)||output.chapters.length!==reading.chapters.length) throw new Error('SEOHWA_CHAPTER_COUNT');
    const paragraphsSeen=new Set(plan.flatMap(chapter=>chapter.firstParagraph?[chapter.firstParagraph]:[]));
    const highlightsSeen=new Set();
    const polish=spokenProse();
    let length=0;
    const items=output.chapters.map((chapter,index)=>{
      const {highlight,paragraphs,basisId}=chapter||{};
      const basis=evidence.find(item=>item.id===basisId);
      const chapterPlan=plan[index];
      if(!basis||basis.id!==chapterPlan.requiredBasis||typeof highlight!=='string'||highlight.trim().length<10||highlight.length>95||
         !Array.isArray(paragraphs)||paragraphs.length<3||paragraphs.length>5) throw new Error('SEOHWA_CHAPTER_FORMAT');
      const cleaned=paragraphs.map(text=>{
        if(typeof text!=='string'||text.trim().length<90||text.length>650||/[<>]/.test(text)||
           /\d{1,4}\s*(?:점|월|년)|신강|신약|용신|격국/.test(text)||needsLanguageRepair(text)) throw new Error('SEOHWA_PARAGRAPH_FORMAT');
        const clean=polish(text.trim());
        if(paragraphsSeen.has(clean)) throw new Error('SEOHWA_PARAGRAPH_FORMAT');
        paragraphsSeen.add(clean);
        return clean;
      });
      if(/[<>]/.test(highlight)||/\d{1,4}\s*(?:점|월|년)|신강|신약|용신|격국/.test(highlight)||needsLanguageRepair(highlight)) throw new Error('SEOHWA_HIGHLIGHT_FORMAT');
      const point=polish(highlight.trim());
      if(highlightsSeen.has(point))throw new Error('SEOHWA_HIGHLIGHT_FORMAT');
      highlightsSeen.add(point);
      const size=cleaned.join('').length;
      if(size<670||size>1140) throw new Error('SEOHWA_CHAPTER_SIZE');
      if(chapterPlan.firstParagraph)cleaned.unshift(chapterPlan.firstParagraph);
      length+=cleaned.join('').length+point.length;
      return {title:reading.chapters[index],highlight:point,paragraphs:cleaned,basis};
    });
    if(length<4000||length>5850) throw new Error('SEOHWA_REPORT_SIZE');
    return items;
  }

  async function write(seed,fetchImpl,env) {
    const judgment=currentCalendar(seed)?.judgment;
    const evidence=[...seed.context.readings,...(seed.context.supportingReadings||[])];
    const chapterPlan=planChapters(seed,evidence,judgment);
    const routed=provider.create({env,fetchImpl,kind:'annual'});
    const response=await routed.fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:{'Content-Type':'application/json','x-api-key':env.ANTHROPIC_API_KEY||'','anthropic-version':'2023-06-01'},
      signal:AbortSignal.timeout(145000),body:JSON.stringify({
        model:env.ANTHROPIC_MODEL||'claude-haiku-4-5-20251001',max_tokens:7900,temperature:.55,system:instructions+'\n'+languageGuidance,
        messages:[{role:'user',content:JSON.stringify({topic:reading.stories[seed.choice].label,
          firstChapter:{title:seed.first.title,highlight:seed.first.highlight},
          evidence:evidence.map(({id,meaning,location})=>({id,meaning,pillar:pillarLabels[location?.[0]]})),
          ...(judgment&&{wealth_judgment:{route:judgment.route,timing:judgment.timing.map(({kind,ganZhi,basis,talk,action})=>({kind,ganZhi,basis,talk,action}))}}),
          chapterPlan})}],
        tools:[{name:tool,description:reading.title+' 본편',input_schema:schema}],tool_choice:{type:'tool',name:tool}
      })
    });
    if(!response.ok) throw new Error('SEOHWA_UPSTREAM_ERROR');
    const output=await response.json();
    const calls=output.content?.filter(block=>block.type==='tool_use'&&block.name===tool);
    if(output.stop_reason!=='tool_use'||calls?.length!==1) throw new Error('SEOHWA_INCOMPLETE');
    return checked(calls[0].input,evidence,chapterPlan);
  }

  async function generate(db,uid,id,{now=Date.now,fetchImpl=fetch,env=process.env}={}) {
    const current=await paidReport(db,uid,id);
    if(current.data.report.body) return view(id,current.data,now());
    const revision=await consent.assertGranted(db,uid);
    const attemptId=randomUUID();
    const claim=await db.runTransaction(async tx=>{
      const {ref,data}=await paidReport(db,uid,id,tx);
      const t=now();
      if(data.report.body || (data.attemptId && t-data.attemptAtMs<BUSY_MS)) return {view:view(id,data,t)};
      const window=Math.floor(t/3600000),tries=data.attemptWindow===window?Number(data.attempts)||0:0;
      if(tries>=3) throw failure(429,'SEOHWA_RETRY_LATER','리포트를 여러 번 요청했어요. 잠시 뒤 내 기록에서 다시 시도해 주세요.');
      tx.update(ref,{attemptId,attemptAtMs:t,attemptWindow:window,attempts:tries+1});
      return {seed:data.report};
    });
    if(claim.view) return claim.view;
    try {
      const body=await write(claim.seed,consent.guardProvider(db,uid,revision,fetchImpl),env);
      return await db.runTransaction(async tx=>{
        const {ref,data}=await paidReport(db,uid,id,tx);
        if(data.attemptId!==attemptId) return view(id,data,now());
        const calendar=currentCalendar(data.report);
        const report={...data.report,body,...(calendar&&{calendar})};
        tx.update(ref,{report,attemptId:null});
        return view(id,{...data,report},now());
      });
    } catch(error) {
      await db.runTransaction(async tx=>{
        const data=(await tx.get(current.ref)).data();
        if(data?.attemptId===attemptId) tx.update(current.ref,{attemptId:null});
      }).catch(()=>{});
      if(error.status===403) throw error;
      console.warn('[seohwa-report] generation failed',error.code||error.message);
      throw failure(502,'SEOHWA_GENERATION_FAILED','본편을 완성하지 못했어요. 결제는 확인됐으니 내 기록에서 다시 만들 수 있어요.');
    }
  }

  async function checkoutStatus(db,uid,orderId) {
    const notFound=()=>failure(404,'REPORT_ORDER_NOT_FOUND','이 계정에서 리포트 주문을 찾지 못했어요.');
    if(typeof orderId!=='string'||orderId.length>150||!/^TAK-[A-Z0-9]+-[A-Z0-9]+$/.test(orderId)) throw notFound();
    const order=(await db.collection('paymentOrders').doc(orderId).get()).data();
    const id=order?.[CONFIG.orderKey];
    if(order?.uid!==uid||order.product!==CONFIG.product||order.amount!==CONFIG.price||
       typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)) throw notFound();
    if(isRefunded(order)) return {state:['refunded','partially_refunded'].includes(order.status)?order.status:'cancelled'};
    if(order.status==='pending') return {state:'pending',waiting:Number(order.lastPayState)===10?'deposit':'provider'};
    if(!isPaidOrder(order,uid)||order.entitlementGranted!==true) {
      throw failure(409,'REPORT_PAYMENT_REVIEW','결제 후 리포트 열람 상태를 확인하지 못했어요. 1:1 문의에서 주문 확인을 요청해 주세요.');
    }
    const {data}=await paidReport(db,uid,id);
    if(data.paidOrderId!==orderId) return {state:'superseded'};
    return view(id,data);
  }

  async function run(db,uid,payload) {
    if(payload.operation==='checkout-status') return checkoutStatus(db,uid,payload.orderId);
    if(payload.operation==='generate') return generate(db,uid,payload.id);
    if(payload.operation==='list') {
      const snap=await db.collection('users').doc(uid).collection(CONFIG.collection)
        .where('readyAtMs','>',0).orderBy('readyAtMs','desc').select('createdAtMs','report.choice').limit(50).get();
      return {reports:snap.docs.map(doc=>({id:doc.id,createdAtMs:doc.data().createdAtMs,choice:doc.data().report.choice}))};
    }
    if(payload.operation==='prepare'&&payload.checkout===true) await consent.assertGranted(db,uid);
    const result=await account.run(CONFIG,db,uid,payload);
    if(result.state!=='ready') return result;
    return view(result.id,(await paidReport(db,uid,result.id)).data);
  }

  async function reserve(db,tx,uid,id,chapter,userData) {
    const {ref,data}=await paidReport(db,uid,id,tx);
    if(!data.report.body) throw failure(409,required,'본편을 먼저 열어 주세요.');
    if(!left(data)) throw failure(403,prefix+'_QUESTIONS_USED','리포트에 포함된 상담 3회를 모두 사용했어요.');
    const part=Number.isInteger(chapter)&&chapter>=0?data.report.body[chapter]:null;
    const context=part?{title:part.title,point:part.highlight,basis:part.basis.meaning}:{title:data.report.first.title,point:data.report.first.highlight,basis:data.report.first.basis[0].meaning};
    if(wealth){
      const {judgment}=currentCalendar(data.report);
      context.calendar=judgment.timing.map(({kind,title,basis,talk})=>({kind,title,basis,talk}));
    }
    tx.update(ref,{questionsUsed:COUNT-left(data)+1});
    return {kind:'featured-report',consultantId:reading.id,id,orderId:data.paidOrderId,profile:data.report.profile,context,reportQuestionsLeft:left(data)-1,
      ...(legacy&&{seohwaQuestionsLeft:left(data)-1}),
      freeUsed:Number(userData.aiFreeUsed)||0,questionCreditsLeft:Number(userData.aiQuestionCredits)||0};
  }

  async function rollback(db,uid,reservation) {
    return db.runTransaction(async tx=>{
      const ref=db.collection('users').doc(uid).collection(CONFIG.collection).doc(reservation.id);
      const data=(await tx.get(ref)).data();
      if(data?.ready&&data.paidOrderId===reservation.orderId&&data.questionsUsed>0) tx.update(ref,{questionsUsed:data.questionsUsed-1});
    });
  }

  return {CONFIG,run,generate,reserve,rollback,paidReport,checked,validate,calculate};
}

module.exports={createReport};
