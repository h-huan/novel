import {jsonrepair} from 'jsonrepair';
/** Remove only an observed empty, valueless member before an object closes.
 * Nonempty anonymous strings, values, findings and quoted text are untouched. */
function removeDanglingEmptyMember(raw:string):string {
 const stack:string[]=[];let quoted=false,escaped=false;
 for(let i=0;i<raw.length;i++) {
  const char=raw[i];
  if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
  if(char==='"'){quoted=true;continue;}
  if(char==='{'||char==='['){stack.push(char);continue;}
  if(char==='}'||char===']'){stack.pop();continue;}
  if(char!==','||stack.at(-1)!=='{')continue;
  const token=raw.slice(i).match(/^,\s*""\s*(?=\})/);
  if(token)return raw.slice(0,i)+raw.slice(i+token[0].length);
 }
 return raw;
}
/** Parse one whole review object, never extract a passing internal fragment. */
export function parseWholeReviewJson(raw:string):any {
 const cleaned=String(raw||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 let value:any;try{value=JSON.parse(cleaned);}catch{
  // Only accept this normalization when it produces one complete valid JSON.
  // It cannot synthesize a missing value or recover a passing inner fragment.
  try{value=JSON.parse(removeDanglingEmptyMember(cleaned));}catch{value=JSON.parse(jsonrepair(cleaned));}
 }
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('评审必须返回单个完整JSON对象');
 return value;
}

/** Recover only the observed missing dimensions-closing brace before issues.
 * No values, findings or incomplete strings are repaired or discarded. */
export function parseScoreReviewJson(raw: string): { value: any; normalized: boolean } {
 let value: any, normalized = false;
 try { value = JSON.parse(raw); } catch (originalError) {
  if (!/^\s*\{\s*"dimensions"\s*:\s*\{/.test(raw)) throw originalError;
  let depth = 0, quoted = false, escaped = false, candidate: string | undefined;
  for (let i = 0; i < raw.length; i++) {
   const char = raw[i];
   if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
   if (char === '"') { quoted = true; continue; }
   if (char === '{' || char === '[') depth++;
   else if (char === '}' || char === ']') depth--;
   else if (char === ',' && depth === 2 && /^,\s*"issues"\s*:/.test(raw.slice(i))) {
    candidate = raw.slice(0, i) + '}' + raw.slice(i); break;
   }
  }
  if (!candidate) throw originalError;
  try { value = JSON.parse(candidate); normalized = true; } catch { throw originalError; }
 }
 if (!value || typeof value !== 'object' || Array.isArray(value)
  || !value.dimensions || typeof value.dimensions !== 'object' || Array.isArray(value.dimensions)) {
  throw new Error('评审协议无效：必须返回 dimensions 评分对象及顶层问题清单');
 }
 if (Object.prototype.hasOwnProperty.call(value.dimensions, 'issues')) {
  if (!Array.isArray(value.dimensions.issues) || value.issues !== undefined) throw new Error('评审协议无效：问题清单层级冲突');
  value.issues = value.dimensions.issues;
  delete value.dimensions.issues;
  normalized = true;
 }
 return { value, normalized };
}
