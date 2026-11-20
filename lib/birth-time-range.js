/* Shared clock ranges for the guided entry and the server's birth chart. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TaekilBirthTime=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const names=['조자시','축시','인시','묘시','진시','사시','오시','미시','신시','유시','술시','해시','야자시'];
  const time=minute=>String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
  const ranges=names.map((name,index)=>{
    const from=index===0?0:90+(index-1)*120;
    const to=index===12?1439:89+index*120;
    return {value:'range-'+index,name,from,to,pillarHour:index===12?23:index*2,label:name+' ('+time(from)+' ~ '+time(to)+')'};
  });
  const range=value=>typeof value==='string'?ranges.find(item=>item.value===value):undefined;
  const label=value=>range(value)?.label || (/^(?:[01]?\d|2[0-3])$/.test(String(value))?String(value).padStart(2,'0')+'시':'시간 모름');
  function samples(value) {
    const selected=range(value);
    if(selected)return [selected.from,selected.to];
    const hours=value==='unknown'?Array.from({length:24},(_,index)=>index):[Number(value)];
    return hours.flatMap(hour=>[hour*60,hour*60+59]);
  }
  function addOptions(select) {
    const option=(value,text)=>{
      const node=select.ownerDocument.createElement('option');
      node.value=value;node.textContent=text;
      return node;
    };
    select.append(option('unknown','시간 모름'),...ranges.map(item=>option(item.value,item.label)));
    const legacy=select.ownerDocument.createElement('optgroup');
    legacy.label='시 단위로 선택';
    for(let hour=0;hour<24;hour++)legacy.append(option(String(hour),label(hour)));
    select.append(legacy);
  }
  return {ranges,range,label,samples,addOptions};
});
