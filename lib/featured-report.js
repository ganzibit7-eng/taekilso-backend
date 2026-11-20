'use strict';
const {randomUUID} = require('node:crypto');
const {Solar,LunarUtil} = require('lunar-javascript');
const account = require('./account-report');
const {normalizeProfile} = require('./newyear-calculation');
const {isPaidOrder,isRefunded} = require('./payment-entitlements');
const consent = require('./ai-transfer-consent');
const provider = require('./consultation-provider');
const {buildCalendar} = require('./wealth-report-calendar');
const {languageGuidance,spokenProse,needsLanguageRepair} = require('./consultation-personas');

const COUNT = 3;
const BUSY_MS = 165000;
const failure = account.failure;

function createReport(reading) {
  const legacy=reading.id==='seohwa';
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
      ...(reading.id==='dogyeom'&&{calendar:{...buildCalendar(profile),pillars:context.pillars}})};
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
    return {id,state:'ready',report:{first:updatedFirst,body,choice,profile,day:context.day,known:context.known,
      ...(data.report.calendar&&{calendar:data.report.calendar})},questionsLeft:left(data)};
  }

  const tool=legacy?'write_seohwa_report':'write_featured_report';
  const paragraph={type:'string'};
  const schema={type:'object',additionalProperties:false,required:['chapters'],properties:{
    chapters:{type:'array',items:{type:'object',additionalProperties:false,required:['highlight','paragraphs','basisId'],
      properties:{highlight:paragraph,paragraphs:{type:'array',items:paragraph},basisId:paragraph}}}
  }};
  const instructions=`택일소 ${reading.title}의 본편을 이어서 써요. ${reading.voice||'서화는 부드럽고 분명한 해요체로 말해요.'} 독자 호칭은 생략해요.
  제공된 목차 순서로 다섯 장을 써요. 각 장은 한 문장 핵심, 3~4개 문단, 실제 사주 근거 ID 하나를 제출해요.
  각 장의 본문은 한국어 공백 포함 720~920자, 전체 생성 본문은 3800~4600자 내외로 써요. 핵심과 본문은 일반 텍스트예요.
  첫 장의 핵심을 되풀이하지 않고 후속 장마다 다른 장면과 갈림길을 펼쳐요. 일부 장의 첫 문단은 이미 무료로 제공됐어요. 해당 장은 firstParagraph 뒤를 바로 이어 쓰고 firstParagraph를 반복하지 않아요. requiredBasis가 정해진 장은 그 ID를 꼭 사용해요.
  제공된 고민은 사용자가 선택한 관심사예요. 실제 일이나 성격으로 단정하지 말고 선택한 상황에서 계산 근거가 어떻게 다르게 나타나는지 조곤조곤 풀어요.
  사주 용어를 나열하지 말고 근거 의미가 바뀌지 않게 일상어로 옮겨요. 다른 십성, 시기, 숫자 점수, 상대 사주·속마음, 발생이 확정된 사건을 만들지 않아요.
  상담사가 독자에게 직접 말하듯 자연스럽게 써요. 장마다 다른 행동 기준을 줘요. 대화 장은 실제로 건넬 말과 상대 반응별 선택지를 더 자세히 다뤄요.
  ${reading.id==='dogyeom'?'사용자는 돈이 들어오는 조건, 남지 않는 구조, 특히 어떤 시기에 무엇을 해볼지 알고 싶어요. 일의 대가를 높이는 방식과 공동 비용·지출 경계를 분리해 사례를 들어요. 월별 표와 시기는 별도로 계산해 표시하므로 본문에서 월이나 순위를 만들지 않아요. 각 장에서 해당 사주 근거와 실제 행동의 연결을 설명해요.':''}`;

  function checked(output,context,excerpts=[]) {
    if(!Array.isArray(output?.chapters)||output.chapters.length!==reading.chapters.length) throw new Error('SEOHWA_CHAPTER_COUNT');
    const paragraphsSeen=new Set(excerpts.map(excerpt=>excerpt.text));
    const polish=spokenProse();
    let length=0;
    const items=output.chapters.map((chapter,index)=>{
      const {highlight,paragraphs,basisId}=chapter||{};
      const basis=context.readings.find(item=>item.id===basisId);
      const opening=excerpts.find(excerpt=>excerpt.index===index);
      if(!basis||(opening&&basis.id!==opening.basisId)||typeof highlight!=='string'||highlight.trim().length<10||highlight.length>95||
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
      const size=cleaned.join('').length;
      if(size<565||size>1140) throw new Error('SEOHWA_CHAPTER_SIZE');
      if(opening)cleaned.unshift(opening.text);
      length+=cleaned.join('').length+highlight.trim().length;
      return {title:reading.chapters[index],highlight:polish(highlight.trim()),paragraphs:cleaned,basis};
    });
    if(length<3550||length>5500) throw new Error('SEOHWA_REPORT_SIZE');
    return items;
  }

  async function write(seed,fetchImpl,env) {
    const routed=provider.create({env,fetchImpl,kind:'annual'});
    const response=await routed.fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:{'Content-Type':'application/json','x-api-key':env.ANTHROPIC_API_KEY||'','anthropic-version':'2023-06-01'},
      signal:AbortSignal.timeout(145000),body:JSON.stringify({
        model:env.ANTHROPIC_MODEL||'claude-haiku-4-5-20251001',max_tokens:7900,temperature:.55,system:instructions+'\n'+languageGuidance,
        messages:[{role:'user',content:JSON.stringify({topic:reading.stories[seed.choice].label,
          firstChapter:{title:seed.first.title,highlight:seed.first.highlight},
          evidence:seed.context.readings.map(({id,meaning})=>({id,meaning})),
          chapterPlan:reading.chapters.map((title,i)=>{
            const opening=seed.excerpts.find(excerpt=>excerpt.index===i);
            return {title,aim:reading.guide[i],...(opening&&{firstParagraph:opening.text,requiredBasis:opening.basisId})};
          })})}],
        tools:[{name:tool,description:reading.title+' 본편',input_schema:schema}],tool_choice:{type:'tool',name:tool}
      })
    });
    if(!response.ok) throw new Error('SEOHWA_UPSTREAM_ERROR');
    const output=await response.json();
    const calls=output.content?.filter(block=>block.type==='tool_use'&&block.name===tool);
    if(output.stop_reason!=='tool_use'||calls?.length!==1) throw new Error('SEOHWA_INCOMPLETE');
    return checked(calls[0].input,seed.context,seed.excerpts);
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
        const report={...data.report,body};
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
    if(chapter===1&&data.report.calendar)context.calendar=data.report.calendar.focuses;
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
