'use strict';
const crypto=require('node:crypto');
const ORIGINS=new Set(['https://taekilso.com','https://www.taekilso.com']);
const FUNNEL=new Set(['fortuneResults','aiCtaClicks','freeReportViews','freeReportCompleted','reportCtaClicks','reportQuestionClicks','reportSignupStarts','reportSignups','reportFirstQuestions','signups']);
const MEMBER=new Set(['signups','reportSignups','reportFirstQuestions','firstAiAnswers','freeLimitExhausted']);
const SEO=new Set(['visits','signups']);
const CHANNELS={google:'search',naver:'search',otherSearch:'search',threads:'sns',instagram:'sns',facebook:'sns',kakao:'sns',otherSns:'sns',direct:'direct',other:'other'};
const kst=ms=>new Date(ms+9*3600000).toISOString().slice(0,10);
function valid(body){
 if(!body||Object.keys(body).some(k=>!['session','kind','field','slug','channel'].includes(k))||!/^[a-f0-9]{32}$/.test(body.session||''))return false;
 if(body.kind==='visit')return !body.field&&!body.slug&&Object.hasOwn(CHANNELS,body.channel);
 if(body.kind==='funnel')return FUNNEL.has(body.field)&&!body.slug&&!body.channel;
 return body.kind==='seo'&&SEO.has(body.field)&&/^[a-z0-9][a-z0-9-]{0,49}$/.test(body.slug||'')&&!body.channel;
}
function create({db,auth,secret,increment,now=Date.now}){
 let lastCleanup=0;
 async function cleanup(time){
  if(typeof db.batch!=='function'||time-lastCleanup<300000)return;lastCleanup=time;
  // Spark plan has no TTL. Only these newly introduced anonymous rate/dedupe
  // records are removed, in bounded batches on normal traffic after seven days.
  try{for(const name of ['analyticsEventBuckets','analyticsRateLimits']){const expired=await db.collection(name).where('expiresAt','<',new Date(time)).limit(40).get();if(!expired.empty){const batch=db.batch();expired.docs.forEach(doc=>batch.delete(doc.ref));await batch.commit();}}}catch(_){console.warn('[analytics] expired-record cleanup deferred');}
 }
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
  if(MEMBER.has(body.field)&&(!actor?.uid||actor.firebase?.sign_in_provider==='anonymous'))return res.status(401).json({error:'MEMBER_REQUIRED'});
  if(['signups','reportSignups'].includes(body.field)){
   try{const account=await auth.getUser(actor.uid),created=Date.parse(account.metadata?.creationTime||'');if(!Number.isFinite(created)||Math.abs(now()-created)>20*60*1000)return res.status(200).json({recorded:false,reason:'EXISTING_MEMBER'});}catch(_){return res.status(503).json({error:'MEMBER_CHECK_UNAVAILABLE'});}
  }
  const time=now(),date=kst(time),hash=x=>crypto.createHmac('sha256',secret).update(date+'|'+x).digest('hex');
  // Vercel supplies this forwarding header. Only a daily keyed digest is retained.
  const ip=String(req.headers?.['x-vercel-forwarded-for']||req.headers?.['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const subject=MEMBER.has(body.field)?'user:'+actor.uid:'session:'+body.session;
  const bucket=db.collection('analyticsEventBuckets').doc(date+'_'+hash(subject));
  const rate=db.collection('analyticsRateLimits').doc(date+'_'+hash('network:'+ip));
  const eventKey=hash(body.kind+'|'+(body.field||'visit')+'|'+(body.slug||''));
  try{
   const result=await db.runTransaction(async tx=>{
    const [b,r]=await Promise.all([tx.get(bucket),tx.get(rate)]),old=b.exists?b.data():{},limit=r.exists?r.data():{},seen=old.events||{};
    if(seen[eventKey])return 'DUPLICATE';
    if(Object.keys(seen).length>=40||Number(limit.count||0)>=1000)return 'RATE_LIMITED';
    // Clients cannot submit totals, money, purchase confirmations, questions or birth data.
    const expiresAt=new Date(time+7*86400000);
    tx.set(bucket,{date,events:{...seen,[eventKey]:true},expiresAt});tx.set(rate,{date,count:Number(limit.count||0)+1,expiresAt});
    if(body.kind==='visit'){
     tx.set(db.collection('stats').doc('counters'),{visits:increment(1)},{merge:true});
     tx.set(db.collection('dailyVisits').doc(date),{date,count:increment(1)},{merge:true});
     const values={date,total:increment(1)};values[CHANNELS[body.channel]]=increment(1);values[body.channel]=increment(1);
     tx.set(db.collection('dailyTrafficSources').doc(date),values,{merge:true});
    }else if(body.kind==='funnel'){
     tx.set(db.collection('dailyFunnel').doc(date),{date,[body.field]:increment(1)},{merge:true});
     if(body.field==='signups')tx.set(db.collection('stats').doc('counters'),{signups:increment(1)},{merge:true});
    }else tx.set(db.collection('dailySeoLanding').doc(date+'__'+body.slug),{date,slug:body.slug,[body.field]:increment(1)},{merge:true});
    return 'RECORDED';
   });
   if(result==='RECORDED')await cleanup(time);
   return res.status(result==='RATE_LIMITED'?429:200).json({recorded:result==='RECORDED',reason:result});
  }catch(_){return res.status(503).json({error:'EVENTS_UNAVAILABLE'});}
 };
}
module.exports={create,valid,kst};
