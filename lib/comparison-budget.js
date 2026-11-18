'use strict';
const {randomUUID}=require('node:crypto');
const fail=code=>Object.assign(new Error(code),{code,status:429});
const MICRO=1e6;
function cap(value,maximum){const n=Number(value);if(!Number.isFinite(n)||n<=0||n>maximum)throw fail('COMPARISON_BUDGET_CONFIG');return Math.floor(n*MICRO);}
// Reserve BEFORE each network request. Never release reservations: timeouts,
// malformed responses and failed telemetry may still represent billable work.
// Deliberately conservative, not an invoice or a credit-balance lookup.
function reserveAmount(payload){
 const bytes=Buffer.byteLength(JSON.stringify(payload),'utf8');
 if(bytes>60000)throw fail('COMPARISON_INPUT_TOO_LARGE');
 const amount=Math.ceil((bytes*2+4096)*5+2400*20); // micro-USD, upper rates
 if(amount>MICRO)throw fail('COMPARISON_REQUEST_LIMIT');
 return amount;
}
async function reserve(db,payload,env,now=new Date(),namespace='aiComparison'){
 const expires=Date.parse(env.AI_COMPARE_APPROVED_UNTIL || '');
 if(!Number.isFinite(expires)||+now>=expires)throw fail('COMPARISON_APPROVAL_EXPIRED');
 const daily=cap(env.AI_COMPARE_DAILY_USD,5),monthly=cap(env.AI_COMPARE_MONTHLY_USD,20),total=cap(env.AI_COMPARE_TOTAL_USD,20);
 const date=new Date(+now+9*3600000).toISOString().slice(0,10),amount=reserveAmount(payload);
 const refs=[db.collection(namespace+'Budgets').doc('day-'+date),db.collection(namespace+'Budgets').doc('month-'+date.slice(0,7)),db.collection(namespace+'Budgets').doc('total')];
 const event=db.collection(namespace+'Calls').doc(randomUUID());
 await db.runTransaction(async tx=>{
  const snaps=await Promise.all(refs.map(ref=>tx.get(ref)));
  const totals=snaps.map(s=>s.exists?s.data().reserved_microusd:0);
  if(totals.some(n=>!Number.isSafeInteger(n)||n<0))throw fail('COMPARISON_LEDGER_INVALID');
  if(totals[0]+amount>daily||totals[1]+amount>monthly||totals[2]+amount>total)throw fail('COMPARISON_BUDGET_EXHAUSTED');
  refs.forEach((ref,i)=>tx.set(ref,{reserved_microusd:totals[i]+amount}));
  tx.set(event,{reserved_microusd:amount,state:'reserved',created_at:now.toISOString()});
 });
 return {event,amount};
}
module.exports={reserve,reserveAmount,cap};
