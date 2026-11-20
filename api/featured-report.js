'use strict';
const {reports}=require('../lib/seohwa-report');
const {failure}=require('../lib/account-report');

module.exports=require('../lib/account-report-handler')(async(db,uid,payload)=>{
  if(payload.operation==='list'){
    const groups=await Promise.all([...reports].map(async ([consultantId,service])=>{
      const result=await service.run(db,uid,payload);
      return result.reports.map(item=>({...item,consultantId}));
    }));
    return {reports:groups.flat().sort((a,b)=>b.createdAtMs-a.createdAtMs).slice(0,50)};
  }
  const report=reports.get(payload.consultantId);
  if(!report)throw failure(400,'INVALID_REPORT_CONSULTANT','리포트 상담사를 다시 선택해 주세요.');
  return report.run(db,uid,payload);
},'featured-report');
