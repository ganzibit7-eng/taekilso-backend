'use strict';
const {Solar,Lunar,LunarUtil}=require('lunar-javascript');
const crypto=require('node:crypto');
const YEAR=2027;
const hour=3600000;
const toClock=(ms,offset)=>new Date(ms+offset*hour).toISOString().replace('T',' ').slice(0,19);
const kst=ms=>toClock(ms,9)+' KST';
const engine=ms=>{const d=new Date(ms+8*hour);return Solar.fromYmdHms(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate(),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds());};
const engineMs=solar=>Date.parse(solar.toYmdHms().replace(' ','T')+'+08:00');
const fail=()=>{throw Object.assign(new Error('생년월일과 출생시간을 다시 확인해 주세요.'),{code:'NEWYEAR_PROFILE_REQUIRED'});};
function normalizeProfile(input){
  if(!input||typeof input!=='object')fail();
  const y=Number(input.y),m=Number(input.m),d=Number(input.d);
  if(!Number.isInteger(y)||y<1900||y>2027||!Number.isInteger(m)||m<1||m>12||!Number.isInteger(d)||d<1||d>31)fail();
  const calType=input.calType==='lunar'?'lunar':'solar';
  const gender=['male','female'].includes(input.gender)?input.gender:'unknown';
  const hasHour=input.hourValue!==undefined&&input.hourValue!==null&&input.hourValue!==''&&input.hourValue!=='unknown';
  const hh=hasHour?Number(input.hourValue):12;
  if(!Number.isInteger(hh)||hh<0||hh>23)fail();
  let solar;
  try{
    solar=calType==='lunar'?Lunar.fromYmd(y,input.isLeap?-m:m,d).getSolar():Solar.fromYmd(y,m,d);
    if(calType==='solar'&&(solar.getYear()!==y||solar.getMonth()!==m||solar.getDay()!==d))fail();
    if(calType==='lunar'){const back=solar.getLunar();if(back.getYear()!==y||back.getMonth()!==(input.isLeap?-m:m)||back.getDay()!==d)fail();}
  }catch(_){fail();}
  const date=solar.toYmd();
  const check=new Date(date+'T00:00:00Z');if(!Number.isFinite(+check)||check.toISOString().slice(0,10)!==date)fail();
  const birthMs=Date.parse(date+'T'+String(hh).padStart(2,'0')+':00:00+09:00');
  return {name:String(input.name||'상담자').slice(0,20),y,m,d,calType,isLeap:calType==='lunar'&&!!input.isLeap,hourValue:hasHour?String(hh):'unknown',gender,date,birthMs};
}
function fingerprint(p){return crypto.createHash('sha256').update([p.date,p.hourValue,p.gender].join('|')).digest('hex');}
function flow(ms,dayGan){const lunar=engine(ms).getLunar(),gz=lunar.getYearInGanZhiExact(),month=lunar.getMonthInGanZhiExact();return {yearGanZhi:gz,monthGanZhi:month,yearStemTenGod:LunarUtil.SHI_SHEN[dayGan+gz[0]],monthStemTenGod:LunarUtil.SHI_SHEN[dayGan+month[0]]};}
function calculate(input){
  const profile=normalizeProfile(input),local=Solar.fromYmdHms(...profile.date.split('-').map(Number),Number(profile.hourValue==='unknown'?12:profile.hourValue),0,0).getLunar().getEightChar();
  const ec=engine(profile.birthMs).getLunar().getEightChar();ec.setSect(2);local.setSect(2);
  const dayGan=local.getDayGan(),knownHour=profile.hourValue!=='unknown';
  const pillars={year:ec.getYear(),month:ec.getMonth(),day:local.getDay()};if(knownHour)pillars.hour=local.getTime();
  const limitations=['전통 명리 해석을 위한 계산이며 사건·수익·질병 등을 확정적으로 예언하지 않습니다.','출생지의 경도·진태양시와 과거 서머타임 보정은 적용하지 않습니다.'];
  let daewoon=null;
  if(knownHour&&profile.gender!=='unknown'){
    const yun=ec.getYun(profile.gender==='male'?1:0,2);
    daewoon={direction:yun.isForward()?'순행':'역행',start:kst(engineMs(yun.getStartSolar())),cycles:yun.getDaYun(14).filter(x=>x.getStartYear()<=YEAR+1&&x.getEndYear()>=YEAR-1).map(x=>({startYear:x.getStartYear(),endYear:x.getEndYear(),ganZhi:x.getGanZhi()||'대운 시작 전',stemTenGod:x.getGanZhi()?LunarUtil.SHI_SHEN[dayGan+x.getGanZhi()[0]]:null}))};
  }else limitations.push('출생시간 또는 성별이 확인되지 않아 대운 시작 시점·방향은 산출하지 않았습니다. 제공된 세운·월운과 확인된 원국 범위에서 해석합니다.');
  if(!knownHour){
    limitations.push('출생시간 미상: 시주는 제외했습니다.');
    const start=Date.parse(profile.date+'T00:00:00+09:00'),end=start+24*hour-1000;
    const a=flow(start,dayGan),b=flow(end,dayGan);
    if(a.yearGanZhi!==b.yearGanZhi||a.monthGanZhi!==b.monthGanZhi)limitations.push('출생일이 절기 경계일이므로 연주·월주는 출생시간에 따라 달라질 수 있습니다. 시기 해석을 확정하지 않습니다.');
  }
  const table=Solar.fromYmd(YEAR,6,1).getLunar().getJieQiTable();
  const names=new Set(['小寒','立春','惊蛰','清明','立夏','芒种','小暑','立秋','白露','寒露','立冬','大雪']);
  const boundaries=Object.entries(table).filter(([name])=>names.has(name)).map(([name,s])=>({name,ms:engineMs(s)})).filter(x=>toClock(x.ms,9).startsWith(String(YEAR))).sort((a,b)=>a.ms-b.ms);
  const months=Array.from({length:12},(_,i)=>{
    const start=Date.UTC(YEAR,i,1)-9*hour,end=Date.UTC(YEAR,i+1,1)-9*hour;
    const points=[start,...boundaries.filter(x=>x.ms>start&&x.ms<end).map(x=>x.ms),end];
    return {month:i+1,segments:points.slice(0,-1).map((t,j)=>({from:kst(t),untilExclusive:kst(points[j+1]),...flow(t+1000,dayGan)}))};
  });
  return {year:YEAR,profile:{name:profile.name,date:profile.date,hourValue:profile.hourValue,gender:profile.gender},profileHash:fingerprint(profile),calculation:{engine:'lunar-javascript 1.7.5',timeZone:'Asia/Seoul',convention:'절기 시각은 엔진 UTC+8에서 한국시간 UTC+9로 변환. 연주·월주는 절기 경계, 일주·시주는 입력된 한국 표준시와 자정 일자 구분(sect 2).'},pillars,dayGan,annual:{ganZhi:'丁未',stemTenGod:LunarUtil.SHI_SHEN[dayGan+'丁'],stemElement:LunarUtil.WU_XING_GAN['丁'],branchElement:LunarUtil.WU_XING_ZHI['未'],startsAt:kst(boundaries.find(x=>x.name==='立春').ms),note:'1월 1일부터 입춘 전까지는 丙午 세운이며, 입춘부터 丁未 세운입니다.'},daewoon,months,limitations};
}
module.exports={YEAR,calculate,normalizeProfile,fingerprint,flow,kst};
