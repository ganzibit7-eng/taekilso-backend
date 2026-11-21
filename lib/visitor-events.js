'use strict';
const crypto=require('node:crypto');
const ORIGINS=new Set(['https://taekilso.com','https://www.taekilso.com']);
const FUNNEL=new Set(['fortuneResults','aiCtaClicks','freeReportViews','freeReportCompleted','reportCtaClicks','reportQuestionClicks','reportSignupStarts','reportSignups','reportFirstQuestions','signups']);
const MEMBER=new Set(['signups','reportSignups','reportFirstQuestions','firstAiAnswers','freeLimitExhausted']);
// Each allowed action is an independent count; event IDs only deduplicate retries.
const CARD_TOPICS = ["love","wealth","career","wedding","first-date","reunion","marriage","career-start","side-job","saving","career-growth","study-routine","exam-planning","major-choice","new-learning","first-home","family-boundaries","work-rest","friendships","move-planning","opening-plan","contract-prep","yeonwoo","newyear"];
const REPORT_TOPICS = ['love','wealth','reunion','career','newyear','date','relationship'];
const REPORT_STAGES = ['preview','buy','checkout','openError','read'];
const ACTIVITIES = new Set([
  'exampleReads','consultationOpens','homeBasicStart','basicResult','loginStart',
  ...CARD_TOPICS.map(topic => 'card_' + topic),
  ...REPORT_TOPICS.flatMap(topic => REPORT_STAGES.map(stage => stage + '_' + topic))
]);
const SEO=new Set(['visits','signups']);
const CHANNELS={google:'search',naver:'search',otherSearch:'search',threads:'sns',instagram:'sns',facebook:'sns',kakao:'sns',otherSns:'sns',direct:'direct',other:'other'};
const kst=ms=>new Date(ms+9*3600000).toISOString().slice(0,10);
function valid(body){
 if(body?.kind==='activity')return Object.keys(body).length===3 && ACTIVITIES.has(body.field) &&
   typeof body.eventId==='string' && /^[a-f0-9]{32}$/.test(body.eventId);
 if(!body||Object.keys(body).some(k=>!['session','kind','field','slug','channel','campaign'].includes(k))||!/^[a-f0-9]{32}$/.test(body.session||''))return false;
 if(Object.hasOwn(body,'campaign') && (body.kind!=='visit' || typeof body.campaign!=='string' || !/^[가-힣a-zA-Z][가-힣a-zA-Z0-9 _-]{0,63}$/.test(body.campaign) || body.campaign.trim()!==body.campaign))return false;
 if(body.kind==='visit')return !body.field&&!body.slug&&Object.hasOwn(CHANNELS,body.channel);
 if(body.kind==='funnel')return FUNNEL.has(body.field)&&!body.slug&&!body.channel;
 return body.kind==='seo'&&SEO.has(body.field)&&/^[a-z0-9][a-z0-9-]{0,49}$/.test(body.slug||'')&&!body.channel;
}
function create({db,auth,secret,increment,now=Date.now}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin');
  if(!ORIGINS.has(req.headers?.origin))return res.status(403).json({error:'ORIGIN_NOT_ALLOWED'});
  res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  const body=req.body;if(!valid(body))return res.status(400).json({error:'INVALID_EVENT'});
  if(!db||!secret)return res.status(503).json({error:'EVENTS_UNAVAILABLE'});
  let actor=null;const authorization=String(req.headers?.authorization||'');
  if(authorization){const token=authorization.match(/^Bearer\s+(\S+)$/i)?.[1];if(!token)return res.status(401).json({error:'UNAUTHORIZED'});try{actor=await auth.verifyIdToken(token,true);}catch(_){return res.status(401).json({error:'UNAUTHORIZED'});}}
  if(String(actor?.email||'').trim().toLowerCase()==='green092432@gmail.com')return res.status(200).json({recorded:false,reason:'ADMIN_EXCLUDED'});
  const activity=body.kind==='activity';
  if(MEMBER.has(body.field)&&(!actor?.uid||actor.firebase?.sign_in_provider==='anonymous'))return res.status(401).json({error:'MEMBER_REQUIRED'});
  let created=null;
  if(['signups','reportSignups'].includes(body.field)){
   try{const account=await auth.getUser(actor.uid);created=Date.parse(account.metadata?.creationTime||'');if(!Number.isFinite(created)||Math.abs(now()-created)>(20*60*1000))return res.status(200).json({recorded:false,reason:'EXISTING_MEMBER'});}catch(_){return res.status(503).json({error:'MEMBER_CHECK_UNAVAILABLE'});}
  }
  const time=now(),date=kst(created ?? time),digest=x=>crypto.createHmac('sha256',secret).update(x).digest('hex'),hash=x=>digest(date+'|'+x);
  // Vercel supplies this forwarding header. Only a daily keyed digest is retained.
  const ip=String(req.headers?.['x-vercel-forwarded-for']||req.headers?.['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const subject=MEMBER.has(body.field)?'user:'+actor.uid:'session:'+body.session;
  const buckets=db.collection('analyticsEventBuckets');
  const bucket=activity
    ? buckets.doc('event_'+digest(body.field+'|'+body.eventId))
    : buckets.doc(date+'_'+hash(subject));
  const rate=db.collection('analyticsRateLimits').doc(date+'_'+hash('network:'+ip));
  const eventKey=hash(body.kind+'|'+(body.field||'visit')+'|'+(body.slug||''));
  try{
   const result=await db.runTransaction(async tx=>{
    const [b,r]=await Promise.all([tx.get(bucket),tx.get(rate)]),old=b.exists?b.data():{},limit=r.exists?r.data():{},seen=old.events||{};
    const expiresAt=new Date(time+7*86400000);
    if(activity){
     if(b.exists)return 'DUPLICATE';
     if(Number(limit.count||0)>=1000)return 'RATE_LIMITED';
     tx.set(bucket,{expiresAt});
     tx.set(rate,{date,count:Number(limit.count||0)+1,expiresAt});
     tx.set(db.collection('dailyFunnel').doc(date),{date,[body.field]:increment(1)},{merge:true});
     return 'RECORDED';
    }
    if(seen[eventKey])return 'DUPLICATE';
    if(Object.keys(seen).length>=40||Number(limit.count||0)>=1000)return 'RATE_LIMITED';
    // Clients cannot submit totals, money, purchase confirmations, questions or birth data.
    tx.set(bucket,{date,events:{...seen,[eventKey]:true},expiresAt});tx.set(rate,{date,count:Number(limit.count||0)+1,expiresAt});
    if(body.kind==='visit'){
     tx.set(db.collection('stats').doc('counters'),{visits:increment(1)},{merge:true});
     tx.set(db.collection('dailyVisits').doc(date),{date,count:increment(1)},{merge:true});
     const values={date,total:increment(1)};values[CHANNELS[body.channel]]=increment(1);values[body.channel]=increment(1);
     tx.set(db.collection('dailyTrafficSources').doc(date),values,{merge:true});
     if (body.campaign) {
       const campaignId = crypto.createHash('sha256').update(body.campaign).digest('hex');
       const daily = db.collection('dailyCampaignVisits').doc(date+'_'+campaignId);
       tx.set(daily,{date,campaign:body.campaign,count:increment(1)},{merge:true});
     }
    }else if(body.kind==='funnel'){
     tx.set(db.collection('dailyFunnel').doc(date),{date,[body.field]:increment(1)},{merge:true});
     if(body.field==='signups')tx.set(db.collection('stats').doc('counters'),{signups:increment(1)},{merge:true});
    }else tx.set(db.collection('dailySeoLanding').doc(date+'__'+body.slug),{date,slug:body.slug,[body.field]:increment(1)},{merge:true});
    return 'RECORDED';
   });
   return res.status(result==='RATE_LIMITED'?429:200).json({recorded:result==='RECORDED',reason:result});
  }catch(_){return res.status(503).json({error:'EVENTS_UNAVAILABLE'});}
 };
}
module.exports={create,valid,kst};
