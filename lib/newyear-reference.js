'use strict';
const stems='甲乙丙丁戊己庚辛壬癸',branches='子丑寅卯辰巳午未申酉戌亥',sKo=['갑','을','병','정','무','기','경','신','임','계'],bKo=['자','축','인','묘','진','사','오','미','신','유','술','해'];
const terms={'劫财':'겁재','比肩':'비견','食神':'식신','伤官':'상관','偏财':'편재','正财':'정재','七杀':'편관','正官':'정관','偏印':'편인','正印':'정인'};
function ganzi(value){return sKo[stems.indexOf(value[0])]+bKo[branches.indexOf(value[1])]+'('+value+')';}
function stamp(value){return value.replace(/^(\d{4})-(\d+)-(\d+) (\d+):(\d+):(\d+) KST$/,(_,y,m,d,h,min,sec)=>`${y==='2027'?'':y+'년 '}${Number(m)}월 ${Number(d)}일 ${Number(h)}시 ${min}분 ${sec}초`);}
function monthNote(month){return month.segments.map(s=>`${stamp(s.from)}부터 ${stamp(s.untilExclusive)} 전까지: ${ganzi(s.monthGanZhi)} 월간지 · 월간 십성 ${terms[s.monthStemTenGod]||s.monthStemTenGod} · ${ganzi(s.yearGanZhi)} 세운`).join('\n');}
function natalNote(chart){const candidate=chart.candidates[0],labels={year:'연주',month:'월주',day:'일주',hour:'시주'},facts=Object.entries(candidate.pillars).filter(([slot,p])=>chart.candidates.every(c=>c.pillars[slot]?.ganZhi===p.ganZhi)).map(([slot,p])=>labels[slot]+' '+ganzi(p.ganZhi));return '확인된 원국: '+facts.join(' · ')+(chart.candidates.length>1?'\n출생 시각에 따라 연·월주 후보가 달라져 확정하지 않았습니다.':'')+'\n'+(chart.profile.hour==='unknown'?'출생시간 미상으로 시주는 포함하지 않았습니다.':'출생 분이 없어 선택한 시간 구간 기준으로 살펴봅니다.');}
module.exports={ganzi,monthNote,natalNote};
