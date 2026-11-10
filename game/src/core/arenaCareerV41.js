/**
 * Persistent V4.1 career checkpoint schema. Only the successful, already
 * committed match snapshot is authoritative. Active rounds are replayed with
 * the SAME event seed upon reload; no unsubmitted cut is treated as a win.
 */
const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
export const CAREER_VERSION=1;
const clone=x=>JSON.parse(JSON.stringify(x));
export function makeCareerV41(){
  return {version:CAREER_VERSION,national:{active:null},apex:{active:null},migration:{version:1,applied:false}};
}
export function normalizeCareerV41(raw){
  const s=isObject(raw)?raw:{},defaults=makeCareerV41();
  const out={...s,version:CAREER_VERSION};
  for(const type of ['national','apex']){
    const v=isObject(s[type])?s[type]:{};
    const active=isObject(v.active) && typeof v.active.id==='string' &&
      v.active.kind===type && Array.isArray(v.active.rounds) ? clone(v.active):null;
    out[type]={...v,active};
  }
  out.migration={...defaults.migration,...(isObject(s.migration)?s.migration:{})};
  return out;
}
export function recoverCareerMatch(snapshot){
  if(!isObject(snapshot)||!['national','apex'].includes(snapshot.kind) ||
    !Array.isArray(snapshot.rounds))return null;
  const m=clone(snapshot);
  if(m.done)return m; // pending settlement can be retried without duplicating trophies
  for(let i=0;i<m.rounds.length;i++){
    const r=m.rounds[i];
    if(r.status!=='active')continue;
    // A browser interruption never grants a free roll of the event seed.
    r.status='pending';
    if(m.kind==='national')r.roundMatch=null;
    else {r.match=null;r.result=null;}
  }
  const pending=m.rounds.findIndex(r=>r.status==='pending');
  if(pending>=0)m.roundIndex=pending;
  return m;
}
export function validateCareerCheckpoint(kind,match){
  return ['national','apex'].includes(kind)&&isObject(match)&&
    match.kind===kind&&typeof match.id==='string'&&match.id.length>0&&
    Array.isArray(match.rounds)&&match.rounds.length===(kind==='national'?5:3)&&
    match.roundIndex>=0&&match.roundIndex<=match.rounds.length;
}
