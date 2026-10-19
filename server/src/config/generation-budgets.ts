import * as fs from 'fs';
import * as path from 'path';
import {resolveDataDir} from './data-dir';
export const GENERATION_BUDGET_DEFAULTS={reviewGroupingMode:0,structuredOutputTokens:131072,structuredOutputCeiling:393216,sourceMaxPhysicalCalls:12,presentationMaxPhysicalCalls:24,premiseReselectionMaxCalls:12,sourceBatchSize:3,presentationBatchSize:2,complexTimeoutMs:1200000};
export type GenerationBudgets=typeof GENERATION_BUDGET_DEFAULTS;
export const GENERATION_BUDGET_RANGES:Record<keyof GenerationBudgets,[number,number]>={reviewGroupingMode:[0,1],structuredOutputTokens:[1024,393216],structuredOutputCeiling:[1024,393216],sourceMaxPhysicalCalls:[1,200],presentationMaxPhysicalCalls:[1,200],premiseReselectionMaxCalls:[1,200],sourceBatchSize:[1,20],presentationBatchSize:[1,20],complexTimeoutMs:[60000,3600000]};
export function validateGenerationBudgets(value:unknown):GenerationBudgets{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('生成预算须为配置对象');
 const input=value as Record<string,unknown>,next={...GENERATION_BUDGET_DEFAULTS};
 for(const key of Object.keys(input)){
  if(!Object.prototype.hasOwnProperty.call(GENERATION_BUDGET_RANGES,key))throw Error('未知生成预算字段：'+key);
  const field=key as keyof GenerationBudgets,n=input[field],range=GENERATION_BUDGET_RANGES[field];
  if(typeof n!=='number'||!Number.isInteger(n)||n<range[0]||n>range[1])throw Error(field+'须为'+range.join('—')+'之间的整数');next[field]=n;
 }
 if(next.structuredOutputTokens>next.structuredOutputCeiling)throw Error('首轮输出额度不能超过恢复输出上限');return next;
}
export function readGenerationBudgets():GenerationBudgets{
 const file=path.join(resolveDataDir(),'generation-budgets.json');
 return fs.existsSync(file)?validateGenerationBudgets(JSON.parse(fs.readFileSync(file,'utf8'))):{...GENERATION_BUDGET_DEFAULTS};
}
export function saveGenerationBudgets(value:unknown):GenerationBudgets{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('生成预算须为配置对象');
 const next=validateGenerationBudgets({...readGenerationBudgets(),...(value as object)}),file=path.join(resolveDataDir(),'generation-budgets.json');
 fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(next,null,2));fs.renameSync(temp,file);return next;
}
/** Official DeepSeek /models lists 393216 output tokens for deepseek-flash. Other models keep their existing configured limit. */
export function generationOutputBounds(model:string,requested:number,settings=readGenerationBudgets()){
 if(model!=='deepseek-flash')return {initial:requested,ceiling:32768};
 return {initial:Math.min(settings.structuredOutputCeiling,Math.max(requested,settings.structuredOutputTokens)),ceiling:settings.structuredOutputCeiling};
}
