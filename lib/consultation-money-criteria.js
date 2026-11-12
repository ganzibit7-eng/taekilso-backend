'use strict';
// A model must not fill unknown living costs or employment gaps with numbers.
// Preserve personal source paragraphs; replace only the financial plan when it
// invents amounts or declares an emergency fund sufficient without context.
function bound(out,memory,topic){
 if(topic!=='money'||!out||!Array.isArray(out.blocks))return out;
 const quotes=(memory.user_statements||[]).map(s=>s.quote).join('\n');
 if(!/저축|비상금|월급|생활비/.test(quotes))return out;
 const amounts=t=>[...t.matchAll(/\d[\d,]*(?:\.\d+)?\s*(?:억\s*원|만\s*원|원)/g)].map(m=>m[0].replace(/[\s,]/g,''));
 const known=new Set(amounts(quotes));
 const advice=JSON.stringify({blocks:out.blocks.filter(b=>b.kind==='practical_suggestion'),options:out.options,actions:out.actions});
 if(!amounts(advice).some(n=>!known.has(n))&&!/비상금[^.!?\n]{0,35}충분/.test(advice))return out;
 const practical={kind:'practical_suggestion',title:'금액을 정하는 기준',text:'먼저 월 수입에서 고정지출, 실제 변동 생활비, 이미 예정된 준비 비용을 빼 보세요. 그 남는 범위가 저축액을 검토할 출발점입니다. 현재 보유한 비상금과 앞으로 추가로 모을 목표액은 구분해야 합니다. 소득 공백이 예상된다면 실제로 필요한 생활비와 확인된 공백 기간을 대조하세요. 기간이나 비용을 아직 모르면 특정 저축액이나 비상금이 충분하다고 정하지 않고, 확인된 비용부터 별도로 남겨두는 기준을 세울 수 있어요.',person_id:null,candidate_ids:[],assessment_ids:[],context_ids:[],evidence:[]};
 return {...out,blocks:[...out.blocks.filter(b=>b.kind!=='practical_suggestion'),practical].slice(0,5),options:[{label:'소득 공백과 필요한 비용이 확인된 경우',suitable_when:'다음 소득이 들어오는 시점과 그때까지 필요한 생활비를 확인했을 때',tradeoff:'생활비를 남겨둔 만큼 당장 저축하거나 새 준비에 쓸 수 있는 금액은 줄어듭니다.',next_action:'이미 가진 비상금으로 충당할 몫과 추가로 필요한 몫을 나눈 뒤, 추가 목표액을 실제 남은 기간으로 나누어 감당 가능한지 비교하세요.'},{label:'기간이나 비용이 아직 미정인 경우',suitable_when:'다음 소득 시점이나 변동 생활비가 정해지지 않았을 때',tradeoff:'저축 목표를 곧바로 확정하기 어렵지만, 임의의 숫자 때문에 생활비가 부족해지는 결정을 피할 수 있습니다.',next_action:'먼저 확인해야 할 조건을 적고, 그 조건이 확인될 때까지 새로 약속할 지출의 범위를 정해 보세요.'}],actions:['실제 변동 생활비와 예정된 준비 비용을 구분해 적어보세요.','소득이 끊기는 기간이 있는지 확인한 뒤, 남길 금액과 추가 저축 목표를 구분하세요.']};
}
module.exports={bound};
