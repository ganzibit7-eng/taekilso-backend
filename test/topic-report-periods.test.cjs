'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Solar,LunarUtil}=require('lunar-javascript');
const {calculate,flow}=require('../lib/newyear-calculation');
const {calc}=require('../lib/relationship-report-periods');
const {reports}=require('../lib/seohwa-report');
const dates=[[1990,1,1],[1994,6,15],[1985,2,4],[2000,8,17],[1981,11,12],[1978,4,8],[1999,12,23],[1992,3,20],[1988,5,5],[2003,9,30],[1972,5,9],[2001,2,4],[1996,7,17],[1984,10,28],[1970,12,7],[2004,2,4],[2002,12,16],[2007,7,15],[1993,10,17],[1968,6,14]];
const advisors=['seohwa','ijun','mujin'];
const stamp=(y,m,d)=>[y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
const getAxis=data=>data.calendar.map(x=>[x.month,x.pair,x.top,x.hidden,x.links,x.solarFrom,x.solarUntil]);
const getYears=data=>data.years.map(x=>[x.year,x.pair,x.cycles]);
const monthlySignatures=new Map(advisors.map(advisor=>[advisor,new Set()]));
for(const [i,[y,m,d]] of dates.entries())test('topic report period facts '+stamp(y,m,d),()=>{
  const profile={y,m,d,calType:'solar',gender:i%2?'male':'female',hourValue:i%3===2?'unknown':'14'};
  const birth=stamp(y,m,d);
  const known=calculate(profile,{outlookYears:10,preciseCycles:true});
  const view=advisors.map(advisor=>{
    const service=reports.get(advisor);
    const first=service.calculate(service.validate({profile,choice:0})),other=service.calculate(service.validate({profile,choice:1}));
    assert.deepEqual(first.context.pillars,other.context.pillars);
    assert.equal(first.first.highlight,other.first.highlight);
    assert.deepEqual(first.excerpts,[]);
    const a=calc(Solar,LunarUtil,first.context.pillars,birth,profile,advisor);
    assert.deepEqual(a,calc(Solar,LunarUtil,other.context.pillars,birth,profile,advisor));
    assert.equal(a.calendar.length,12);assert.equal(a.years.length,10);
    for(const [j,row] of a.calendar.entries()){
      assert.deepEqual(row.spans.map(s=>[s.from,s.until,s.pair,s.annual]),
        known.months[j].segments.map(s=>[s.from,s.untilExclusive,s.monthGanZhi,s.yearGanZhi]));
      assert(row.solarFrom<=row.from&&row.solarUntil>=row.until);
      assert(row.top&&row.hidden);
      assert.equal(Object.values(row.insight).length,4);
      assert(Object.values(row.insight).every(Boolean));
      assert(row.insight.opportunity.includes(row.top));
      assert(row.cycles.every(c=>c.from>=row.from&&c.until<=row.until));
      if(profile.hourValue==='unknown')assert.equal(row.cycles.length,0);
    }
    const distinct=new Set(a.calendar.map(row=>row.insight.basis+' '+row.insight.opportunity));
    assert(distinct.size>=10);
    monthlySignatures.get(advisor).add(JSON.stringify(a.calendar.map(row=>row.insight)));
    assert.deepEqual(a.horizons.map(row=>[row.from,row.through]),[[2027,2029],[2027,2031],[2027,2036]]);
    assert(a.horizons.every(row=>[...row.opportunity,...row.attention,...row.transitions].every(year=>year>=row.from&&year<=row.through)));
    for(const row of a.years)assert.equal(row.pair,flow(Date.UTC(row.year,6,1),first.context.pillars.day[0]).yearGanZhi);
    if(profile.hourValue==='unknown')assert(a.years.every(y=>!y.cycles.length));
    return {a,first};
  });
  for(const {a,first} of view){
    assert.deepEqual(first.context.pillars,view[0].first.context.pillars);
    assert.deepEqual(getAxis(a),getAxis(view[0].a));
    assert.deepEqual(getYears(a),getYears(view[0].a));
  }
  assert.equal(new Set(view.map(({first})=>first.first.title)).size,3);
  for(const j of view[0].a.calendar.keys())assert.equal(new Set(view.map(({a})=>a.calendar[j].insight.opportunity)).size,3);
  if(i===0){
    const a=view[0].a;
    assert.deepEqual([a.calendar[0].affinity,a.calendar[0].adjustment,a.calendar[7].adjustment],[2,1,2]);
    assert.equal(a.calendar[7].solarUntil,'2027-09-08 05:28:28 KST');
    assert.equal(a.years[4].cycles.find(c=>c.pair==='辛巳').transition,'2031-06-19 08:00:00 KST');
    assert.deepEqual(a.years[4].cycles.map(c=>c.pair),['庚辰','辛巳']);
    assert.deepEqual(a.calendar[1].spans.map(s=>s.annual),['丙午','丁未']);
    assert.match(a.calendar[1].spans[1].from,/^2027-02-04 10:46:/);
  }
});
test('different natal charts uniquely personalize the monthly reading in each topic',()=>{
  for(const signatures of monthlySignatures.values())assert.equal(signatures.size,dates.length);
});
