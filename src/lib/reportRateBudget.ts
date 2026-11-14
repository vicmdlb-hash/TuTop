export type ReportRateBucket = {uid:string;action:string;window_start:string;count:number;updated_at:string};
export type ReportRateBucketWrite = Omit<ReportRateBucket,'window_start'> & {window_start:Date};
export function nextReportRateBucket(uid:string,at:string,prior:ReportRateBucket|null):ReportRateBucketWrite {
 const now=Date.parse(at);
 if(!uid||!Number.isFinite(now)) throw new Error('REPORT_RATE_CLOCK_INVALID');
 if(prior){
  const start=Date.parse(prior.window_start);
  if(prior.uid!==uid||prior.action!=='report_create'||!Number.isFinite(start)||!Number.isInteger(prior.count)||prior.count<1||prior.count>40||start>now+300000) throw new Error('REPORT_RATE_BUCKET_INVALID');
  if(start>now-3600000){
   // Server-side verified-account multiplier caps reports at 10/20/40.
   // Never attempt 41 in the same hour; lower-tier caps remain server enforced.
   if(prior.count>=40) throw new Error('REPORT_RATE_MAX_REACHED');
   return {uid,action:'report_create',window_start:new Date(prior.window_start),count:prior.count+1,updated_at:at};
  }
 }
 return {uid,action:'report_create',window_start:new Date(at),count:1,updated_at:at};
}
