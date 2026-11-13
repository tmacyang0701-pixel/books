export const ANALYSIS_MIN_SPAN=15*60*1000,ANALYSIS_MIN_FAILURES=6;
export function analysisDayStart(now=Date.now()){const day=new Date(now);day.setHours(0,0,0,0);return day.getTime();}
// Tokenize before discarding layout, so quoted strings, raw strings and ++ stay distinct.
export function canonicalCode(code){
  const tokens=String(code).match(/(?:u8|[uUL])?R"([^ ()\\\t\r\n]{0,16})\([\s\S]*?\)\1"|(?:u8|[uUL])?"(?:\\[\s\S]|[^"\\])*"|(?:u8|[uUL])?'(?:\\[\s\S]|[^'\\])*'|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z_0-9]*|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[A-Za-z_0-9]*|>>=|<<=|->\*|\.\.\.|::|->|\+\+|--|&&|\|\||==|!=|<=|>=|<<|>>|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|[^\s]/g)||[];
  return tokens.filter(t=>!t.startsWith('//')&&!t.startsWith('/*')).join('\u001f');
}
export async function codeHash(code){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export function attemptOutcome(result,mode){
  // Only a submitted assessment can establish a failed or passed attempt.
  if(mode!=='judge')return null;
  return ['CE','RE','TLE','WA','PARTIAL','AC'].includes(result?.status)?result.status:null;
}
export function analysisProgress(record,now=Date.now(),policy={dailyMinutes:ANALYSIS_MIN_SPAN/60000,failedChanges:ANALYSIS_MIN_FAILURES}){
  // Legacy events do not identify whether they came from Run or Submit; don't
  // treat ambiguous history as proof that an assessment failed.
  const events=(record?.events||[]).filter(e=>e.mode==='judge'&&e.at>=analysisDayStart(now)&&e.at<=now).sort((a,b)=>a.at-b.at);
  const passedAt=events.filter(e=>e.status==='AC').at(-1)?.at??0;
  const seen=new Set([record?.baseline].filter(Boolean)),failures=[];
  for(const event of events){
    if(event.at<=passedAt||seen.has(event.hash))continue;
    seen.add(event.hash);
    if(['CE','RE','TLE','WA','PARTIAL'].includes(event.status))failures.push(event);
  }
  const span=failures.length?Math.max(0,now-failures[0].at):0;
  const stillFailing=['CE','RE','TLE','WA','PARTIAL'].includes(events.at(-1)?.status);
  return {count:failures.length,span,remainingMs:Math.max(0,policy.dailyMinutes*60000-span),eligible:failures.length>=policy.failedChanges&&span>=policy.dailyMinutes*60000&&stillFailing,failures,stillFailing};
}
