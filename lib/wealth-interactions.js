(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.TaekilWealthInteractions=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Pair conventions only. A pair never establishes transformation or fortune on its own.
const pairs={
  천간합:'甲己 乙庚 丙辛 丁壬 戊癸',육합:'子丑 寅亥 卯戌 辰酉 巳申 午未',
  충:'子午 丑未 寅申 卯酉 辰戌 巳亥',해:'子未 丑午 寅巳 卯辰 申亥 酉戌',
  파:'子酉 丑辰 寅亥 卯午 巳申 未戌',형:'子卯 寅巳 巳申 申寅 丑戌 戌未 未丑 辰辰 午午 酉酉 亥亥'
};
const slots={year:'연',month:'월',day:'일',hour:'시'};
function between(left,a,right,b){
  const result=[];
  for(const [type,list] of Object.entries(pairs)){
    const stem=type==='천간합',i=stem?0:1;
    if(list.split(' ').some(pair=>pair===a[i]+b[i]||pair===b[i]+a[i])){
      result.push(left+(stem?'간 ':'지 ')+a[i]+'·'+right+(stem?'간 ':'지 ')+b[i]+' '+type);
    }
  }
  return result;
}
function toPeriod(pillars,label,pair){
  return Object.entries(pillars).flatMap(([key,value])=>between(slots[key],value,label,pair));
}
function internal(pillars){
  const entries=Object.entries(pillars);
  return entries.flatMap(([key,value],i)=>entries.slice(i+1).flatMap(([other,v])=>between(slots[key],value,slots[other],v)));
}
return {between,toPeriod,internal};
});
