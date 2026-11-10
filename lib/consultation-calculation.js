'use strict';
// The free report's existing arithmetic is deliberately retained, not replaced
// by the richer EightChar engine. The two layers have different meanings.
const {Solar,LunarUtil}=require('lunar-javascript');
const {normalizeProfile,fingerprint,calculate:annualCalculation}=require('./newyear-calculation');
const VERSION='taekil-basic-1/lunar-javascript-1.7.5/kst-sect2-1';
const STEMS='甲乙丙丁戊己庚辛壬癸',BRANCHES='子丑寅卯辰巳午未申酉戌亥';
const KST=9*3600000,DAY=86400000;
const generates={목:'화',화:'토',토:'금',금:'수',수:'목'},overcomes={목:'토',토:'수',수:'화',화:'금',금:'목'};
const base={목:{strength:'성장·기획·관계 확장',watch:'과속과 감정적인 결정'},화:{strength:'표현·추진·주도성',watch:'충동적인 선택과 소진'},토:{strength:'안정·실무·신뢰',watch:'변화를 너무 늦게 받아들이는 것'},금:{strength:'판단·기준·정리',watch:'지나친 완벽주의'},수:{strength:'유연함·정보·직관',watch:'결정 미루기'}};
function dayIndex(date){const n=Math.round((Date.parse(date+'T00:00:00Z')-Date.UTC(1984,1,2))/DAY);return ((n+2)%60+60)%60;}
function element(date){return ['목','목','화','화','토','토','금','금','수','수'][dayIndex(date)%10];}
function basic(date,today){const idx=dayIndex(date),oh=element(date),t=element(today);const rel=(generates[oh]===t||generates[t]===oh)?'상생 흐름':(overcomes[oh]===t||overcomes[t]===oh)?'속도 조절':'균형 흐름';return {version:'taekil-basic-1',referenceDate:today,day:STEMS[idx%10]+BRANCHES[idx%12],element:oh,relation:rel,score:Math.max(50,Math.min(92,65+(idx*7%21)+(rel==='상생 흐름'?8:rel==='속도 조절'?-5:0))),...base[oh]};}
function eight(date,h,m){const ss=m===59?59:0;const ms=Date.parse(date+'T'+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0')+'+09:00');const engineClock=new Date(ms-3600000+KST);const ec=Solar.fromYmdHms(engineClock.getUTCFullYear(),engineClock.getUTCMonth()+1,engineClock.getUTCDate(),engineClock.getUTCHours(),engineClock.getUTCMinutes(),engineClock.getUTCSeconds()).getLunar().getEightChar();ec.setSect(2);const local=Solar.fromYmdHms(...date.split('-').map(Number),h,m,ss).getLunar().getEightChar();local.setSect(2);return {ec,local};}
function pillar(ec,slot,dayGan){const g=ec['get'+slot](),hidden=ec['get'+slot+'HideGan']();return {ganZhi:g,stemElement:LunarUtil.WU_XING_GAN[g[0]],branchElement:LunarUtil.WU_XING_ZHI[g[1]],stemTenGod:slot==='Day'?'日主':LunarUtil.SHI_SHEN[dayGan+g[0]],branchTenGods:hidden.map(stem=>LunarUtil.SHI_SHEN[dayGan+stem]),hiddenStems:hidden};}
function chart(input,index,today){
 if(input?.calType==='lunar'&&typeof input.isLeap!=='boolean')throw new Error('LUNAR_LEAP_SELECTION_REQUIRED');
 const p=normalizeProfile(input),personId='person-'+(index+1),chartId=personId+'-'+fingerprint(p).slice(0,12),variants=new Map();
 // Hour-only input is an interval, not an invented exact minute. Unknown hour
 // covers the full civil day. Sampling both ends of every hour detects JieQi
 // changes inside an hour without supplying an unknown hour pillar.
 for(const h of p.hourValue==='unknown'?Array.from({length:24},(_,i)=>i):[Number(p.hourValue)])for(const minute of [0,59]){
  const {ec,local}=eight(p.date,h,minute),dg=local.getDayGan();const pillars={year:pillar(ec,'Year',dg),month:pillar(ec,'Month',dg),day:pillar(local,'Day',dg)};
  if(p.hourValue!=='unknown')pillars.hour=pillar(local,'Time',dg);
  variants.set(JSON.stringify(pillars),pillars);
 }
 const facts=[],candidates=[...variants.values()].map((pillars,i)=>({id:'p'+(index+1)+'-c'+(i+1),pillars}));
 function add(candidateId,path,value,label){const id='p'+(index+1)+'.'+(candidateId==='common'?'common':candidateId.split('-').at(-1))+'.'+path;facts.push({id,person_id:personId,chart_id:chartId,candidate_id:candidateId,path,value,label,source_version:VERSION});return id;}
 for(const candidate of candidates)for(const [slot,value]of Object.entries(candidate.pillars))add(candidate.id,'pillars.'+slot,value,{year:'연주',month:'월주',day:'일주',hour:'시주'}[slot]);
 if(candidates.length>1)for(const [slot,value]of Object.entries(candidates[0].pillars))if(candidates.every(c=>JSON.stringify(c.pillars[slot])===JSON.stringify(value)))add('common','pillars.'+slot,value,'모든 후보에 공통인 '+{year:'연주',month:'월주',day:'일주',hour:'시주'}[slot]);
 const free=basic(p.date,today),freeId=add('common','basic_report',free,'기존 기본 리포트 계산');
 const limitations=['출생지 경도·진태양시·과거 서머타임은 보정하지 않았습니다.','강약·용신·격국·합충형해·신살의 개인별 판정 및 검수된 전문 해석 규칙은 제공되지 않았습니다.','기본 리포트 점수는 기존 서비스의 단순 비교 지표이며 확률·성공률이 아닙니다.'];
 if(p.hourValue==='unknown')limitations.push('출생시간 미상: 시주를 제외했으며 절기 경계일의 연주·월주 후보를 확정하지 않습니다.');else limitations.push('출생 시각은 선택한 한 시간 구간으로 처리하며 분·초는 알려져 있지 않습니다.');
 if(candidates.length>1)limitations.push('출생 시간 구간 안에서 원국 후보가 갈립니다. 후보별 사실을 섞거나 하나로 확정하지 않습니다.');
 return {person_id:personId,chart_id:chartId,engine_version:VERSION,status:candidates.length>1?'ambiguous':'validated',profile:{date:p.date,hour:p.hourValue,gender:p.gender,calendar:p.calType},calculation_policy:'Asia/Seoul. 절기 엔진 UTC+8→KST; 일주·시주 KST 자정 sect2. 기본 리포트는 별도 legacy 일진 계산 v1 유지.',candidates,facts,interpretation_assessments:[{id:'p'+(index+1)+'.legacy-keywords',person_id:personId,chart_id:chartId,candidate_ids:candidates.map(c=>c.id),method:'기존 기본 리포트 v1의 일진 천간 오행→키워드 표. 전문 검수·강약 판정 아님.',result:{strength:free.strength,watch:free.watch},supporting_fact_ids:[freeId],limitations:['단일 오행의 참고 키워드로만 설명합니다. 개인의 성격·직업·재물 결과를 입증하지 않습니다.']}],limitations};
}
function dateCandidates(message,charts){
 const event=/결혼|예식/.test(message)?'결혼식':/이사/.test(message)?'이사':/개업|창업/.test(message)?'개업':/계약|서명/.test(message)?'계약체결':null;if(!event||!charts.length)return [];
 const matches=[...message.matchAll(/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)];
 const dates=matches.map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
 // Also handle "2026년 12월 3일과 10일" without accepting model-created dates.
 if(matches.length===1){const tail=message.slice(matches[0].index+matches[0][0].length);for(const m of tail.matchAll(/(?:와|과|그리고|[,\s])\s*(\d{1,2})\s*일/g))dates.push(`${matches[0][1]}-${matches[0][2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);}
 const favors={'결혼식':['화','목'],'이사':['토','금'],'개업':['화','목'],'계약체결':['금','토']}[event];
 return [...new Set(dates)].slice(0,8).filter(date=>{try{return new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;}catch(_){return false;}}).map(date=>{
  const idx=dayIndex(date),oh=element(date),people=charts.slice(0,2);let score=0;const reasons=[];
  for(const [i,c]of people.entries()){const user=element(c.profile.date);let s=0;if(oh===user){s++;reasons.push((i?'상대방: ':'')+'본인 기운과 같은 성질의 날');}if(generates[user]===oh||generates[oh]===user){s+=2;reasons.push((i?'상대방: ':'')+'상생 관계');}if(overcomes[user]===oh||overcomes[oh]===user){s-=2;reasons.push((i?'상대방: ':'')+'상극 관계');}if(favors.includes(oh)){s+=1.5;reasons.push((i?'상대방: ':'')+event+'에 어울리는 기운');}score+=s/people.length;}
  const lunar=Solar.fromYmd(...date.split('-').map(Number)).getLunar(),son=[9,0].includes(lunar.getDay()%10);if(son){score+=event==='이사'?2:.8;reasons.push('손없는 날');}const dow=new Date(date+'T00:00:00Z').getUTCDay();score+=((idx*7+dow*3)%11)/11*.3-.15;
  return {id:'date/'+date+'/'+event,person_ids:people.map(c=>c.person_id),chart_ids:people.map(c=>c.chart_id),value:{date,event,ganZhi:STEMS[idx%10]+BRANCHES[idx%12],element:oh,score:Math.round(Math.max(0,Math.min(1,(score+2)/6.3))*100),reasons},method:'기존 택일소 inline 후보 점수 v1. 상대적 참고 지표; 사건 성공확률 아님.'};
 });
}
function build(body,now=new Date(),annualAllowed=false){
 const today=new Date(+now+KST).toISOString().slice(0,10),inputs=Array.isArray(body.subjects)&&body.subjects.length?body.subjects.slice(0,3).map(s=>s&&s.profile):[body.sajuProfile],charts=[],errors=[];
 inputs.forEach((p,i)=>{try{charts.push(chart(p,i,today));}catch(_){errors.push({person_id:'person-'+(i+1),message:'유효한 생년월일·음양력·윤달·시간 정보가 없어 이 대상의 사주는 해석하지 않습니다.'});}});
 const bundle={version:VERSION,reference_date:today,timezone:'Asia/Seoul',charts,errors,approved_rules:[],date_candidates:dateCandidates(String(body.message||''),charts),periods:[]};
 if(charts[0]?.person_id!=='person-1')bundle.date_candidates=[];
 const snapshot=body.reportSnapshot;
 if(snapshot&&charts[0]&&snapshot.birthDate===charts[0].profile.date){
  const reference=String(snapshot.referenceDate||'');
  if(/^\d{4}-\d{2}-\d{2}$/.test(reference)&&Number.isFinite(Date.parse(reference))&&Math.abs(Date.parse(reference)-Date.parse(today))<=2*DAY){
   const expected=basic(charts[0].profile.date,reference),keys=Object.keys(expected);
   if(keys.every(k=>snapshot[k]===expected[k])){charts[0].facts.find(f=>f.path==='basic_report').value=expected;bundle.basic_report_link={status:'server_recomputed_match',version:expected.version,reference_date:reference};}
   else bundle.basic_report_link={status:'mismatch_client_snapshot_ignored',version:'taekil-basic-1'};
  }
 }
 if(annualAllowed&&charts[0]?.person_id==='person-1'){
  const primary=charts[0],c=annualCalculation(inputs[0]),ambiguous=primary.candidates.length>1;
  if(new Set(primary.candidates.map(x=>x.pillars.day.ganZhi)).size===1)bundle.periods.push({id:primary.chart_id+'/2027',person_id:primary.person_id,chart_id:primary.chart_id,candidate_id:ambiguous?'common':primary.candidates[0].id,candidate_ids:primary.candidates.map(x=>x.id),value:{annual:c.annual,months:c.months,daewoon:ambiguous?null:c.daewoon},limitations:[...c.limitations,...(ambiguous?['연·월주 후보가 나뉩니다. 공통 일간 기준 달력 세운·월운만 제공하며 대운/개인별 시기 판정은 보류합니다.']:[])]});
 }
 return bundle;
}
module.exports={VERSION,dayIndex,basic,chart,dateCandidates,build};
