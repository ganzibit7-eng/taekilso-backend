'use strict';
const {all}=require('./featured-report-core');
const {createReport}=require('./featured-report');
const reports=new Map(all.map(reading=>[reading.id,createReport(reading)]));

module.exports={...reports.get('seohwa'),reports};
