'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Solar,LunarUtil}=require('lunar-javascript');
const {calc}=require('../lib/relationship-report-periods');
const {between,groups}=require('../lib/wealth-interactions');

test('pair conventions preserve composite pairs and do not imply transformation',()=>{
  const pairs=(a,b)=>between('원국',a,'월운',b).map(link=>link.split(' ').at(-1)).sort();
  assert.deepEqual(pairs('乙未','庚戌'),['천간합','파','형'].sort());
  assert.deepEqual(pairs('庚辰','庚戌'),['충']);
  assert.deepEqual(pairs('丙寅','辛亥'),['육합','천간합','파'].sort());
  assert.deepEqual(pairs('乙酉','丙戌'),['해']);
  assert.deepEqual(groups({day:'丙寅',month:'丙午'},['庚戌']),['寅午戌 삼합']);
  assert.deepEqual(groups({day:'丙寅',month:'乙卯'},['庚辰']),['寅卯辰 방합']);
  assert.deepEqual(groups({day:'丙寅'},['庚辰']),[]);
});

test('rank trace, same-score tie ordering, and archived chapter ranking',()=>{
  const pillars={year:'己巳',month:'丙子',day:'丙寅',hour:'乙未'};
  for(const topic of ['seohwa','ijun','mujin']){
    const args=[Solar,LunarUtil,pillars,'1990-01-01',{gender:'female',hourValue:'14'},topic];
    const current=calc(...args),archived=calc(...args,{rankVersion:7});
    assert(!archived.currentRanking);
    assert(current.currentRanking);
    assert.equal(current.calendar[9].assessment.main.fact,'대운지 辰·월운지 戌 충');
    assert(current.calendar[9].assessment.candidates.some(c=>c.fact==='시지 未·월운지 戌 형'));
    for(const {rows,key} of current.highlights){
      assert(rows.length<=3);
      for(const [i,r] of rows.entries()){
        const {score,fact}=r.assessment.axes[key];
        assert(r.assessment.candidates.some(c=>c.fact===fact));
        if(i){const prev=rows[i-1];assert(prev.assessment.axes[key].score>score||prev.assessment.axes[key].score===score&&prev.month<r.month);}
      }
    }
    assert.deepEqual(current.calendar[1].spans.map(s=>[s.annual,s.pair]),[['丙午','辛丑'],['丁未','壬寅']]);
  }
});
