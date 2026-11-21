'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {reports}=require('../lib/seohwa-report');
const {flow}=require('../lib/newyear-calculation');
const {LunarUtil}=require('lunar-javascript');
const service=reports.get('dogyeom');
const stems='甲乙丙丁戊己庚辛壬癸';
const terms=[['비견','겁재'],['식신','상관'],['편재','정재'],['편관','정관'],['편인','정인']];
function relation(day,other){
  const d=stems.indexOf(day),o=stems.indexOf(other);
  return terms[(Math.floor(o/2)-Math.floor(d/2)+5)%5][(d+o)%2];
}
const dates=[[1990,1,1,'14'],[1994,6,15,'14'],[1985,2,4,'unknown'],[2000,8,17,'8'],[1981,11,12,'unknown'],[1978,4,8,'18'],[1999,12,23,'2'],[1992,3,20,'unknown'],[1988,5,5,'6'],[2003,9,30,'20']];
for(const [y,m,d,hourValue] of dates)test('wealth evidence and calendar '+[y,m,d].join('-'),()=>{
  const input={profile:{y,m,d,hourValue,gender:'female',calType:'solar'},choice:1};
  const c=service.calculate(input).calendar, day=c.pillars.day[0], limit=x=>Math.min(100,Math.max(0,x));
  assert.deepEqual(service.calculate(input).calendar,c);
  if(hourValue==='unknown'){assert(!c.pillars.hour);assert.equal(c.daewoon,null);}
  for(const [slot,pair] of Object.entries(c.pillars)){
    const f=c.natal.find(x=>x.position===({year:'연주',month:'월주',day:'일주',hour:'시주'})[slot]);
    assert.equal(f.visible,slot==='day'?'일간':relation(day,pair[0]));
    assert.deepEqual(f.hidden,LunarUtil.ZHI_HIDE_GAN[pair[1]].map(stem=>relation(day,stem)));
  }
  let end;
  for(const row of c.rows){
    assert.equal(row.term,relation(day,row.ganZhi[0]));
    assert(row.basis.startsWith(row.term+'·'+relation(day,LunarUtil.ZHI_HIDE_GAN[row.ganZhi[1]][0])));
    const {income,retention,risk}=row.components;
    assert.equal(row.score,limit(49+2*income+retention-risk));
    assert.equal(row.expenseScore,limit(18+6*risk));
    assert.equal(row.rank,1+c.rows.filter(r=>r.score>row.score).length);
    for(const seg of row.segments){
      if(end)assert.equal(seg.from,end);
      end=seg.untilExclusive;
      const parse=t=>Date.parse(t.slice(0,19).replace(' ','T')+'+09:00');
      for(const ms of [parse(seg.from),parse(end)-1000]){
        const f=flow(ms,day);assert.equal(f.yearGanZhi,seg.yearGanZhi);assert.equal(f.monthGanZhi,seg.monthGanZhi);
      }
    }
  }
  for(const [kind,field] of [['opportunity','score'],['expense','expenseScore']]){
    assert.deepEqual(c.ranking[kind],c.rows.toSorted((a,b)=>b[field]-a[field]||a.month-b.month).slice(0,3).map(r=>r.month));
  }
  const [before,after]=c.rows[1].segments;
  assert.equal(before.yearGanZhi,'丙午');assert.equal(after.yearGanZhi,'丁未');
  assert.match(after.from,/^2027-02-04 10:46:/);
  for(const h of c.outlook.horizons){
    const range=c.outlook.years.slice(0,h.size);
    assert.equal(range.at(-1).year,2026+h.size);
    assert.equal(h.opportunity,range.toSorted((a,b)=>b.score-a.score)[0].year);
    assert.equal(h.expense,range.toSorted((a,b)=>b.expenseScore-a.expenseScore)[0].year);
  }
});
const {between,toPeriod}=require('../lib/wealth-interactions');
test('관계 표기와 오미합을 원국 위치별로 구분한다',()=>{
  assert.deepEqual(toPeriod({day:'甲午'},'세운','丁未'),['일지 午·세운지 未 육합']);
  assert.deepEqual(between('월','甲子','대운','己午'),['월간 甲·대운간 己 천간합','월지 子·대운지 午 충']);
  assert.deepEqual(between('일','丙辰','월운','庚辰'),['일지 辰·월운지 辰 형']);
  assert(!between('일','丙寅','월운','庚寅').some(x=>x.endsWith('형')));
});
test('10개 원국 무료 첫 장과 대운·세운 교차 확인',()=>{
 const texts=new Set();
 for(const [y,m,d,hourValue] of dates){
   const {first,calendar:c}=service.calculate({profile:{y,m,d,hourValue,gender:'female',calType:'solar'},choice:1});
   assert(first.sections.length>=3);
   texts.add(first.sections.map(x=>x.text).join(' '));
   for(const row of c.outlook.years){
     const active=c.daewoon?.cycles.filter(v=>v.startYear<=row.year&&v.endYear>=row.year)||[];
     assert(active.length<=1);assert.equal(row.cycle?.ganZhi,active[0]?.ganZhi);
     assert.deepEqual(row.relations,toPeriod(c.pillars,'세운',row.ganZhi));
   }
   for(const row of c.rows)assert.deepEqual(row.relations,toPeriod(c.pillars,'월운',row.ganZhi));
   if(hourValue==='unknown')assert(first.sections.some(s=>s.text.includes('시주는 제외')));
 }
 assert.equal(texts.size,dates.length);
});
